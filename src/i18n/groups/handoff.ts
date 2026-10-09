import type { TextGroup } from '../types';

/** "Continue on your phone": the desktop gate with its QR, and the mobile hand-off sheet. */
export const HANDOFF_TEXTS: TextGroup = {
  id: 'handoff',
  title: 'Continue on Your Phone',
  entries: [
    { key: 'handoff.gate.title', label: 'Title', default: 'Continue on your phone' },
    {
      key: 'handoff.gate.description',
      label: 'Description',
      default: 'Scan the QR code with your phone to continue your verification there, handy for capturing your ID and selfie.',
      multiline: true,
    },
    {
      key: 'handoff.gate.description.noCamera',
      label: 'Description: device has no camera',
      default: 'This device has no camera. Scan the QR code with your phone to finish your verification there.',
      multiline: true,
    },
    {
      key: 'handoff.gate.description.mobileOnly',
      label: 'Description: mobile devices only',
      default:
        'This verification can only be completed on a mobile device. Scan the QR code with your phone to continue there.',
      multiline: true,
    },
    { key: 'handoff.codeLabel', label: 'Short code label', default: 'Or enter this code' },
    { key: 'handoff.copyLink', label: 'Copy link button', default: 'Copy link' },
    { key: 'handoff.gate.linkCopied', label: 'Link copied', default: 'Link copied' },
    { key: 'handoff.gate.opened', label: 'Opened on the phone', default: 'Continuing on your phone…' },
    { key: 'handoff.continueHere', label: 'Continue on this device button', default: 'Continue on this device' },
    { key: 'handoff.leaving', label: 'Switching to this device', default: 'Switching…' },
    {
      key: 'handoff.leave.unresolved',
      label: 'Leaving: no link to give back',
      default: 'We could not confirm which device owns this verification. Try generating the link again.',
      multiline: true,
    },
    {
      key: 'handoff.leave.inUse.phone',
      label: 'Leaving: already open on the phone',
      default: 'This verification is already open on your phone. Continue there.',
      multiline: true,
    },
    {
      key: 'handoff.leave.inUse.otherDevice',
      label: 'Leaving: already open on the other device',
      default: 'This verification is already open on your other device. Continue there.',
      multiline: true,
    },
    {
      key: 'handoff.leave.serverError',
      label: 'Leaving: server error',
      default: 'We could not reach the server to release this verification. Try again in a moment.',
      multiline: true,
    },
    {
      key: 'handoff.leave.refused',
      label: 'Leaving: refused',
      default: 'We could not release this verification. Try again, or continue on the other device.',
      multiline: true,
    },
    {
      key: 'handoff.leave.offline',
      label: 'Leaving: offline',
      default: 'We could not reach the server to release this verification. Check your connection and try again.',
      multiline: true,
    },
    {
      key: 'handoff.gate.computerNotAllowed',
      label: 'Mobile only: not on a computer',
      default: 'This verification can’t be completed on a computer.',
    },
    { key: 'handoff.expired.title', label: 'Link expired: title', default: 'Link expired' },
    {
      key: 'handoff.expired.description',
      label: 'Link expired: description',
      default: 'This verification link timed out. Generate a new one, or continue on this device.',
      multiline: true,
    },
    { key: 'handoff.regenerate', label: 'Generate a new link button', default: 'Generate a new link' },
    { key: 'handoff.linkFailed.title', label: 'Link failed: title', default: 'Couldn’t create the link' },
    {
      key: 'handoff.linkFailed.description',
      label: 'Link failed: description',
      default: 'We could not prepare the link for your phone. Try again before continuing this verification.',
      multiline: true,
    },
    { key: 'handoff.mobileOnly.title', label: 'Mobile only, no QR: title', default: 'Continue on a mobile device' },
    {
      key: 'handoff.mobileOnly.description',
      label: 'Mobile only, no QR: description',
      default:
        'This verification can only be completed on a phone or tablet. Open it on your mobile device to continue.',
      multiline: true,
    },
    { key: 'handoff.completed.title', label: 'Completed on the phone: title', default: 'Completed on your phone' },
    {
      key: 'handoff.completed.description',
      label: 'Completed on the phone: description',
      default: 'Your verification has been submitted for review. You can close this window.',
      multiline: true,
    },
    { key: 'handoff.sheet.trigger', label: 'Mobile: other device link', default: 'Continue on a different device' },
    { key: 'handoff.sheet.title', label: 'Mobile sheet: title', default: 'Continue on another device' },
    {
      key: 'handoff.sheet.description',
      label: 'Mobile sheet: description',
      default: 'Scan the QR code with another device to continue your verification there.',
      multiline: true,
    },
    {
      key: 'handoff.sheet.error',
      label: 'Mobile sheet: link failed',
      default: "Couldn't create a handoff link. Check your connection and try again.",
      multiline: true,
    },
    { key: 'handoff.sheet.copied', label: 'Mobile sheet: link copied', default: 'Copied' },
    { key: 'handoff.sheet.opened', label: 'Mobile sheet: opened elsewhere', default: 'Continuing on the other device…' },
    {
      key: 'handoff.sheet.completed.title',
      label: 'Mobile sheet: completed',
      default: 'Completed on the other device',
    },
    { key: 'handoff.sheet.completed.closing', label: 'Mobile sheet: closing', default: 'Closing this flow…' },
    { key: 'handoff.sheet.stayButton', label: 'Mobile sheet: stay button', default: "I'll stay on this device" },
  ],
};
