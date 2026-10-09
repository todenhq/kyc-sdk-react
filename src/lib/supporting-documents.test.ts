import { describe, expect, it } from 'vitest';
import {
  hasSupportingDocumentsStep,
  mayAskSupportingDocuments,
  idComposite,
  resolveSupportingDocuments,
  verifiedIdsFor,
  verifiedIdsFromState,
} from './supporting-documents';
import { buildStepOrder } from './step-order';
import { stepAfterCapture, stepAfterSupportingDocuments } from './post-capture';

const NIN = idComposite('NG', 'nin');
const BVN = idComposite('NG', 'bvn');

// The organisation names its own documents; nothing in the SDK knows the key.
const ninSlipOnly = {
  enabled: true,
  types: [
    {
      key: 'nin_slip',
      label: 'NIN slip',
      description: 'The slip NIMC issued with your NIN.',
      required: true,
      idTypes: [NIN],
    },
  ],
};

describe('resolveSupportingDocuments', () => {
  it('asks for nothing when the step is off', () => {
    expect(resolveSupportingDocuments(undefined, [NIN])).toEqual([]);
    expect(resolveSupportingDocuments({ types: ninSlipOnly.types }, [NIN])).toEqual([]);
  });

  it('asks a scoped document only of the IDs it names', () => {
    expect(resolveSupportingDocuments(ninSlipOnly, [NIN])).toEqual([
      {
        key: 'nin_slip',
        label: 'NIN slip',
        description: 'The slip NIMC issued with your NIN.',
        required: true,
        reads: [],
        capture: 'upload',
      },
    ]);
    // The whole reason the scoping exists: a BVN applicant has no NIN slip.
    expect(resolveSupportingDocuments(ninSlipOnly, [BVN])).toEqual([]);
  });

  it('offers a scoped document to everyone when the author says always ask', () => {
    // The scope then decides who MUST provide it, not who sees it: an org that
    // needs the slip from NIN verifiers will still take one from anybody who
    // happens to hold it.
    const alwaysAsk = {
      enabled: true,
      types: [{ ...ninSlipOnly.types[0], alwaysAsk: true }],
    };
    expect(resolveSupportingDocuments(alwaysAsk, [NIN])[0]?.required).toBe(true);
    const [asked] = resolveSupportingDocuments(alwaysAsk, [BVN]);
    expect(asked?.key).toBe('nin_slip');
    // Never blocked for not having a document their ID does not come with.
    expect(asked?.required).toBe(false);
  });

  it('asks an unscoped document of everyone', () => {
    const config = { enabled: true, types: [{ key: 'signed_mandate', label: 'Signed mandate' }] };
    expect(resolveSupportingDocuments(config, [BVN])).toEqual([
      { key: 'signed_mandate', label: 'Signed mandate', description: null, required: false, reads: [], capture: 'upload' },
    ]);
  });

  it('asks once when a multi-ID run matches the same document twice', () => {
    const config = {
      enabled: true,
      types: [
        { key: 'nin_slip', label: 'NIN slip', idTypes: [NIN] },
        { key: 'nin_slip', label: 'NIN slip', idTypes: [BVN] },
      ],
    };
    expect(resolveSupportingDocuments(config, [NIN, BVN])).toHaveLength(1);
  });

  it('matches the composite case-insensitively', () => {
    const config = { enabled: true, types: [{ key: 'nin_slip', label: 'NIN slip', idTypes: ['ng/nin'] }] };
    expect(resolveSupportingDocuments(config, [NIN])).toHaveLength(1);
  });
});

describe('verifiedIdsFor', () => {
  it('is the one picked ID on an ordinary attempt', () => {
    expect(verifiedIdsFor({ country: 'NG', idType: 'nin' })).toEqual([NIN]);
  });

  it('is every committed slot on a multi-ID run', () => {
    expect(
      verifiedIdsFor({ country: 'NG', idType: 'nin', multiIdSlots: [{ idType: 'nin' }, { idType: 'bvn' }] }),
    ).toEqual([NIN, BVN]);
  });

  it('is empty before a country is known, so the step cannot appear early', () => {
    expect(verifiedIdsFor({ country: null, idType: 'nin' })).toEqual([]);
  });

  it('reads the same answer off flow state', () => {
    expect(
      verifiedIdsFromState({ selectedCountry: 'NG', selectedIdType: 'nin' }, { country: 'GH' }),
    ).toEqual([NIN]);
    // The config country is the fallback for a single-region flow.
    expect(verifiedIdsFromState({ selectedIdType: 'nin' }, { country: 'NG' })).toEqual([NIN]);
  });
});

describe('the step in the flow', () => {
  const base = {
    isBusiness: false,
    hasDocCapture: false,
    hasLiveness: true,
    hasCountrySelect: false,
    hasEmailVerification: false,
    hasPhoneVerification: false,
    hasPoa: false,
    hasSupportingDocuments: false,
    hasAddressCollection: false,
    hasQuestionnaire: false,
  };

  it('is absent unless the caller resolved something to ask for', () => {
    expect(buildStepOrder(base)).not.toContain('supporting-documents');
  });

  it('comes before the address document and the address pin', () => {
    // Paperwork the org files is asked for ahead of the address evidence the
    // verification is judged on (user decision 2026-09-22).
    const order = buildStepOrder({
      ...base,
      hasPoa: true,
      hasSupportingDocuments: true,
      hasAddressCollection: true,
    });
    expect(order.indexOf('supporting-documents')).toBeLessThan(order.indexOf('proof-of-address'));
    expect(order.indexOf('supporting-documents')).toBeLessThan(order.indexOf('address-collection'));
  });

  it('the post-capture chain routes into it and back out', () => {
    expect(stepAfterCapture({ supportingDocuments: ninSlipOnly }, [NIN])).toBe('supporting-documents');
    // Not for an ID it is not scoped to.
    expect(stepAfterCapture({ supportingDocuments: ninSlipOnly }, [BVN])).toBe('submitted');
    // Out of it: Proof of Address, then the address flow, then submission.
    expect(stepAfterSupportingDocuments({ proofOfAddress: { enabled: true } })).toBe('proof-of-address');
    expect(stepAfterSupportingDocuments({ addressCollection: { enabled: true } })).toBe(
      'address-collection',
    );
    expect(stepAfterSupportingDocuments({})).toBe('submitted');
  });
});

describe('hasSupportingDocumentsStep', () => {
  it('is the resolution, not the switch', () => {
    // Enabled with a list that resolves to nothing is still no step — a screen
    // with nothing on it is worse than no screen.
    expect(hasSupportingDocumentsStep(ninSlipOnly, [BVN])).toBe(false);
    expect(hasSupportingDocumentsStep(ninSlipOnly, [NIN])).toBe(true);
  });
});

describe('what the applicant is told a document is for', () => {
  const statement = {
    enabled: true,
    types: [
      {
        key: 'proof_of_funds',
        label: 'Proof of funds',
        fields: [
          { key: 'holder', label: 'Account holder' },
          { key: 'bank', label: 'Bank name' },
          // Blank and repeated names reach nobody, so neither is shown.
          { key: 'blank', label: '  ' },
          { key: 'again', label: 'bank name' },
          { key: 'nameless' },
        ],
      },
    ],
  };

  it('names the values the server will read off it', () => {
    expect(resolveSupportingDocuments(statement, [NIN])[0]!.reads).toEqual([
      'Account holder',
      'Bank name',
    ]);
  });

  it('says nothing when the document is only being stored', () => {
    expect(
      resolveSupportingDocuments({ enabled: true, types: [{ key: 'a', label: 'Signature' }] }, [NIN])[0]!
        .reads,
    ).toEqual([]);
  });
});

describe('mayAskSupportingDocuments (the consent screen’s question)', () => {
  it('discloses a SCOPED document that the step order cannot yet see', () => {
    // The whole reason the second predicate exists. Consent runs before an ID
    // is picked, so the step order has no verified IDs to resolve against and
    // answers "nothing to ask for" — while the flow will certainly ask a NIN
    // verifier for their slip.
    expect(hasSupportingDocumentsStep(ninSlipOnly, [])).toBe(false);
    expect(mayAskSupportingDocuments(ninSlipOnly)).toBe(true);
  });

  it('promises nothing when the step is off', () => {
    expect(mayAskSupportingDocuments(undefined)).toBe(false);
    expect(mayAskSupportingDocuments(null)).toBe(false);
    expect(mayAskSupportingDocuments({ types: ninSlipOnly.types })).toBe(false);
    expect(mayAskSupportingDocuments({ enabled: false, types: ninSlipOnly.types })).toBe(false);
  });

  it('promises nothing when there is no document to ask for', () => {
    expect(mayAskSupportingDocuments({ enabled: true, types: [] })).toBe(false);
    // A nameless entry renders no slot, so it must not put a bullet on consent.
    expect(
      mayAskSupportingDocuments({
        enabled: true,
        types: [{ key: 'draft', label: '  ', required: false, idTypes: [] }],
      }),
    ).toBe(false);
  });
});

describe('how a document is provided', () => {
  const doc = (capture?: string) => ({
    enabled: true,
    types: [{ key: 'signature_specimen', label: 'Signature specimen', ...(capture ? { capture } : {}) }],
  });

  it('carries the capture mode, and reads an unknown one as upload', () => {
    expect(resolveSupportingDocuments(doc() as never, [])[0]?.capture).toBe('upload');
    expect(resolveSupportingDocuments(doc('draw') as never, [])[0]?.capture).toBe('draw');
    expect(resolveSupportingDocuments(doc('draw_or_upload') as never, [])[0]?.capture).toBe('draw_or_upload');
    // A mode a newer workflow adds degrades to the slot this build can draw.
    expect(resolveSupportingDocuments(doc('typed') as never, [])[0]?.capture).toBe('upload');
  });
});
