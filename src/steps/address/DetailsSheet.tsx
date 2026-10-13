'use client';

import React, { useEffect, useState } from 'react';
import { X } from '../../components/icons';
import { Drawer, DrawerContent, DrawerTitle } from '../../components/ui/drawer';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { AddressDirectionsField } from '../../components/AddressDirectionsField';
import { AreaFields, Field, SectionHeading, type DetailPatch, type DetailValues } from './DetailsSheetFields';
import { addressFieldModes, type AddressFieldKey, type AddressFieldMode } from './address-field-modes';
import type { AddressCollectionConfig } from '../../types/config';
import type { VerificationState } from '../../context/types';
import { useText } from '../../i18n';

/**
 * The EDIT-DETAILS sheet, OkHi-style (user decision 2026-08-31): everything
 * on the address is editable. Two grouped sections — street and building,
 * then area and region — with the map's answer prefilling the area fields so
 * the applicant corrects rather than retypes. An untouched prefill is never
 * stored as their claim (the parent only receives what they actually edit).
 * House sheet pattern: draggable bottom drawer on mobile, right-side sheet
 * on desktop.
 */
type Parts = NonNullable<NonNullable<VerificationState['address']>['parts']>;

export function DetailsSheet({
  open,
  isBusiness,
  parts,
  country,
  directionsRequired,
  addressConfig,
  values,
  disabled,
  onChange,
  onClose,
}: {
  open: boolean;
  isBusiness: boolean;
  /** The map's answer, broken down — the prefill for the area fields. */
  parts: Parts | null;
  /** The flow's ISO-2 country (read-only: a verification fact, not a field). */
  country: string | null;
  directionsRequired: boolean;
  /** The workflow's address block — per-field modes ('off' hides a field,
   *  'required' marks it and holds the pin step's Continue). */
  addressConfig?: AddressCollectionConfig;
  values: DetailValues;
  disabled?: boolean;
  onChange: (patch: DetailPatch) => void;
  onClose: () => void;
}) {
  const t = useText();
  // The right-side sheet is a DESKTOP shape: width alone misjudges wide
  // phones (landscape) and emulated viewports, so the pointer must be fine
  // too — a touch device gets the bottom drawer whatever its width. Live,
  // not a mount-time snapshot: a resize or rotation re-decides.
  const DESKTOP_MQ = '(min-width: 640px) and (hover: hover) and (pointer: fine)';
  const [direction, setDirection] = useState<'bottom' | 'right'>(() =>
    typeof window !== 'undefined' && window.matchMedia(DESKTOP_MQ).matches ? 'right' : 'bottom',
  );
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const apply = () => setDirection(mq.matches ? 'right' : 'bottom');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!open) return null;

  const modes = addressFieldModes(addressConfig);
  const on = (key: AddressFieldKey) => modes[key] !== 'off';
  const req = (key: AddressFieldKey) => modes[key] === 'required';
  const anyRequired = Object.values(modes).some((m: AddressFieldMode) => m === 'required');

  // Typed wins (a cleared field STAYS cleared); the map's answer fills the
  // gap only while the applicant has never touched the field.
  const shown = (typed: string | undefined, part: string | null | undefined) =>
    typed ?? part?.trim() ?? '';

  return (
    <Drawer open direction={direction} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent direction={direction}>
        <div className={cn('px-4 sm:px-6', direction === 'right' ? 'pt-5' : 'pt-3')}>
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-base font-bold">{t('address.details.title')}</DrawerTitle>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(anyRequired ? 'address.details.hint.required' : 'address.details.hint')}
          </p>
        </div>

        <div
          className={cn(
            'space-y-5 overflow-y-auto px-4 pb-2 pt-4 sm:px-6',
            direction === 'right' ? 'flex-1' : 'max-h-[70vh]',
          )}
        >
          <div className="space-y-3">
            <SectionHeading>{t('address.details.streetSection')}</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              {on('propertyNumber') && (
                <Field
                  id="address-house-no"
                  label={t('address.details.number')}
                  value={values.propertyNumber}
                  placeholder={t('address.details.number.placeholder')}
                  maxLength={20}
                  disabled={disabled}
                  required={req('propertyNumber')}
                  onChange={(v) => onChange({ propertyNumber: v })}
                />
              )}
              {on('street') && (
                <Field
                  id="address-street"
                  label={t('address.details.street')}
                  value={shown(values.street, parts?.street)}
                  placeholder={t('address.details.street.placeholder')}
                  maxLength={120}
                  disabled={disabled}
                  required={req('street')}
                  onChange={(v) => onChange({ street: v })}
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {on('unit') && (
                <Field
                  id="address-unit"
                  label={t('address.details.unit')}
                  value={values.unit ?? ''}
                  placeholder={t('address.details.unit.placeholder')}
                  maxLength={30}
                  disabled={disabled}
                  required={req('unit')}
                  onChange={(v) => onChange({ unit: v })}
                />
              )}
              {on('propertyName') && (
                <Field
                  id="address-building"
                  label={t('address.details.building')}
                  value={values.propertyName}
                  placeholder={t('address.details.building.placeholder')}
                  maxLength={80}
                  disabled={disabled}
                  required={req('propertyName')}
                  onChange={(v) => onChange({ propertyName: v })}
                />
              )}
            </div>
            <AddressDirectionsField
              isBusiness={isBusiness}
              required={directionsRequired}
              value={values.directions}
              disabled={disabled}
              onChange={(directions) => onChange({ directions })}
            />
          </div>

          <AreaFields
            modes={modes}
            values={values}
            parts={parts}
            shown={shown}
            country={country}
            disabled={disabled}
            onChange={onChange}
          />
        </div>

        <div className="px-4 pb-6 pt-2 sm:px-6">
          <Button className="h-11 w-full rounded-xl" onClick={onClose}>
            {t('common.done')}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
