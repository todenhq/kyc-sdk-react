'use client';

// Checking the company against the register at the moment it is confirmed.
//
// The check used to happen at submission, which is after the form had already
// asked the applicant to recall their directors from memory. Running it here
// means the register answers first, so the next step can ask them to CONFIRM the
// officers on file instead — easier to answer, and a much stronger signal when
// somebody takes a name out.
//
// It is a paid step, so it runs once per company, only when the applicant has
// actually settled on one, and never automatically as they type.
import { useCallback } from 'react';
import type { BusinessCheckState } from '../context/types';
import { useVerificationContext } from '../context/VerificationContext';
import { useVerificationConfig } from '../context/VerificationConfigContext';

export interface BusinessCheckResult {
  /** Whether the flow may continue. Only a register outage stops it. */
  canContinue: boolean;
  /**
   * What the register said, returned rather than only dispatched.
   *
   * A caller that awaits `run` and then reads `state.businessCheck.company` is
   * reading the state its OWN render closed over, which the dispatch above has
   * not updated yet — so it sees null and silently prefills nothing. Handing
   * the record back is what makes "check, then use the answer" work in one go.
   */
  company: BusinessCheckState['company'];
}

export function useBusinessCheck(): {
  run: (input: {
    country: string;
    product: string;
    registrationNumber: string;
    registrationName?: string;
    subdivisionCode?: string;
  }) => Promise<BusinessCheckResult>;
  reset: () => void;
} {
  const { state, dispatch } = useVerificationContext();
  const config = useVerificationConfig();

  const reset = useCallback(() => {
    dispatch({
      type: 'SET_BUSINESS_CHECK',
      payload: { status: 'idle', company: null, keyPeople: [], checkedNumber: null, prefilled: [] },
    });
  }, [dispatch]);

  const run = useCallback(
    async (input: {
      country: string;
      product: string;
      registrationNumber: string;
      registrationName?: string;
      subdivisionCode?: string;
    }): Promise<BusinessCheckResult> => {
      // Already checked this exact company — do not pay to be told again.
      //
      // Only a SETTLED answer is reused. 'unavailable' is deliberately not one:
      // an outage said nothing about the company, so a repeat press retries the
      // register rather than replaying the outage. And a remembered answer
      // keeps its meaning — a stored not_found still blocks, where returning a
      // blanket "continue" here let a second press walk past a company the
      // register had just said does not exist.
      const normalized = input.registrationNumber.trim().toUpperCase();
      const settled =
        state.businessCheck.status !== 'idle' &&
        state.businessCheck.status !== 'checking' &&
        state.businessCheck.status !== 'unavailable';
      if (state.businessCheck.checkedNumber === normalized && settled) {
        return {
          canContinue: state.businessCheck.status !== 'not_found',
          // Already checked: the answer is in state and settled by now.
          company: state.businessCheck.company,
        };
      }
      // No session means no anchor for the charge, so there is nothing to run
      // against. The check happens at submission, exactly as it did before.
      if (!state.sessionId) return { canContinue: true, company: null };

      dispatch({ type: 'SET_BUSINESS_CHECK', payload: { status: 'checking', checkedNumber: normalized } });

      try {
        const res = await config.api.businessSelect({
          sessionId: state.sessionId,
          country: input.country,
          product: input.product,
          ...(input.subdivisionCode ? { subdivisionCode: input.subdivisionCode } : {}),
          registrationNumber: input.registrationNumber,
          ...(input.registrationName ? { registrationName: input.registrationName } : {}),
        });

        if (!res.checked) {
          // The organisation could not be charged. Not the applicant's problem
          // and not something they can fix, so it is not shown as an error —
          // the flow continues and the check runs at submission.
          //
          // `lookup_limit_reached` is the one they DID cause, by re-picking
          // company after company, and the one they can act on: check the
          // number rather than keep trying. It is still not a failure - their
          // submission gets its own lookup - so it is a note, not a block.
          dispatch({
            type: 'SET_BUSINESS_CHECK',
            payload: {
              status: res.reason === 'lookup_limit_reached' ? 'limit_reached' : 'skipped',
            },
          });
          return { canContinue: true, company: null };
        }

        if (!res.found) {
          dispatch({ type: 'SET_BUSINESS_CHECK', payload: { status: 'not_found', company: null, keyPeople: [] } });
          // A definitive "not on the register" is worth stopping for: continuing
          // would spend the applicant's time on documents for a company that
          // will fail anyway.
          return { canContinue: false, company: null };
        }

        const b = res.business!;
        const company = {
          name: b.name,
          registrationNumber: b.registrationNumber,
          registrationDate: b.registrationDate,
          typeOfEntity: b.typeOfEntity,
          companyStatus: b.companyStatus,
          address: b.address,
          email: b.email,
          phone: b.phone,
          taxId: b.taxId,
          vatNumber: b.vatNumber,
          natureOfBusiness: b.natureOfBusiness,
          city: b.city,
          state: b.state,
        };
        dispatch({
          type: 'SET_BUSINESS_CHECK',
          payload: { status: 'found', company, keyPeople: b.keyPeople ?? [] },
        });
        return { canContinue: true, company };
      } catch {
        // A register outage is NOT "this company does not exist" — telling the
        // applicant their business is unregistered on the strength of a 503 is
        // the one wrong answer here. Retryable, and it never blocks: the check
        // still happens at submission.
        dispatch({ type: 'SET_BUSINESS_CHECK', payload: { status: 'unavailable' } });
        return { canContinue: true, company: null };
      }
    },
    [config.api, dispatch, state.businessCheck.checkedNumber, state.businessCheck.status, state.sessionId],
  );

  return { run, reset };
}
