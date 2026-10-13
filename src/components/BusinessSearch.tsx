'use client';

// Finding the company by name, because that is what people know.
//
// A registration number is on a certificate in a drawer; the name is in the
// applicant's head. Asking for the number first turns the very first field into
// a search of their own filing cabinet, which is where KYB applications are
// abandoned.
//
// The search itself is FREE and read-only. Only picking a result runs the paid
// register check, which is why selection is an explicit act rather than
// something that happens as they type.
import { useEffect, useState } from 'react';
import { Search, Loader2, Building2, TriangleAlert, PenLine, Filter } from './icons';
import { Button } from './ui/button';
import { CountryFlag } from './CountryFlag';
import { UiSelect } from './UiSelect';
import { Label } from './ui/label';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { useText } from '../i18n';

export interface BusinessHit {
  name: string;
  registrationNumber: string;
  status?: string;
}

type SearchState =
  | { phase: 'idle' }
  | { phase: 'searching' }
  | { phase: 'results'; hits: BusinessHit[]; truncated: boolean }
  | { phase: 'unavailable' };

export function BusinessSearch({
  country,
  onPicked,
  region,
  onRegion,
  onManualEntry,
  disabled,
}: {
  country: string;
  onPicked: (hit: BusinessHit) => void;
  /** The chosen registry region, for the countries that have several. */
  region: string;
  onRegion: (code: string) => void;
  onManualEntry: () => void;
  disabled?: boolean;
}) {
  const config = useVerificationConfig();
  const t = useText();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [state, setState] = useState<SearchState>({ phase: 'idle' });
  // Four countries file companies per state or emirate, and the provider
  // searches ONE register at a time. Without the region it fails closed, which
  // is right: a company filed a state away would otherwise come back "not
  // registered", and that is a finding nobody has earned.
  const [regions, setRegions] = useState<{ code: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    setRegions([]);
    if (!country) return undefined;
    config.api
      .businessRegions(country)
      .then((r) => {
        if (!cancelled) setRegions(r.regions ?? []);
      })
      // An empty list means "do not ask", which is also the safe answer when
      // the catalogue is unreachable: the search says so on its own.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [country, config.api]);
  // Choosing a row IS the choice: it swaps the list for the chosen company, and
  // Change swaps back. A separate confirm button meant two primary buttons on
  // screen at once, and the card it lands on already shows what was picked, so
  // the confirmation was the step after rather than a button before it.

  // Fires on an explicit submit, never on keystroke.
  //
  // A debounce still spends the register's rate-limit budget on every prefix
  // nobody asked for ("d", "da", "dan") before the query they actually meant,
  // and that budget is small and has no contract behind it.
  const run = async () => {
    const q = query.trim();
    if (q.length < 2 || disabled) return;
    // Nothing to search yet: the register has not been chosen.
    if (regions.length > 0 && !region) return;
    setState({ phase: 'searching' });
    try {
      const res = await config.api.businessSearch({
        country,
        query: q,
        limit: 50,
        ...(region ? { subdivisionCode: region } : {}),
      });
      const hits = res.results ?? [];
      setState({ phase: 'results', hits, truncated: hits.length >= 50 });
    } catch {
      // Deliberately NOT an empty result list. "No matches" reads as "this
      // business is not registered", which is a claim an outage has not earned.
      setState({ phase: 'unavailable' });
    }
  };

  // Narrows what came back; it never replaces the search.
  //
  // Matches the NAME as well as the number. It was number-only, while the box
  // invited "name or number" - so typing a word from a company's name returned
  // nothing and looked broken rather than unmatched.
  const shown =
    state.phase === 'results'
      ? state.hits.filter((h) => {
          const q = filter.trim().toLowerCase();
          if (!q) return true;
          return h.name.toLowerCase().includes(q) || h.registrationNumber.toLowerCase().includes(q);
        })
      : [];

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {regions.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="business-region">{t('business.search.regionLabel')}</Label>
            {/* Searchable: fifty US states unfiltered is a scroll-and-hunt for
                a word the person already knows how to spell. The flag is the
                country's, because every option here belongs to it. */}
            <UiSelect
              id="business-region"
              value={region || undefined}
              options={regions.map((r) => ({
                value: r.code,
                label: r.name,
                icon: <CountryFlag code={country} className="h-4 w-4 shrink-0" />,
              }))}
              onChange={onRegion}
              searchable
              placeholder={t('business.search.regionPlaceholder')}
              aria-label="State or region of registration"
            />
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void run();
              }
            }}
            placeholder={t('business.search.placeholder')}
            aria-label="Company name"
            disabled={disabled}
            className="h-12 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-base"
          />
        </div>

        <Button
          type="button"
          onClick={() => void run()}
          disabled={
            disabled ||
            query.trim().length < 2 ||
            state.phase === 'searching' ||
            (regions.length > 0 && !region)
          }
          className="h-12 w-full"
        >
          {state.phase === 'searching' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('business.search.searching')}
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              {t('business.search.button')}
            </>
          )}
        </Button>
      </div>

      {state.phase === 'results' && state.hits.length > 0 && (
        <>
          {/* Count first: "40 results" tells you whether to narrow before you
              start reading, which a bare list does not. */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {shown.length === state.hits.length
                ? t('business.search.resultCount', { count: state.hits.length })
                : t('business.search.resultCountFiltered', {
                    shown: shown.length,
                    count: state.hits.length,
                  })}
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="business-filter" className="text-sm text-muted-foreground">
                {t('business.search.filterLabel')}
              </label>
              <div className="relative">
                <Filter
                  className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  id="business-filter"
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t('business.search.filterPlaceholder')}
                  className="h-10 w-44 rounded-xl border border-input bg-background pl-8 pr-3 text-sm"
                />
              </div>
            </div>
          </div>

          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {shown.map((hit) => (
              <li key={`${hit.registrationNumber}-${hit.name}`}>
                <button
                  type="button"
                  onClick={() => onPicked(hit)}
                  className="flex w-full items-center gap-3 rounded-xl border border-input p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
                >
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {hit.name}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CountryFlag code={country} className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-mono">{hit.registrationNumber}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {shown.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t('business.search.noFilterMatch', {
                filter: filter.trim(),
                count: state.hits.length,
              })}
            </p>
          )}
          {/* The register caps a page, so a full one may be hiding matches. */}
          {state.truncated && (
            <p className="text-xs text-muted-foreground">
              {t('business.search.truncated', { count: state.hits.length })}
            </p>
          )}
        </>
      )}

      {state.phase === 'results' && state.hits.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('business.search.noResults')}
        </p>
      )}

      {state.phase === 'unavailable' && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              {t('business.search.unavailableTitle')}
            </p>
            <p className="text-amber-800 dark:text-amber-300">{t('business.search.unavailableBody')}</p>
          </div>
        </div>
      )}

      {/* Always offered, not only on failure. Some companies are not in the
          index at all, and a dead end at the first step ends the application. */}
      <button
        type="button"
        onClick={onManualEntry}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <PenLine className="h-3.5 w-3.5" />
        {t('business.search.manualEntry')}
      </button>
    </div>
  );
}
