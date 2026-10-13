'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MapPin, Search } from '../../components/icons';
import { Input } from '../../components/ui/input';
import { AddressSearchBox } from '../../components/AddressSearchBox';
import { DropdownSurface } from '../../components/DropdownSurface';
import { CurrentLocationRow } from './CurrentLocationRow';
import { eventPathIncludes } from '../../lib/event-path';
import { randomId } from '../../lib/random-id';
import { useDropdownAnchor } from '../../lib/use-dropdown-anchor';
import { useVerificationConfig } from '../../context/VerificationConfigContext';
import type { PlaceSuggestion } from '../../services/api';
import { useText } from '../../i18n';

// Screen 1: find the address the way a person holds it — as words. Places
// autocomplete when the platform has it (as-you-type, debounced, one session
// token per typing session — the billing unit), the explicit-submit basic
// search otherwise, and two always-present escapes: current location and
// "place a pin instead". Every path lands on the pin screen.

export interface ResolvedSearch {
  lat: number;
  lng: number;
  houseNumber: string | null;
  road: string | null;
  formatted?: string | null;
  area?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  /** ISO-2 of the hit's own country, when the source knows it. */
  country?: string | null;
}

export function SearchScreen({
  country,
  locationHint,
  near,
  locating,
  onResolved,
  onUseMyLocation,
  onPinInstead,
}: {
  country?: string | null;
  /** The device's resolved current address, shown ON the button. */
  locationHint?: string | null;
  /** The device's resolved coordinates — a ranking bias, so the streets
   *  around the person outrank same-named ones in a bigger city. */
  near?: { lat: number; lng: number } | null;
  /** A fix attempt is still running. */
  locating?: boolean;
  onResolved: (hit: ResolvedSearch) => void;
  onUseMyLocation: () => void;
  onPinInstead: () => void;
}) {
  const config = useVerificationConfig();
  const t = useText();
  const autocomplete = config.serverConfig?.addressSearchMode === 'autocomplete';
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[] | null>(null);
  const session = useRef(randomId());
  const debounce = useRef<number | null>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The house dropdown mechanics (UiSelect's): the panel portals OUT of the
  // dialog and fixes to viewport coordinates, so it floats over everything —
  // the location row, the footer, the modal's own edge — instead of being
  // clipped by the step body's overflow or growing its scroll area.
  const anchor = useDropdownAnchor(suggestions != null, searchWrapRef, {
    width: 'trigger',
    menuRef,
  });

  // A floating panel needs real dismissal: outside click — composedPath-based,
  // the shadow-frame rule, and the PORTALED menu needs its own test — or
  // Escape.
  useEffect(() => {
    if (!suggestions) return;
    const onPointer = (e: Event) => {
      if (eventPathIncludes(e, searchWrapRef.current, menuRef.current)) return;
      setSuggestions(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSuggestions(null);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [suggestions != null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!autocomplete) return;
    if (debounce.current) window.clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions(null);
      return;
    }
    debounce.current = window.setTimeout(() => {
      config.api
        .addressAutocomplete(q, session.current, country ?? undefined, near ?? undefined)
        .then((res) => setSuggestions(res.suggestions))
        .catch(() => setSuggestions([]));
    }, 300);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, autocomplete, country, near?.lat, near?.lng]);

  const pick = async (s: PlaceSuggestion) => {
    setBusy(true);
    try {
      const { place } = await config.api.addressPlace(s.placeId, session.current);
      session.current = randomId(); // a details call closes the session
      onResolved(place);
    } catch {
      setSuggestions([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {autocomplete ? (
        <div ref={searchWrapRef} className="relative">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('address.search.placeholder')}
              className="h-12 rounded-xl pl-9"
              aria-label="Search your address"
              autoFocus
            />
            {busy && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
          {suggestions && anchor.host && createPortal(
            <DropdownSurface menuRef={menuRef}>
              <div
                style={anchor.style}
                className="z-50 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg animate-slide-up"
              >
                <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: anchor.maxHeight }}>
                  {suggestions.length === 0 ? (
                    <p className="px-3 py-2.5 text-sm text-muted-foreground">{t('address.search.noMatches')}</p>
                  ) : (
                    suggestions.map((s) => (
                      <button
                        key={s.placeId}
                        type="button"
                        disabled={busy}
                        onClick={() => void pick(s)}
                        className="flex w-full items-start gap-2 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/50 disabled:opacity-60"
                      >
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium leading-snug">{s.mainText}</span>
                          {s.secondaryText && (
                            <span className="block text-xs text-muted-foreground">{s.secondaryText}</span>
                          )}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </DropdownSurface>,
            anchor.host,
          )}
        </div>
      ) : (
        <AddressSearchBox country={country} onPick={(hit) => onResolved({ ...hit, formatted: hit.label })} />
      )}

      <CurrentLocationRow hint={locationHint ?? null} locating={locating === true} onClick={onUseMyLocation} />

      <button
        type="button"
        onClick={onPinInstead}
        className="mx-auto block w-fit text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {t('address.search.pinInstead')}
      </button>
    </div>
  );
}
