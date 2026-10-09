import type { TextGroup } from '../types';
import { UPLOAD_HINT } from '../../lib/upload-limits';

/** The step's own copy. Each document's title and guidance are the organisation's own. */
export const SUPPORTING_DOCUMENTS_TEXTS: TextGroup = {
  id: 'supportingDocuments',
  title: 'Supporting Documents',
  entries: [
    { key: 'supportingDocuments.title', label: 'Title', default: 'Supporting documents' },
    {
      key: 'supportingDocuments.intro.optional.one',
      label: 'Description: one optional document',
      default: 'Upload this document if you have it, so we can keep it on file. You can skip it.',
      multiline: true,
    },
    {
      key: 'supportingDocuments.intro.optional.many',
      label: 'Description: several optional documents',
      default: 'Upload any of these you have, so we can keep them on file. You can skip the rest.',
      multiline: true,
    },
    {
      key: 'supportingDocuments.intro.required.one',
      label: 'Description: one required document',
      default: 'We need this document to continue. Upload it below.',
    },
    {
      key: 'supportingDocuments.intro.required.all',
      label: 'Description: several required documents',
      default: 'We need all {total} of these documents to continue. Upload one for each item below.',
      placeholders: ['total'],
      multiline: true,
    },
    {
      key: 'supportingDocuments.intro.mixed',
      label: 'Description: some required',
      default: 'We need {required} of these {total} documents to continue, marked with *. Upload the others if you have them.',
      placeholders: ['required', 'total'],
      multiline: true,
    },
    { key: 'supportingDocuments.card.required', label: 'Badge: required', default: 'Required' },
    { key: 'supportingDocuments.card.optional', label: 'Badge: optional', default: 'Optional' },
    { key: 'supportingDocuments.card.reads', label: 'What we read heading', default: 'What we read from it' },
    {
      key: 'supportingDocuments.card.upload',
      label: 'Upload button',
      default: 'Upload {document}',
      placeholders: ['document'],
    },
    { key: 'supportingDocuments.card.uploading', label: 'Uploading', default: 'Uploading…' },
    {
      key: 'supportingDocuments.card.uploadHint',
      label: 'Upload hint',
      default: UPLOAD_HINT,
    },
    { key: 'supportingDocuments.card.replace', label: 'Replace button', default: 'Replace' },
    { key: 'supportingDocuments.signature.padLabel', label: 'Signature box name', default: 'Sign here: {document}', placeholders: ['document'] },
    { key: 'supportingDocuments.signature.hint', label: 'Signature box hint', default: 'Sign here with your index finger or mouse' },
    { key: 'supportingDocuments.signature.clear', label: 'Clear signature button', default: 'Clear' },
    { key: 'supportingDocuments.signature.expand', label: 'Make the signature box bigger', default: 'Expand' },
    { key: 'supportingDocuments.signature.shrink', label: 'Make the signature box smaller', default: 'Collapse' },
    { key: 'supportingDocuments.signature.save', label: 'Save signature button', default: 'Use this signature' },
    { key: 'supportingDocuments.signature.saving', label: 'Saving signature', default: 'Saving…' },
    { key: 'supportingDocuments.signature.saved', label: 'Signature saved', default: 'Signed on screen' },
    { key: 'supportingDocuments.signature.redo', label: 'Edit signature button', default: 'Edit' },
    { key: 'supportingDocuments.signature.preview', label: 'Signature preview name', default: 'Your signature' },
    { key: 'supportingDocuments.signature.uploadInstead', label: 'Upload a photo instead', default: 'Upload a photo of your signature instead' },
    { key: 'supportingDocuments.signature.drawInstead', label: 'Sign on screen instead', default: 'Sign on screen instead' },
    { key: 'supportingDocuments.error.signatureEmpty', label: 'Error: nothing signed', default: 'Please sign in the box first.' },
    { key: 'supportingDocuments.error.signatureFailed', label: 'Error: signature not saved', default: 'Your signature could not be saved. Please check your connection and try again.' },
    {
      key: 'supportingDocuments.error.fileType',
      label: 'Error: wrong file type',
      default: 'Please upload a PDF, JPG or PNG file.',
    },
    {
      key: 'supportingDocuments.error.pdfTooLarge',
      label: 'Error: PDF too large',
      default: 'PDF is too large (max 15 MB).',
    },
    {
      key: 'supportingDocuments.error.imageTooLarge',
      label: 'Error: image too large',
      default: 'Image is too large (max 5 MB).',
    },
    {
      key: 'supportingDocuments.error.uploadFailed',
      label: 'Error: upload failed',
      default: 'Upload failed. Please check your connection and try again.',
    },
  ],
};
