'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronsUpDown, Search } from './icons';
import { CountryFlag } from './CountryFlag';
import { cn } from '../lib/utils';
import { businessCountryName, groupBusinessCountries } from '../lib/business';
import { groupCountriesByRegion } from '../lib/regions';
import { useDropdownAnchor } from '../lib/use-dropdown-anchor';
import { eventPathIncludes } from '../lib/event-path';
import { DropdownSurface } from './DropdownSurface';
import { useText } from '../i18n';

/**
 * Registry-country picker for the business (KYB) details step: a searchable
 * dropdown grouped by continent, with SVG flags (emoji flags render
 * inconsistently across platforms).
 *
 * The menu is portaled to the dialog root (`.verification-root`) rather than to
 * document.body: Radix Dialog sets `pointer-events: none` on the body while
 * open, so a menu there is unclickable. Staying inside the dialog keeps focus,
 * clicks and scrolling working while clearing the step body's
 * `overflow-y-auto`, which otherwise clips the list. See
 * lib/use-dropdown-anchor.
 */
export function BusinessCountrySelect({
  id,
  countries,
  value,
  onChange,
  groupAll = false,
  defaultCode,
  pinnedLabel,
  disabled,
}: {
  id?: string;
  countries: string[];
  value: string;
  onChange: (code: string) => void;
  /** Group with the FULL ISO region map (person-country pickers) instead of
   *  the business-registry map. */
  groupAll?: boolean;
  /**
   * The country this field was pre-filled with, pinned to the top of the list.
   *
   * In a list of ~240 countries grouped by continent, the answer already in the
   * field can sit hundreds of rows down — so opening the picker to check it
   * meant hunting for it. Pinning shows it without a search.
   */
  defaultCode?: string;
  /**
   * What the pin is, in the user's terms. "Default" when the field arrived
   * holding it; "Your location" when it came from the IP, because a guess we
   * made on somebody's behalf should say so rather than look like a setting.
   */
  pinnedLabel?: string;
  /** Frozen: the register has answered and the workflow locks it. */
  disabled?: boolean;
}) {
  const t = useText();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Full-width field, so the menu matches the control it hangs off.
  const anchor = useDropdownAnchor(open, triggerRef, { width: 'trigger', menuRef });

  // Pinned only while it is one of the countries on offer, and only while it
  // still matches what is being searched for: a pin that ignores the search box
  // is a row that will not go away.
  const pinned = useMemo(() => {
    const code = defaultCode?.trim().toUpperCase();
    if (!code || !countries.includes(code)) return null;
    const q = query.trim().toLowerCase();
    if (q && !businessCountryName(code).toLowerCase().includes(q) && !code.toLowerCase().includes(q)) {
      return null;
    }
    return code;
  }, [defaultCode, countries, query]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = q
      ? countries.filter(
          (code) =>
            businessCountryName(code).toLowerCase().includes(q) || code.toLowerCase().includes(q),
        )
      : countries;
    // Shown pinned above, so it must not also appear in its own continent.
    const rest = pinned ? visible.filter((code) => code !== pinned) : visible;
    if (groupAll) {
      return groupCountriesByRegion(rest).map((g) => ({ label: g.region, countries: g.countries }));
    }
    return groupBusinessCountries(rest, t);
  }, [countries, query, groupAll, pinned, t]);

  // Close on outside click / Escape; focus the search box when opened.
  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      // composedPath, not e.target: the SDK renders in a shadow frame and a
      // document listener sees retargeted events (see lib/event-path.ts). The
      // menu is portaled out of rootRef, so it needs its own test — without
      // it, picking a country would register as an outside click.
      if (eventPathIncludes(e, rootRef.current, menuRef.current)) return;
      setOpen(false);
      setQuery('');
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-label="Country of registration"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-12 w-full items-center gap-2.5 rounded-xl border border-input bg-background px-3 text-left text-base sm:text-sm',
          'ring-offset-background transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          // Reads as settled rather than broken: no hover affordance, and the
          // chevron drops away so nothing invites a click that will not work.
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-accent/40',
        )}
      >
        <CountryFlag code={value} className="h-5 w-5" title={businessCountryName(value)} />
        <span className="flex-1 truncate">{businessCountryName(value)}</span>
        {!disabled && <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />}
      </button>

      {open && anchor.host && createPortal(
        <DropdownSurface menuRef={menuRef}>
          <div
            style={anchor.style}
            className="z-50 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg animate-slide-up"
          >
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('business.country.searchPlaceholder')}
                aria-label="Search countries"
                className="h-11 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
              />
            </div>
            <div className="overflow-y-auto p-1.5" style={{ maxHeight: anchor.maxHeight }}>
              {pinned && (
                <div className="mb-1 border-b border-border pb-1.5">
                  <button
                    type="button"
                    onClick={() => pick(pinned)}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-base transition-colors sm:text-sm',
                      'hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                      pinned === value && 'bg-primary/5 font-medium',
                    )}
                  >
                    <CountryFlag
                      code={pinned}
                      className="h-5 w-5"
                      title={businessCountryName(pinned)}
                    />
                    <span className="truncate">{businessCountryName(pinned)}</span>
                    {/* Says WHY this one is at the top, which "Suggested" would
                        not: it is either the country the field arrived holding,
                        or where the visitor appears to be. */}
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {pinnedLabel ?? t('business.country.pinnedDefault')}
                    </span>
                    {pinned === value && (
                      <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden />
                    )}
                  </button>
                </div>
              )}
              {groups.length === 0 && !pinned ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {t('business.country.noMatch')}
                </p>
              ) : (
                groups.map((group) => (
                  <div key={group.label} className="mb-1 last:mb-0">
                    <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {group.label}
                    </p>
                    {group.countries.map((c) => {
                      const isSelected = c.code === value;
                      return (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => pick(c.code)}
                          className={cn(
                            'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-base transition-colors sm:text-sm',
                            'hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                            isSelected && 'bg-primary/5 font-medium',
                          )}
                        >
                          <CountryFlag code={c.code} className="h-5 w-5" title={c.name} />
                          <span className="flex-1 truncate">{c.name}</span>
                          {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                        </button>
                      );
                    })}
                  </div>
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
