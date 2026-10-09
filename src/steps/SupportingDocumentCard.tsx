'use client';

import React, { useRef, useState } from 'react';
import { Check, FileText, Loader2, PenLine, Upload, X } from '../components/icons';
import { SignaturePreview } from '../components/SignaturePreview';
import { UploadedFileThumb } from '../components/UploadedFilePreview';
import { useText } from '../i18n';
import { BUSINESS_DOC_ACCEPTED_MIMES } from './BusinessDocumentSlot';
import { SupportingDocumentSignature } from './SupportingDocumentSignature';
import type { SignatureDrawing } from '../lib/signature';

interface SupportingDocumentCardProps {
  /** 1-based, so the list reads as a checklist rather than a pile. */
  position: number;
  total: number;
  label: string;
  /** Guidance the organisation wrote: which document, and what it has to show. */
  description: string | null;
  required: boolean;
  /** The named values the server will read off it, in the author's words. */
  reads: string[];
  fileName: string | null;
  /** The in-memory File for a thumbnail (null after a remount lost it). */
  file: File | null;
  uploading: boolean;
  error: string | null;
  onPick: (file: File) => void;
  onRemove: () => void;
  /** How it is provided: a file, a signature drawn on screen, or either. */
  capture: 'upload' | 'draw' | 'draw_or_upload';
  /** The provided document was signed on screen. */
  drawn: boolean;
  onSign: (drawing: SignatureDrawing) => void;
}

/**
 * One requested document: what it is, what it is being taken FOR, and the
 * upload that satisfies it.
 *
 * The middle part is the point. A supporting document is whatever the
 * organisation named it, so an upload slot with a title on it tells the
 * applicant almost nothing; naming the values that will be read off it says
 * what the document is actually for, and is the honest thing to show somebody
 * before they hand over a bank statement.
 */
export function SupportingDocumentCard({
  position,
  total,
  label,
  description,
  required,
  reads,
  fileName,
  file,
  uploading,
  error,
  onPick,
  onRemove,
  capture,
  drawn,
  onSign,
}: SupportingDocumentCardProps) {
  const t = useText();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploaded = fileName !== null;
  const errorId = `supporting-doc-error-${position}`;
  // Where the workflow offers both, the pad comes first: it is the shorter way.
  const [uploadInstead, setUploadInstead] = useState(false);
  const signing = capture !== 'upload' && !uploadInstead;
  // What was signed, kept so it can be shown once saved and reopened by Edit.
  // It lives only as long as this screen: a resumed session shows the pen mark.
  const [signed, setSigned] = useState<SignatureDrawing | null>(null);

  return (
    <section
      aria-label={label}
      // One surface for both states, from `--secondary` — the token theme.ts
      // fills with the flow's own surfaceColor. It was `bg-card`, which emitted
      // NOTHING: `--color-card` is declared nowhere in globals.css, so the
      // utility never existed and this card had no background at all, sitting
      // transparent on the page while the wells inside it DID take the brand.
      // That is the mismatch — a brand-tinted page showing through an untinted
      // card. Uploaded is carried by the border and the solid tick in the
      // marker rather than a wash, so both states share one elevation.
      className={`overflow-hidden rounded-2xl border bg-secondary transition-colors ${
        uploaded ? 'border-primary/40' : 'border-border'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={BUSINESS_DOC_ACCEPTED_MIMES.join(',')}
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onPick(picked);
          e.target.value = '';
        }}
      />

      <div className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          {/* The marker doubles as the tick: a count while the document is
              outstanding, and a state anybody can read once it is not. */}
          <span
            aria-hidden="true"
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors ${
              uploaded ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
            }`}
          >
            {uploaded ? <Check className="h-4 w-4" /> : total > 1 ? position : <FileText className="h-3.5 w-3.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug">{label}</p>
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-foreground/70">{description}</p>
            )}
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              required ? 'bg-destructive/10 text-destructive' : 'bg-background text-muted-foreground'
            }`}
          >
            {t(required ? 'supportingDocuments.card.required' : 'supportingDocuments.card.optional')}
          </span>
        </div>

        {reads.length > 0 && (
          <div className="rounded-xl bg-background px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('supportingDocuments.card.reads')}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {reads.map((read) => (
                <li
                  key={read}
                  className="flex items-center gap-1 rounded-full border border-border/70 bg-secondary px-2 py-1 text-[11px] text-foreground/80"
                >
                  <Check className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                  {read}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-border/60 p-3">
        {uploaded ? (
          <div className="flex items-center gap-3">
            {drawn && signed ? (
              <SignaturePreview drawing={signed} label={t('supportingDocuments.signature.preview')} />
            ) : drawn ? (
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <PenLine className="h-4 w-4" />
              </span>
            ) : (
              <UploadedFileThumb file={file} label={label} />
            )}
            <p className="min-w-0 flex-1 truncate text-sm font-medium">
              {drawn ? t('supportingDocuments.signature.saved') : fileName}
            </p>
            <button
              type="button"
              className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
              // Edit reopens the pad with the signature in it; replacing a file opens the picker.
              onClick={() => (drawn ? onRemove() : inputRef.current?.click())}
            >
              {drawn && <PenLine className="h-3.5 w-3.5" aria-hidden="true" />}
              {t(drawn ? 'supportingDocuments.signature.redo' : 'supportingDocuments.card.replace')}
            </button>
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={() => {
                setSigned(null);
                onRemove();
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : signing ? (
          <SupportingDocumentSignature
            label={label}
            saving={uploading}
            initial={signed}
            onSave={(drawing) => {
              setSigned(drawing);
              onSign(drawing);
            }}
            onUploadInstead={capture === 'draw_or_upload' ? () => setUploadInstead(true) : undefined}
          />
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            aria-describedby={error ? errorId : undefined}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl border-2 border-dashed border-border px-3 py-3 text-left transition-colors hover:border-primary/50 hover:bg-background/60 disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
            ) : (
              <Upload className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                {uploading
                  ? t('supportingDocuments.card.uploading')
                  : t('supportingDocuments.card.upload', { document: label.toLowerCase() })}
              </span>
              <span className="block text-[11px] text-muted-foreground">{t('supportingDocuments.card.uploadHint')}</span>
            </span>
          </button>
        )}

        {!uploaded && capture === 'draw_or_upload' && uploadInstead && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => setUploadInstead(false)}
            className="mt-1 min-h-11 w-full rounded-lg px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            {t('supportingDocuments.signature.drawInstead')}
          </button>
        )}

        {error && (
          <p id={errorId} role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
