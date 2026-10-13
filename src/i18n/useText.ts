'use client';

import { useMemo } from 'react';
import { useOptionalVerificationConfig } from '../context/VerificationConfigContext';
import { createTextFn } from './translate';
import type { TextFn } from './types';

/**
 * `t(key, vars?)` for the current workflow: its custom copy in the flow's
 * language, else English, else the SDK default. `{firstName}`, `{lastName}`
 * and `{businessName}` are filled from `userData` everywhere, so any text may
 * use them. Outside a VerificationConfigProvider it returns the defaults.
 */
export function useText(): TextFn {
  const config = useOptionalVerificationConfig();
  const texts = config?.texts;
  const language = config?.language;
  const firstName = config?.userData?.firstName;
  const lastName = config?.userData?.lastName;
  const businessName = config?.userData?.businessName;
  return useMemo(
    () => createTextFn(texts, language, { firstName, lastName, businessName }),
    [texts, language, firstName, lastName, businessName],
  );
}
