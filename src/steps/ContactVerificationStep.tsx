'use client';

import React, { useRef, useState } from 'react';
import { CircleCheck, Loader2, Mail, Smartphone } from '../components/icons';
import { StepHeader } from '../components/StepHeader';
import { Button } from '../components/ui/button';
import { ContactChannelPicker, channelName } from '../components/ContactChannelPicker';
import { offeredPhoneChannels, type PhoneOtpChannel } from '../lib/contact-channels';
import { useText } from '../i18n';
import { ContactDestinationField } from './ContactDestinationField';
import { ContactCodePanel } from './ContactCodePanel';
import { stepAfterContactVerified } from './contact-recovery';
import { useVerificationContext } from '../context/VerificationContext';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { stepAfterContact } from '../lib/contact-steps';
import { isBusinessFlow } from '../lib/business';
import { describeSendError, describeCheckError } from '../lib/contact-errors';
import { defaultCountry } from '../lib/country-default';

// Contact-verification OTP step (email or phone — one component, two mounts).
// enter → send → code entry → verified → continue. The proof token is stored
// in the reducer and submitted with /verify (contact.emailToken/phoneToken).

const DEFAULT_CODE_LENGTH = 6;

export function ContactVerificationStep({ channel }: { channel: 'email' | 'phone' }) {
  const { state, dispatch } = useVerificationContext();
  const config = useVerificationConfig();
  const t = useText();
  const isEmail = channel === 'email';
  const stepConfig = isEmail ? config.emailVerification : config.phoneVerification;
  const required = stepConfig?.required !== false;
  const codeLength = Math.min(8, Math.max(4, stepConfig?.codeLength ?? DEFAULT_CODE_LENGTH));
  const maxAttempts = stepConfig?.maxAttempts;
  const alreadyVerified = isEmail ? state.contact.emailToken != null : state.contact.phoneToken != null;

  // Email: the typed address is the destination. Phone: the PhoneNumberInput
  // emits the E.164 value + validity; we send that.
  const [email, setEmail] = useState((isEmail ? state.contact.emailAddress : '') ?? '');
  const [phone, setPhone] = useState<{ e164: string; isValid: boolean }>({
    e164: state.contact.phoneNumber ?? '',
    isValid: false,
  });
  const destination = isEmail ? email.trim() : phone.e164;
  // In the builder preview, Send is always enabled so the org can reach (and
  // preview) the code-entry screen — with its two input styles + the configured
  // number of slots — in one click, without typing a real destination.
  const canSend = config.previewMode || (isEmail ? /.+@.+\..+/.test(destination) : phone.isValid);

  // Delivery channel. The org chooses what's ON OFFER; the person receiving the
  // code chooses between them — only they know whether they have WhatsApp, or
  // whether SMS is landing for them today. One offered channel = no choice to
  // make, and the picker renders nothing.
  const offeredChannels: PhoneOtpChannel[] = isEmail
    ? []
    : offeredPhoneChannels(config.phoneVerification?.channels);
  const [via, setVia] = useState<PhoneOtpChannel>(offeredChannels[0] ?? 'sms');
  const otherChannel = offeredChannels.find((c) => c !== via) ?? null;

  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Entered via submit recovery? (The server refused this channel's proof at
  // submit — the token had expired or was already claimed — so the person was
  // walked back here.) Captured at mount: verifying clears the flag, and
  // Continue must still route back to 'submitted' afterwards.
  const expiredList = Array.isArray(state.contact.expired) ? state.contact.expired : [];
  const recovery = useRef(expiredList.includes(channel)).current;

  const advance = () =>
    dispatch({
      type: 'SET_STEP',
      payload: stepAfterContactVerified({
        recovery,
        expired: expiredList,
        channel,
        forward: stepAfterContact(
          { ...config, subjectTypeIsBusiness: isBusinessFlow(config) },
          isEmail ? 'email-verification' : 'phone-verification',
        ),
      }),
    });

  /** `switchTo` re-sends over the other channel when the first one didn't land. */
  const send = async (switchTo?: PhoneOtpChannel) => {
    const sendVia = switchTo ?? via;
    if (switchTo) setVia(switchTo);
    setBusy(true);
    setError(null);
    try {
      const res = await config.api.contactSend({
        channel,
        destination,
        codeLength,
        ...(maxAttempts != null ? { maxAttempts } : {}),
        ...(isEmail ? {} : { via: sendVia }),
      });
      setChallengeId(res.challengeId);
      setExpiresAt(res.expiresAt ?? null);
      setCode('');
    } catch (err) {
      setError(describeSendError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const check = async (submitted?: string) => {
    const value = (submitted ?? code).trim();
    if (!challengeId || value.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      // The session + country let the server charge this check as it runs
      // rather than at submit. Both are optional and validated server-side, so
      // an older SDK simply keeps the old billing moment.
      // The session lets the server bill this component on completion, which is
      // this call. Optional: without it the charge happens at submit.
      const res = await config.api.contactCheck({
        challengeId,
        code: value,
        ...(state.sessionId ? { sessionId: state.sessionId } : {}),
        ...(config.country ? { country: config.country } : {}),
      });
      dispatch({ type: 'SET_CONTACT_PROOF', payload: { channel, token: res.token, destination } });
      advance();
    } catch (err) {
      setError(describeCheckError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const Icon = isEmail ? Mail : Smartphone;

  return (
    <div className="space-y-6 animate-slide-up">
      <StepHeader
        title={t(isEmail ? 'contact.email.title' : 'contact.phone.title')}
        description={t(
          `contact.${channel}.${challengeId ? 'codeSent' : 'intro'}`,
          { codeLength, destination, channel: channelName(via, t) },
        )}
      />

      {recovery && !alreadyVerified && (
        <div className="rounded-xl bg-secondary/15 p-4 text-sm">
          {t(`contact.${channel}.recovery`)}
        </div>
      )}

      {alreadyVerified ? (
        <div className="flex items-center gap-3 rounded-xl bg-primary/5 p-4">
          <CircleCheck className="h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm font-medium">
            {t('contact.verified', {
              destination: isEmail ? state.contact.emailAddress : state.contact.phoneNumber,
            })}
          </p>
        </div>
      ) : !challengeId ? (
        <div className="space-y-4">
          <ContactDestinationField
            isEmail={isEmail}
            email={email}
            onEmailChange={setEmail}
            onPhoneChange={setPhone}
            // The APPLICANT's own number, so where they are beats which
            // register this flow checks. An org-configured default still wins:
            // that is a decision somebody made about their own customers.
            geoCountry={config.serverConfig?.geoCountry}
            defaultCountry={defaultCountry(
              config.phoneVerification?.defaultCountry,
              config.serverConfig?.geoCountry,
              config.country,
            )}
            disabled={busy}
          />
          <ContactChannelPicker offered={offeredChannels} picked={via} onPick={setVia} disabled={busy} />
        </div>
      ) : (
        <ContactCodePanel
          code={code}
          onChange={setCode}
          onComplete={(c) => check(c)}
          codeLength={codeLength}
          style={stepConfig?.inputStyle ?? 'segmented'}
          expiresAt={expiresAt}
          onResend={send}
          otherChannel={otherChannel}
          disabled={busy}
        />
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-3">
        {alreadyVerified ? (
          <Button className="w-full" onClick={advance}>
            {t('common.continue')}
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={() => (challengeId ? check() : send())}
            disabled={busy || (challengeId ? code.trim().length < 4 : !canSend)}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t(challengeId ? 'contact.verifyCode' : 'contact.sendCode')}
          </Button>
        )}
        {!required && !alreadyVerified && (
          <button
            type="button"
            className="mx-auto block w-fit text-sm text-muted-foreground hover:text-foreground"
            onClick={advance}
          >
            {t('contact.skip')}
          </button>
        )}
      </div>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        {t(`contact.${channel}.footer`)}
      </p>
    </div>
  );
}
