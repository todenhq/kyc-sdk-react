'use client';

import React, { useRef } from 'react';
import { CircleCheck, Loader2, Upload, X } from '../components/icons';
import { UploadedFileThumb } from '../components/UploadedFilePreview';
import { UPLOAD_HINT } from '../lib/upload-limits';
import { useText } from '../i18n';

export const BUSINESS_DOC_ACCEPTED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

interface BusinessDocumentSlotProps {
  label: string;
  /**
   * Guidance the organisation wrote: which document, and what it has to show.
   * Optional because the business-documents step names a fixed catalogue the
   * applicant already recognises; a supporting document is whatever the org
   * called it, so this is often the only thing that makes it findable.
   */
  description?: string | null;
  required: boolean;
  /** Uploaded file name, when this slot already has a mediaId. */
  fileName: string | null;
  /** The in-memory File for tap-to-preview (null after a remount lost it). */
  file: File | null;
  uploading: boolean;
  error: string | null;
  onPick: (file: File) => void;
  onRemove: () => void;
}

/**
 * One upload slot on the business-documents step: a picker (photo or PDF) that
 * uploads immediately, then an uploaded row with replace/remove.
 */
export function BusinessDocumentSlot({
  label,
  description,
  required,
  fileName,
  file,
  uploading,
  error,
  onPick,
  onRemove,
}: BusinessDocumentSlotProps) {
  const t = useText();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploaded = fileName !== null;

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept={BUSINESS_DOC_ACCEPTED_MIMES.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = '';
        }}
      />

      {uploaded ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4">
          {file ? (
            <UploadedFileThumb file={file} label={label} />
          ) : (
            <CircleCheck className="h-5 w-5 shrink-0 text-[var(--verification-success,#0DA211)]" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => inputRef.current?.click()}
          >
            {t('business.documents.replace')}
          </button>
          <button
            type="button"
            aria-label={`Remove ${label}`}
            onClick={onRemove}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-border p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/30"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
          ) : (
            <Upload className="h-5 w-5 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {label}
              {required && <span className="text-destructive"> *</span>}
            </span>
            {description && !uploading && (
              <span className="mt-0.5 block text-xs leading-relaxed text-foreground/70">{description}</span>
            )}
            <span className="block text-xs text-muted-foreground">
              {uploading ? t('business.documents.uploading') : UPLOAD_HINT}
            </span>
          </span>
        </button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
