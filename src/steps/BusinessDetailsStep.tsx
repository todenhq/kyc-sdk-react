'use client';

import React from 'react';
import { Building2, Loader2, Pencil } from '../components/icons';
import { StepHeader } from '../components/StepHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { BusinessCountrySelect } from '../components/BusinessCountrySelect';
import { BusinessSearch } from '../components/BusinessSearch';
import { isValidWebsite } from '../lib/website';
import { CountryFlag } from '../components/CountryFlag';
import { BusinessProductPicker } from '../components/BusinessProductPicker';
import { BusinessContactEmailField } from '../components/BusinessContactEmailField';
import { BusinessCompanyInfoFields } from '../components/BusinessCompanyInfoFields';
import type { BusinessCheckState } from '../context/types';
import { useVerificationContext } from '../context/VerificationContext';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import {
  businessCountriesFor,
  businessProductsForCountry,
  companyInfoFieldModes,
  getBusinessProductDef,
  isValidContactEmail,
  keyPeopleNeedsContactEmail,
} from '../lib/business';
import { nextBusinessStep } from '../lib/business-application';
import { registrationNumberHint } from '../lib/registration-hint';
import { BusinessCheckPanel } from '../components/BusinessCheckPanel';
import { useBusinessCheck } from '../hooks/useBusinessCheck';
import { defaultCountry } from '../lib/country-default';
import { useText } from '../i18n';

/**
 * Business (KYB) details step — replaces id-type/capture for business
 * workflows: pick a verification product (when the workflow offers more than
 * one), type the registration number (or TIN), and optionally the registered
 * business name. No camera, no liveness — the server runs a registry lookup.
 */
export function BusinessDetailsStep() {
  const { state, dispatch } = useVerificationContext();
  const config = useVerificationConfig();
  const t = useText();

  const business = config.business;
  // Registry country: workflows may offer several — the visitor picks theirs
  // (defaulting to the workflow's primary); products narrow per country.
  const offeredCountries = businessCountriesFor(business);
  const showCountryPicker = offeredCountries.length > 1;
  const country =
    defaultCountry(
      state.business.country,
      business?.country,
      offeredCountries[0],
      // Only when the flow offers no register at all: a company is registered
      // somewhere specific, so this is the weakest signal here, not the first.
      config.serverConfig?.geoCountry,
    ) ?? '';
  const offered = businessProductsForCountry(business, country);
  const showPicker = offered.length > 1;
  // Single-product countries skip the picker and use the only offered product.
  const pickedProduct =
    state.business.product && offered.includes(state.business.product) ? state.business.product : null;
  const product = showPicker ? pickedProduct : offered[0];
  const productDef = getBusinessProductDef(product ?? offered[0]!);
  const isTin = productDef.inputLabel === 'TIN';

  // Two screens in one step.
  //
  // 'pick' is choosing WHICH company. 'details' is confirming what the register
  // then said about it. They are separate because the register has not been
  // asked yet while you are still picking, so showing the detail fields there
  // would invite somebody to fill in answers we are about to overwrite.
  //
  // Continue is what runs the check and moves between them.
  const [phase, setPhase] = React.useState<'pick' | 'details'>('pick');
  // Seed once, and only into empty fields: a resumed session already carries
  // what the applicant typed, and overwriting that with the org's older guess
  // would silently undo their correction.
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const pre = config.businessPrefill;
    if (!pre) return;
    const patch: Partial<typeof state.business> = {};
    if (pre.registrationNumber && !state.business.registrationNumber.trim()) {
      patch.registrationNumber = pre.registrationNumber;
    }
    if (pre.registrationName && !state.business.registrationName.trim()) {
      patch.registrationName = pre.registrationName;
    }
    // The register as well: an org that named the company knows which one it is
    // on, and making the applicant pick it again is the step where a mis-click
    // spends a paid lookup on the wrong country.
    if (pre.country && !state.business.country) {
      patch.country = pre.country.toUpperCase();
    }
    // Names the company so the card shows instead of a search box: they were
    // sent a link for THIS business, and opening on a search asks them to find
    // what we already named. The register is still asked on Continue, so the
    // prefill shortcuts the finding and not the checking.
    if (Object.keys(patch).length > 0) dispatch({ type: 'SET_BUSINESS_DETAILS', payload: patch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Production never shows it, and never honours a pin if one arrives.
  const isSandbox = config.serverConfig?.environment !== 'PRODUCTION';
  const registrationNumber = state.business.registrationNumber;
  const registrationName = state.business.registrationName;
  /**
   * A company has been named, so the card replaces the search.
   *
   * The NUMBER is what names it. Requiring a name too was a proxy for "came
   * from search", where both arrive together - and it silently defeated the
   * other way a company gets named, which is an org prefilling one on the
   * session. They would send a registration number and the applicant would
   * still open on a search box, exactly as if nothing had been passed.
   *
   * The register supplies the name on Continue, so an unnamed card is a
   * momentary state rather than a broken one.
   */
  const picked = registrationNumber.trim() !== '';
  const nameRequired = business?.requireRegistrationName === true;

  // Key-people email invites: optional, but format-validated when typed.
  const showContactEmail = keyPeopleNeedsContactEmail(business);
  const contactEmail = state.business.contactEmail;
  const emailValid = contactEmail.trim() === '' || isValidContactEmail(contactEmail.trim());

  // Company profile (address / email / phone / website): per-field modes from
  // the workflow config; the address is registry-cross-checked server-side
  // (business.addressMatch). Required fields block Continue.
  const infoModes = companyInfoFieldModes(business);
  const showCompanyInfo = Object.values(infoModes).some((m) => m !== 'off');
  const businessEmailValid =
    state.business.email.trim() === '' || isValidContactEmail(state.business.email.trim());
  const companyInfoComplete = (['address', 'email', 'phone', 'website'] as const).every(
    (f) => infoModes[f] !== 'required' || state.business[f].trim() !== '',
  );

  // Country-aware registration-number guidance (NG: CAC prefix rules +
  // format validation; elsewhere: a generic registry tip).
  const regHint = registrationNumberHint(country, productDef, t);
  const formatOk =
    !regHint.isValidFormat ||
    registrationNumber.trim() === '' ||
    regHint.isValidFormat(registrationNumber);
  const numberValid = registrationNumber.trim().length >= 2 && formatOk;
  // Gated per phase. On the pick screen the detail fields do not exist yet, so
  // holding Continue until they are filled would be waiting on inputs that are
  // not on screen - the register has to answer before most of them can be.
  // Empty is fine (the field is optional unless the workflow says otherwise);
  // a malformed one is not, and it should stop Continue rather than only
  // colouring the box red.
  const websiteValid = isValidWebsite(state.business.website);
  const pickValid = !!product && numberValid && (!nameRequired || registrationName.trim() !== '');
  const isFormValid =
    phase === 'pick'
      ? pickValid
      : pickValid &&
        (!showContactEmail || emailValid) &&
        (!showCompanyInfo || (businessEmailValid && websiteValid && companyInfoComplete));

  const { run: runCheck, reset: resetCheck } = useBusinessCheck();
  const checking = state.businessCheck.status === 'checking';
  // Locked only once a register has actually ANSWERED for a company. A failed
  // or unavailable lookup has told us nothing, so freezing on it would strand
  // somebody on a register that never replied.
  const registerLocked =
    business?.lockCountryAfterCheck === true && state.businessCheck.status === 'found';

  const setDetails = (payload: Partial<typeof state.business>) => {
    // Any change to WHICH company this is invalidates the answer we hold, so the
    // panel never describes one business while the field names another.
    const identityChanged =
      payload.registrationNumber !== undefined ||
      payload.country !== undefined ||
      payload.product !== undefined;

    if (identityChanged) {
      // AND everything the previous register told us about the old company.
      //
      // Only what the REGISTER wrote: an applicant who typed their own address
      // meant it, and having it wiped because they corrected a digit in the
      // registration number would be its own bug. Clearing it also unblocks the
      // next lookup, whose prefill only ever writes into an empty field - so
      // leftovers were not merely stale, they were suppressing the real answer.
      for (const key of state.businessCheck.prefilled) {
        if (payload[key] === undefined) (payload as Record<string, string>)[key] = '';
      }
      resetCheck();
    }
    dispatch({ type: 'SET_BUSINESS_DETAILS', payload });
  };

  /**
   * Copy what the register returned into the form, without overwriting anything.
   *
   * Only empty fields are filled: an applicant who typed something before the
   * lookup meant it, and the register is a starting point here rather than the
   * last word. Every value stays editable either way.
   */
  const prefillFromRegister = (found: BusinessCheckState['company']) => {
    if (!found) return;
    const patch: Partial<typeof state.business> = {};
    // Field by field, from the register's answer to the form's question. The
    // register does not answer all of these for every company, so each is
    // filled only when it actually came back.
    const fill = (
      key:
        | 'registrationName' | 'address' | 'companyType' | 'email' | 'phone'
        | 'taxId' | 'vatNumber' | 'dateOfIncorporation' | 'natureOfBusiness',
      value: string | null,
    ) => {
      if (value && !state.business[key].trim()) patch[key] = value;
    };
    fill('registrationName', found.name);
    // The register splits the address across lines; the form has one box, so
    // they are joined rather than dropping the parts that did not fit.
    fill('address', [found.address, found.city, found.state].filter(Boolean).join(', ') || null);
    fill('companyType', found.typeOfEntity);
    fill('email', found.email);
    fill('phone', found.phone);
    fill('taxId', found.taxId);
    fill('vatNumber', found.vatNumber);
    fill('natureOfBusiness', found.natureOfBusiness);
    // The register gives an incorporation DATE; the field wants YYYY-MM-DD, and
    // anything it cannot be read as is left blank rather than guessed at.
    fill('dateOfIncorporation', isoDateOnly(found.registrationDate));
    if (Object.keys(patch).length > 0) {
      dispatch({ type: 'SET_BUSINESS_DETAILS', payload: patch });
      // Remember which ones came from the register, so a company change can
      // clear exactly these and leave the applicant's own answers alone.
      dispatch({
        type: 'SET_BUSINESS_CHECK',
        payload: { prefilled: Object.keys(patch) as (keyof typeof state.business)[] },
      });
    }
  };

  const handleContinue = async () => {
    if (!isFormValid || checking) return;
    // Persist the resolved country + product so submission never re-derives them.
    if (product && (state.business.product !== product || state.business.country !== country)) {
      dispatch({ type: 'SET_BUSINESS_DETAILS', payload: { product, country } });
    }

    // Check the register HERE, so the next step can ask them to confirm the
    // officers on file rather than recall them. Only a definitive "not on the
    // register" stops the flow: everything else (a short balance, an outage)
    // continues and is checked at submission, as it was before this step.
    let checked: BusinessCheckState['company'] = null;
    if (country && product) {
      const { canContinue, company } = await runCheck({
        country,
        product,
        // The register the company was found in. Searching one and checking
        // another would look up a different company entirely.
        ...(state.business.subdivisionCode ? { subdivisionCode: state.business.subdivisionCode } : {}),
        registrationNumber,
        ...(registrationName.trim() ? { registrationName } : {}),
      });
      if (!canContinue) return;
      // Taken from the call, NOT from state: the dispatch inside runCheck has
      // not reached this closure yet, so reading state here sees the value from
      // before the lookup and quietly fills nothing.
      checked = company;
    }

    // First Continue ends at the details screen rather than the next step: the
    // register has only just answered, and this is where what it said gets put
    // in front of them to confirm or correct.
    if (phase === 'pick') {
      prefillFromRegister(checked);
      setPhase('details');
      return;
    }

    // KYB application steps (key people / documents / applicant), then the
    // questionnaire, then submission — the sequencing lives in one helper.
    const next = nextBusinessStep('business-details', config);
    if (next === 'submitted') {
      dispatch({ type: 'SUBMIT_VERIFICATION' });
    } else {
      dispatch({ type: 'SET_STEP', payload: next });
    }
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <StepHeader
        title={t('business.details.title')}
        description={t('business.details.description')}
        onBack={() => dispatch({ type: 'SET_STEP', payload: 'consent' })}
      />

      {showCountryPicker && (
        <div className="space-y-2">
          <Label htmlFor="businessCountry">{t('business.details.countryLabel')}</Label>
          <BusinessCountrySelect
            id="businessCountry"
            countries={offeredCountries}
            value={country}
            // Frozen once the register has answered, when the workflow says so.
            // Off by default: a mis-click from ~48 registers is ordinary, and a
            // lock turns it into a dead end. The server does not rely on this -
            // a changed company is re-checked and re-charged regardless.
            disabled={registerLocked}
            // Where they appear to be, lifted to the top of ~48 registers. A
            // guess, tagged as one, and the register they pick is what counts.
            defaultCode={config.serverConfig?.geoCountry ?? undefined}
            pinnedLabel={t('business.details.countryPinnedLocation')}
            onChange={(value) =>
              // A country switch can invalidate the picked product — reset it.
              setDetails({ country: value, product: null })
            }
          />
        </div>
      )}

      {showPicker && (
        <BusinessProductPicker
          offered={offered}
          picked={pickedProduct}
          onPick={(value) => setDetails({ product: value })}
        />
      )}

      {/* Search first: a registration number lives on a certificate in a
          drawer, the name lives in the applicant's head. Asking for the number
          first turns the very first field into a search of their own filing
          cabinet, which is where these applications are abandoned. */}
      {/* HIDDEN, not unmounted, once a company is chosen.
          Unmounting threw away the query and the results, so "Change" dropped
          somebody back to an empty box and made them search again for the list
          they were just looking at. Hiding keeps the whole picker alive, which
          is what makes Change cheap. */}
      <div className={phase === 'pick' && country && !picked ? '' : 'hidden'}>
        <BusinessSearch
          country={country}
          onPicked={(hit) =>
            // Names the company and nothing more: the register is asked on
            // Continue, and the fields it fills live on the screen after.
            setDetails({ registrationNumber: hit.registrationNumber, registrationName: hit.name })
          }
          // No company to look up, so there is nothing to check first.
          region={state.business.subdivisionCode ?? ''}
          onRegion={(subdivisionCode) => setDetails({ subdivisionCode })}
          onManualEntry={() => setPhase('details')}
        />
      </div>

      {phase === 'pick' && picked && (
        <div className="space-y-2">
          <Label>{t('business.details.pickedLabel')}</Label>
          <div className="flex items-center gap-3 rounded-xl border border-primary bg-primary/5 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Building2 className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {registrationName.trim() || t('business.details.pickedNamePending')}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CountryFlag code={country} className="h-3.5 w-3.5 shrink-0" />
                <span className="font-mono">{registrationNumber}</span>
              </span>
            </span>
            {/* Back to the search rather than an undo: they are changing which
                company this is about, and the fields below belong to the old one. */}
            <button
              type="button"
              onClick={() => {
                setDetails({ registrationNumber: '', registrationName: '' });
                setPhase('pick');
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t('business.details.change')}
            </button>
          </div>
        </div>
      )}

      <div className={phase === 'details' ? 'space-y-4' : 'hidden'}>
        <div className="space-y-2">
          <Label htmlFor="registrationNumber">
            {t(isTin ? 'business.details.tinLabel' : 'business.details.registrationNumberLabel')}
          </Label>
          <Input
            id="registrationNumber"
            placeholder={regHint.placeholder}
            value={registrationNumber}
            onChange={(e) => setDetails({ registrationNumber: e.target.value })}
            className={registrationNumber && !numberValid ? 'border-destructive' : ''}
          />
          {registrationNumber !== '' && !numberValid ? (
            <p className="text-sm text-destructive">
              {!formatOk && regHint.formatError
                ? regHint.formatError
                : t(isTin ? 'business.details.invalidTin' : 'business.details.invalidRegistrationNumber')}
            </p>
          ) : (
            regHint.tip && <p className="text-xs text-muted-foreground">{regHint.tip}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="registrationName">
            {t('business.details.nameLabel')}
            {!nameRequired && <span className="text-muted-foreground"> {t('business.optional')}</span>}
          </Label>
          <Input
            id="registrationName"
            placeholder={t('business.details.namePlaceholder')}
            value={registrationName}
            onChange={(e) => setDetails({ registrationName: e.target.value })}
          />
        </div>

        {showCompanyInfo && (
          <BusinessCompanyInfoFields
            values={{
              address: state.business.address,
              email: state.business.email,
              phone: state.business.phone,
              website: state.business.website,
              dateOfIncorporation: state.business.dateOfIncorporation,
              taxId: state.business.taxId,
              vatNumber: state.business.vatNumber,
              companyType: state.business.companyType,
              natureOfBusiness: state.business.natureOfBusiness,
            }}
            country={country}
            geoCountry={config.serverConfig?.geoCountry}
            modes={infoModes}
            emailValid={businessEmailValid}
            onChange={(patch) => setDetails(patch)}
          />
        )}

        {showContactEmail && (
          <BusinessContactEmailField
            value={contactEmail}
            valid={emailValid}
            onChange={(value) => setDetails({ contactEmail: value })}
          />
        )}
      </div>

      <BusinessCheckPanel check={state.businessCheck} />

      {/* Outside production the register is never called, so the result is a
          fixture either way. Saying which one lets an integrator exercise the
          not-found branch without hunting for a number that fails. */}
      {/* Says what the button is about to do.
          Continue runs a real lookup against the register, which takes a moment
          and is charged to the organisation. Labelling it "Continue" alone made
          a paid, outbound call look like moving to the next page. */}
      {phase === 'pick' && picked && (
        <p className="text-xs text-muted-foreground">{t('business.details.checkNote')}</p>
      )}

      {/* Pick screen only. The outcome is chosen BEFORE the lookup runs, so
          repeating the control afterwards would offer to change an answer that
          has already come back. */}
      {/* Stacked on mobile, inline from sm up.
          Wrapping a label, a control and a sentence with flex-wrap gave three
          ragged lines and left the toggle floating in whitespace. Stacking them
          is what lets the control go full width, which is also how its tap
          targets reach a usable size on a phone. */}
      {isSandbox && phase === 'pick' && picked && (
        <div className="space-y-2 rounded-xl border border-dashed border-border p-3 sm:flex sm:flex-wrap sm:items-center sm:gap-3 sm:space-y-0">
          <span className="block text-sm font-medium">{t('business.sandbox.label')}</span>
          {/* The active state SLIDES between the two.
              A block that vanishes here and reappears there reads as two
              separate things blinking; moving it says the selection travelled,
              which is what actually happened. Equal columns are what let the
              indicator translate by exactly its own width. */}
          <div className="relative grid w-full grid-cols-2 rounded-lg border border-input p-0.5 sm:w-auto">
            <span
              aria-hidden
              className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-foreground transition-transform duration-200 ease-out motion-reduce:transition-none"
              style={{
                transform:
                  (state.business.sandboxOutcome ?? 'verified') === 'verified'
                    ? 'translateX(0)'
                    : 'translateX(100%)',
              }}
            />
            {(['verified', 'not_found'] as const).map((outcome) => {
              const active = (state.business.sandboxOutcome ?? 'verified') === outcome;
              return (
                <button
                  key={outcome}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    dispatch({ type: 'SET_BUSINESS_DETAILS', payload: { sandboxOutcome: outcome } })
                  }
                  // Above the indicator, or the label slides out from under it.
                  className={`relative z-10 rounded-md px-3 py-2.5 text-sm transition-colors sm:py-1.5 ${
                    active ? 'text-background' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t(outcome === 'verified' ? 'business.sandbox.verified' : 'business.sandbox.notFound')}
                </button>
              );
            })}
          </div>
          <span className="block text-xs text-muted-foreground">{t('business.sandbox.hint')}</span>
        </div>
      )}

      <Button onClick={() => void handleContinue()} disabled={!isFormValid || checking} className="w-full">
        {checking ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('business.details.checking')}
          </>
        ) : // Once the register has filled these in, the act is confirming what
        // it said rather than supplying it: the label should say which of
        // the two the person is being asked to do.
        phase === 'details' ? (
          t('business.details.confirm')
        ) : (
          t('common.continue')
        )}
      </Button>
    </div>
  );
}

/**
 * The date part of an ISO timestamp, or null.
 *
 * Deliberately NOT `new Date(value)`. That parser is lenient in exactly the
 * wrong direction: it reads "12/03/2018" as 2 December (US order, when a
 * register returning DD/MM means 12 March), "sometime in 2018" as 2017-12-31,
 * and "March 2018" as the 28th. Each of those is a confidently wrong date
 * written into a compliance form, which is worse than an empty field somebody
 * fills in themselves.
 *
 * So only an unambiguous ISO date is accepted, and the calendar is checked
 * afterwards so 2018-02-31 does not roll into March.
 */
function isoDateOnly(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const parsed = new Date(`${y}-${m}-${d}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // A real date, not one that rolled over into the next month.
  return parsed.toISOString().slice(0, 10) === `${y}-${m}-${d}` ? `${y}-${m}-${d}` : null;
}