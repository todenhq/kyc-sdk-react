import type { TextGroup } from '../types';
import { WELCOME_PROCESS_TEXTS } from './welcome-process';

/** The opening (consent) screen: title, description, what happens next, legal line. */
export const WELCOME_TEXTS: TextGroup = {
  id: 'welcome',
  title: 'Welcome',
  entries: [
    { key: 'welcome.redo.title', label: 'Redo notice: title', default: 'A few things to redo' },
    {
      key: 'welcome.title',
      label: 'Title',
      default: 'Identity Verification',
      configPath: ['consent', 'title'],
    },
    { key: 'welcome.title.named', label: 'Title: when the name is known', default: 'Welcome, {firstName}' },
    { key: 'welcome.title.business', label: 'Title: business', default: 'Business Verification' },
    { key: 'welcome.title.address', label: 'Title: address check', default: 'Address Verification' },
    { key: 'welcome.title.faceCheck', label: 'Title: face check', default: 'Face Check' },
    { key: 'welcome.title.faceEnrolment', label: 'Title: face enrolment', default: 'Face Enrolment' },
    { key: 'welcome.title.questionnaire', label: 'Title: questions', default: 'A Few Questions' },
    { key: 'welcome.title.contact', label: 'Title: contact details', default: 'Confirm Your Contact Details' },
    {
      key: 'welcome.description',
      label: 'Description',
      default:
        'We need to verify your identity to comply with regulatory requirements. This process is quick and secure.',
      multiline: true,
      configPath: ['consent', 'description'],
    },
    {
      key: 'welcome.description.business',
      label: 'Description: business',
      default:
        'We need to verify your business to comply with regulatory requirements. This process is quick and secure.',
      multiline: true,
    },
    {
      key: 'welcome.description.address',
      label: 'Description: address check',
      default:
        'We need to confirm your home address to comply with regulatory requirements. This process is quick and secure.',
      multiline: true,
    },
    {
      key: 'welcome.description.faceCheck',
      label: 'Description: face check',
      default: 'A quick face check confirms it is really you. This takes a few seconds and is secure.',
      multiline: true,
    },
    {
      key: 'welcome.description.faceEnrolment',
      label: 'Description: face enrolment',
      default:
        'A quick selfie sets up face checks for next time, so you will not have to prove your identity again. This takes a few seconds and is secure.',
      multiline: true,
    },
    {
      key: 'welcome.description.questionnaire',
      label: 'Description: questions',
      default:
        'A few questions keep your account details up to date and help us comply with regulatory requirements.',
      multiline: true,
    },
    {
      key: 'welcome.description.contact',
      label: 'Description: contact details',
      default:
        'We need to re-confirm the email address and phone number on your account. This takes a minute and is secure.',
      multiline: true,
    },
    ...WELCOME_PROCESS_TEXTS,
    {
      key: 'welcome.legal',
      label: 'Legal notice',
      default:
        'By tapping Continue, you agree to the {terms} and {privacy}, and consent to your personal data being processed to verify your identity.',
      multiline: true,
      placeholders: ['terms', 'privacy'],
    },
    {
      key: 'welcome.legal.business',
      label: 'Legal notice: business',
      default:
        'By tapping Continue, you agree to the {terms} and {privacy}, and consent to your business and personal data being processed to verify your identity.',
      multiline: true,
      placeholders: ['terms', 'privacy'],
    },
    { key: 'welcome.legal.termsLink', label: 'Legal notice: terms link', default: 'End User Terms' },
    { key: 'welcome.legal.privacyLink', label: 'Legal notice: privacy link', default: 'Privacy Policy' },
    // When the org's own logo replaces Myaza's in the footer, the notice names
    // Myaza as the provider (it still processes the applicant's data) and the
    // terms as Myaza's, all in the one paragraph. Never customisable.
    { key: 'welcome.legal.providedFor', label: 'Legal notice: processed by Toden for', default: 'Verification is processed by Toden for {org}.', placeholders: ['org'] },
    { key: 'welcome.legal.providedByMyaza', label: 'Legal notice: processed by Toden', default: 'Verification is processed by Toden.' },
    {
      key: 'welcome.legal.myaza',
      label: 'Legal notice: Toden terms',
      default:
        'By tapping Continue, you agree to Toden’s {terms} and {privacy}, and consent to your personal data being processed to verify your identity.',
      multiline: true,
      placeholders: ['terms', 'privacy'],
    },
    {
      key: 'welcome.legal.myaza.business',
      label: 'Legal notice: Toden terms, business',
      default:
        'By tapping Continue, you agree to Toden’s {terms} and {privacy}, and consent to your business and personal data being processed to verify your identity.',
      multiline: true,
      placeholders: ['terms', 'privacy'],
    },
    {
      key: 'welcome.legal.faceAndRecording',
      label: 'Legal notice: face and recording',
      default: 'This includes facial recognition and recording this session.',
      multiline: true,
    },
    {
      key: 'welcome.legal.recording',
      label: 'Legal notice: recording',
      default: 'This includes recording this session.',
    },
    {
      key: 'welcome.secureNote',
      label: 'Security note',
      default: 'Your data is encrypted and securely processed',
    },
  ],
};
