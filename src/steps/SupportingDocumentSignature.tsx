'use client';

import React, { useState } from 'react';
import { Loader2 } from '../components/icons';
import { SignaturePad } from '../components/SignaturePad';
import { Button } from '../components/ui/button';
import { hasSignature, type SignatureDrawing } from '../lib/signature';
import { useText } from '../i18n';

interface SupportingDocumentSignatureProps {
  label: string;
  saving: boolean;
  /** The signature being edited, when there is one. */
  initial?: SignatureDrawing | null;
  /** Offered when the workflow also takes a photo of a signature on paper. */
  onUploadInstead?: () => void;
  onSave: (drawing: SignatureDrawing) => void;
}

/**
 * The sign-on-screen half of a supporting document: the pad, and one button
 * that keeps what was drawn. The button stays disabled until there is real
 * ink, so nobody saves a dot.
 */
export function SupportingDocumentSignature({ label, saving, initial, onUploadInstead, onSave }: SupportingDocumentSignatureProps) {
  const t = useText();
  const [drawing, setDrawing] = useState<SignatureDrawing | null>(initial ?? null);
  const [ready, setReady] = useState(initial ? hasSignature(initial) : false);

  return (
    <div className="space-y-2">
      <SignaturePad
        label={t('supportingDocuments.signature.padLabel', { document: label })}
        hint={t('supportingDocuments.signature.hint')}
        clearLabel={t('supportingDocuments.signature.clear')}
        expandLabel={t('supportingDocuments.signature.expand')}
        shrinkLabel={t('supportingDocuments.signature.shrink')}
        disabled={saving}
        initial={initial}
        onChange={(next, enough) => {
          setDrawing(next);
          setReady(enough);
        }}
      />
      <Button
        type="button"
        className="w-full"
        disabled={!ready || saving || !drawing}
        onClick={() => drawing && onSave(drawing)}
      >
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        {t(saving ? 'supportingDocuments.signature.saving' : 'supportingDocuments.signature.save')}
      </Button>
      {onUploadInstead && (
        <button
          type="button"
          disabled={saving}
          onClick={onUploadInstead}
          className="min-h-11 w-full rounded-lg px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
        >
          {t('supportingDocuments.signature.uploadInstead')}
        </button>
      )}
    </div>
  );
}
