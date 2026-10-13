'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';
import { Check, ChevronsUpDown, Search } from './icons';
import { Input } from './ui/input';
import { CountryFlag } from './CountryFlag';
import { cn } from '../lib/utils';
import { formatNationalNumber } from '../lib/phone-format';
import { useDropdownAnchor } from '../lib/use-dropdown-anchor';
import { eventPathIncludes } from '../lib/event-path';
import { DropdownSurface } from './DropdownSurface';
import { useText } from '../i18n';

// Phone input with a searchable dial-code country picker + as-you-type
// national formatting (libphonenumber-js). Emits the E.164 value and validity.
//
// The dropdown is portaled to the dialog root (`.verification-root`) — NOT to
// document.body, which is where a Radix popover would land: Radix Dialog sets
// `pointer-events: none` on the body while open, so a menu there cannot be
// scrolled or clicked. Staying inside the dialog keeps pointer events and the
// focus trap, while clearing the step body's `overflow-y-auto`, which was
// clipping the list at the footer. See lib/use-dropdown-anchor.

const REGION_NAMES = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

const countryName = (code: string): string => REGION_NAMES?.of(code) ?? code;

// Last resort only, when neither a supplied number nor any country signal
// (including the IP-derived one) says otherwise.
const FALLBACK_COUNTRY = 'NG' as CountryCode;

interface CountryOption {
  code: CountryCode;
  name: string;
  dialCode: string;
}

export interface PhoneNumberInputProps {
  /**
   * An existing E.164 number to show, e.g. one the business register returned.
   *
   * Read ONCE, to seed the control. It is not a controlled input: the field
   * formats as you type, so re-deriving the national part from a prop on every
   * keystroke would fight the caret. Later changes to the prop are ignored, and
   * a value arriving after mount is picked up because the seed is keyed on it.
   */
  value?: string;
  /** Seed the dial-code picker (ISO-2) when `value` carries no country. */
  defaultCountry?: string;
  /**
   * The visitor's IP country. Pinned to the top of the list and tagged, so a
   * guess we made on their behalf is visible AS a guess and one tap away rather
   * than buried at its alphabetical position among two hundred others.
   */
  geoCountry?: string | null;
  disabled?: boolean;
  /** Fires on every edit with the E.164 value ('' until parseable) + validity. */
  onChange: (value: { e164: string; isValid: boolean; country: string }) => void;
}

export function PhoneNumberInput({ value, defaultCountry, geoCountry, disabled, onChange }: PhoneNumberInputProps) {
  const t = useText();
  const options = useMemo<CountryOption[]>(
    () =>
      getCountries()
        .map((code) => ({ code, name: countryName(code), dialCode: `+${getCountryCallingCode(code)}` }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  // A supplied number decides its OWN dial code - it is a fact, where the
  // country prop is a guess. Falls through to the guess when there is no number
  // or it cannot be parsed.
  const supplied = useMemo(() => (value ? parsePhoneNumberFromString(value) : null), [value]);
  const seed = (supplied?.country ?? defaultCountry?.toUpperCase() ?? FALLBACK_COUNTRY) as CountryCode;

  const [country, setCountry] = useState<CountryCode>(
    options.some((o) => o.code === seed) ? seed : FALLBACK_COUNTRY,
  );
  const [national, setNational] = useState(() =>
    supplied ? formatNationalNumber(supplied.nationalNumber, seed) : '',
  );

  // A number that arrives AFTER mount - the register's, prefilled a moment
  // later - has to reach the field, or we hold a value the applicant can
  // neither see nor correct and submit it as their answer.
  const seeded = useRef(value ?? '');
  useEffect(() => {
    if (!value || value === seeded.current) return;
    seeded.current = value;
    const parsed = parsePhoneNumberFromString(value);
    if (!parsed) return;
    const next = (parsed.country ?? country) as CountryCode;
    setCountry(next);
    setNational(formatNationalNumber(parsed.nationalNumber, next));
  }, [value, country]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const anchor = useDropdownAnchor(open, triggerRef, { menuRef });

  const selected = options.find((o) => o.code === country);

  const emit = (nextCountry: CountryCode, nextNational: string) => {
    const parsed = parsePhoneNumberFromString(nextNational, nextCountry);
    onChange({ e164: parsed?.number ?? '', isValid: parsed?.isValid() ?? false, country: nextCountry });
  };

  const handleNationalChange = (raw: string) => {
    const formatted = formatNationalNumber(raw, country);
    setNational(formatted);
    emit(country, formatted);
  };

  const pick = (code: CountryCode) => {
    setCountry(code);
    setOpen(false);
    setQuery('');
    emit(code, national); // re-parse the same digits under the new dial code
  };

  // Close on outside click / Escape; focus the search when opened.
  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      // composedPath, not e.target: the SDK renders in a shadow frame and a
      // document listener sees retargeted events (see lib/event-path.ts). The
      // menu is portaled out of rootRef, so it has to be tested separately —
      // otherwise picking a country counts as clicking outside.
      if (eventPathIncludes(e, rootRef.current, menuRef.current)) return;
      setOpen(false);
      setQuery('');
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setQuery(''); }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const filtered = query.trim()
    ? options.filter((o) => {
        const q = query.trim().toLowerCase();
        return o.name.toLowerCase().includes(q) || o.dialCode.includes(q) || o.code.toLowerCase() === q;
      })
    : options;

  // Where they appear to be, lifted out of the alphabet. It stays subject to the
  // search, so typing still narrows to what was asked for rather than keeping a
  // row that does not match.
  const geo = geoCountry?.toUpperCase();
  const pinned = geo ? filtered.find((o) => o.code === geo) ?? null : null;
  const rest = pinned ? filtered.filter((o) => o.code !== pinned.code) : filtered;

  return (
    <div ref={rootRef} className="relative flex items-stretch gap-2">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-label="Country calling code"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-12 shrink-0 items-center gap-1.5 rounded-xl border border-input bg-background px-3 text-sm font-medium',
          'transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50',
        )}
      >
        <CountryFlag code={country} className="h-5 w-5" title={selected?.name} />
        <span className="tabular-nums">{selected?.dialCode}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
      </button>

      <Input
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={t('contact.phone.placeholder')}
        value={national}
        onChange={(e) => handleNationalChange(e.target.value)}
        disabled={disabled}
      />

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
                placeholder={t('contact.phone.search')}
                aria-label="Search countries"
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="overflow-y-auto p-1.5" style={{ maxHeight: anchor.maxHeight }}>
              {filtered.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t('contact.phone.noMatches')}</p>
              ) : (
                <>
                  {pinned && (
                    <>
                      <CountryRow
                        option={pinned}
                        selected={pinned.code === country}
                        badge={t('contact.phone.yourLocation')}
                        onPick={pick}
                      />
                      {rest.length > 0 && <div className="my-1.5 border-t border-border/70" />}
                    </>
                  )}
                  {rest.map((o) => (
                    <CountryRow
                      key={o.code}
                      option={o}
                      selected={o.code === country}
                      onPick={pick}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        </DropdownSurface>,
        anchor.host,
      )}
    </div>
  );
}

/**
 * One country in the dial-code list.
 *
 * Extracted so the pinned row and the alphabetical ones cannot drift apart -
 * they are the same control in two positions, and the pinned one only differs
 * by carrying a tag.
 */
function CountryRow({
  option,
  selected,
  badge,
  onPick,
}: {
  option: CountryOption;
  selected: boolean;
  badge?: string;
  onPick: (code: CountryCode) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(option.code)}
      className={cn(
        'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
        'hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
        selected && 'bg-primary/5 font-medium',
      )}
    >
      <CountryFlag code={option.code} className="h-5 w-5" title={option.name} />
      <span className="flex-1 truncate">{option.name}</span>
      {badge && (
        <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 text-[10px] font-medium leading-4 text-primary">
          {badge}
        </span>
      )}
      <span className="tabular-nums text-muted-foreground">{option.dialCode}</span>
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
    </button>
  );
}
