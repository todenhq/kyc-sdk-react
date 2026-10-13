'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MapPin, Search } from './icons';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { DropdownSurface } from './DropdownSurface';
import { eventPathIncludes } from '../lib/event-path';
import { useDropdownAnchor } from '../lib/use-dropdown-anchor';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import type { AddressSearchHit } from '../services/api';
import { useText } from '../i18n';

// The address step's search box — the OkHi flow's best idea, in our order:
// type the address you know ("11 bassey street"), pick a candidate, and the
// pin lands there with the house number prefilled. Search fires on EXPLICIT
// submit only (Enter or the button) — the map source's policy forbids
// autocomplete, and the CAC rule applies: spend the request on the query the
// person meant. Dragging the pin always works; this is a shortcut, never a
// gate, so every failure degrades to "place the pin by hand".
//
// The results panel rides the house dropdown mechanics (UiSelect's):
// portaled out of the dialog, fixed to viewport coordinates, so it floats
// over everything instead of being clipped by the step body's overflow.

export function AddressSearchBox({
  country,
  onPick,
}: {
  country?: string | null;
  onPick: (hit: AddressSearchHit) => void;
}) {
  const config = useVerificationConfig();
  const t = useText();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<AddressSearchHit[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const anchor = useDropdownAnchor(results != null, rootRef, { width: 'trigger', menuRef });

  // A floating panel needs real dismissal: outside click (composedPath-based,
  // the shadow-frame rule; the portaled menu needs its own test) or Escape.
  useEffect(() => {
    if (!results) return;
    const onPointer = (e: Event) => {
      if (eventPathIncludes(e, rootRef.current, menuRef.current)) return;
      setResults(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setResults(null);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [results != null]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = async () => {
    const q = query.trim();
    if (q.length < 3 || searching) return;
    setSearching(true);
    try {
      const res = await config.api.addressSearch(q, country ?? undefined);
      setResults(res.results);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div ref={rootRef} className="relative space-y-2">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void search();
            }
          }}
          placeholder={t('address.search.placeholder')}
          className="h-11 rounded-xl"
          aria-label="Search your address"
        />
        <Button
          variant="outline"
          onClick={() => void search()}
          disabled={query.trim().length < 3 || searching}
          className="h-11 w-11 shrink-0 rounded-xl p-0"
          aria-label="Search"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {results && anchor.host && createPortal(
        <DropdownSurface menuRef={menuRef}>
          <div
            style={anchor.style}
            className="z-50 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg animate-slide-up"
          >
            <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: anchor.maxHeight }}>
              {results.length === 0 ? (
                <p className="px-3 py-2.5 text-sm text-muted-foreground">{t('address.search.noMatches.basic')}</p>
              ) : (
                results.map((hit, i) => (
                  <button
                    key={`${hit.lat},${hit.lng},${i}`}
                    type="button"
                    onClick={() => {
                      setResults(null);
                      setQuery('');
                      onPick(hit);
                    }}
                    className="flex w-full items-start gap-2 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/50"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm leading-snug">{hit.label}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </DropdownSurface>,
        anchor.host,
      )}
    </div>
  );
}
