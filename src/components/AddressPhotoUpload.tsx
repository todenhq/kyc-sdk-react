'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Camera, CircleCheck, Loader2, RefreshCcw, X } from './icons';
import { useText } from '../i18n';

// The entrance-photo capture as the HERO of its screen (redesign 2026-08-29):
// a tall dropzone while empty — the screen is about one decision, so the zone
// owns it — and the photo itself at full width once picked, with pill
// controls overlaid. The preview object URL lives here so the person can SEE
// what they attached — the only way to catch a wrong pick from the camera
// roll before submitting.

const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

export function isAcceptedAddressPhoto(file: File): boolean {
  return PHOTO_MIMES.includes((file.type.split(';')[0] || '').toLowerCase());
}

interface AddressPhotoUploadProps {
  required: boolean;
  uploaded: boolean;
  uploading: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}

export function AddressPhotoUpload({ required, uploaded, uploading, onPick, onRemove }: AddressPhotoUploadProps) {
  const t = useText();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (file: File) => {
    if (isAcceptedAddressPhoto(file)) {
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
    }
    onPick(file);
  };

  const overlayPill =
    'inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium shadow backdrop-blur-sm transition-colors hover:bg-background';

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_MIMES.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) pick(file);
          e.target.value = '';
        }}
      />

      {uploaded && !uploading ? (
        <div className="relative overflow-hidden rounded-2xl border border-border">
          {preview ? (
            <img src={preview} alt="Entrance photo" className="h-[300px] w-full object-cover sm:h-[340px]" />
          ) : (
            // A restored session holds the uploaded mediaId but not the bytes.
            <div className="flex h-[300px] w-full flex-col items-center justify-center gap-2 bg-muted/30 sm:h-[340px]">
              <CircleCheck className="h-8 w-8 text-[var(--verification-success,#0DA211)]" />
              <p className="text-sm font-semibold">{t('address.photo.added')}</p>
            </div>
          )}
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary shadow backdrop-blur-sm">
            <CircleCheck className="h-3 w-3" /> {t('address.photo.badge')}
          </span>
          <div className="absolute bottom-3 right-3 flex gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} className={overlayPill}>
              <RefreshCcw className="h-3.5 w-3.5" /> {t('address.photo.replace')}
            </button>
            <button
              type="button"
              onClick={() => {
                setPreview((prev) => {
                  if (prev) URL.revokeObjectURL(prev);
                  return null;
                });
                onRemove();
              }}
              className={overlayPill}
              aria-label="Remove photo"
            >
              <X className="h-3.5 w-3.5" /> {t('address.photo.remove')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="group flex min-h-[300px] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border px-6 py-8 text-center transition-colors hover:border-primary/60 hover:bg-primary/5 disabled:opacity-70 sm:min-h-[340px]"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform group-hover:scale-105">
            {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
          </span>
          <span className="space-y-1">
            <span className="block text-base font-semibold">
              {uploading ? t('address.photo.uploading') : t('address.photo.cta')}
            </span>
            {!uploading && (
              <span className="block text-sm text-muted-foreground">
                {t(required ? 'address.photo.hint' : 'address.photo.hint.optional')}
              </span>
            )}
          </span>
          {!uploading && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {t('address.photo.formats')}
            </span>
          )}
        </button>
      )}
    </>
  );
}
