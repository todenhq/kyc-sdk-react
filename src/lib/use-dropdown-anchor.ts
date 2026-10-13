'use client';

import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { ThemeVarsContext } from './theme-context';
import { usePortalHost } from './sdk-frame-context';

/**
 * Position a dropdown so it escapes the step body's scroll container.
 *
 * The SDK's step body is `overflow-y-auto`, and an absolutely-positioned menu
 * inside a scroll container is CLIPPED by it — which is why the dial-code list
 * appeared to vanish behind the footer. `z-index` cannot fix that: it is
 * overflow clipping, not stacking.
 *
 * The menu therefore renders into `document.body`, fixed to viewport
 * coordinates, so it can float over the dialog rather than being bounded by it.
 *
 * Rendering there costs three things the dialog would otherwise have given it,
 * and each is paid back explicitly:
 *
 *   • Pointer events. Radix Dialog sets `pointer-events: none` on the body
 *     while open, so the menu re-enables them on itself (see `style` below).
 *   • Theme variables. Those live on `.verification-root`, which is no longer an
 *     ancestor, so they are merged into the menu's own style.
 *   • Scrolling. The dialog's scroll lock preventDefaults wheel and touchmove
 *     everywhere outside its content, which left the list movable only by
 *     dragging its scrollbar thumb. Callers wrap the menu in
 *     `<DropdownSurface>`, a nested lock that takes over while it is open.
 *
 * `position: fixed` is correct here only BECAUSE the host is the body: the
 * dialog carries `xl:translate-x-[-50%]` on desktop, and a transformed ancestor
 * would become the containing block for fixed descendants.
 *
 * It prefers to open downwards and shrinks its height budget to the room
 * available, so a long list scrolls rather than overflowing. When the trigger
 * sits near the bottom — a date field at the end of a long questionnaire — that
 * budget collapses to a sliver, so it FLIPS above instead. Flipping needs the
 * rendered height (to know where the top edge goes), which is why the caller
 * hands over the menu's ref and the position is refined once it has mounted.
 */
export interface DropdownAnchor {
  /** Portal target, or null before the trigger has mounted. */
  host: HTMLElement | null;
  /** Absolute placement within `host`. */
  style: CSSProperties;
  /** Room the list may occupy before it should scroll. */
  maxHeight: number;
}

interface Options {
  /**
   * Menu width in px, or `'trigger'` to match the control it hangs off (what a
   * full-width field select wants). Used to keep it inside the host's right
   * edge either way.
   */
  width?: number | 'trigger';
  /** Space between trigger and menu. */
  gap?: number;
  /** Breathing room kept against the host's edges. */
  margin?: number;
  /** Never squeeze the list below this, even in a tight spot. */
  minHeight?: number;
  /**
   * The menu element. Supplying it lets the menu open UPWARDS when there is no
   * room below — that placement needs its rendered height, so the position is
   * refined once it exists.
   */
  menuRef?: RefObject<HTMLElement | null>;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

export function useDropdownAnchor(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  { width = 288, gap = 6, margin = 12, minHeight = 120, menuRef }: Options = {},
): DropdownAnchor {
  const themeVars = useContext(ThemeVarsContext);
  const portalFrame = usePortalHost();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 288, maxHeight: 240 });

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || !host) return;
    const hostRect = host.getBoundingClientRect();
    const rect = trigger.getBoundingClientRect();

    // Bound by the VIEWPORT. It used to be bounded by the dialog too, which is
    // what made a long list feel trapped inside the flow: the menu could not
    // use the space beside the modal even when the modal had none.
    const floor = window.innerHeight;
    const ceiling = 0;
    const below = floor - rect.bottom - gap - margin;
    const above = rect.top - ceiling - gap - margin;

    // Decide against what the menu ACTUALLY needs, not a fixed floor. A date
    // picker wants ~320px; judging it against a 120px minimum meant "187px
    // below" counted as enough room and it opened downwards into a space it
    // could not fit, when there was three times as much above. `scrollHeight`
    // reports the content's natural height even while the box is clamped.
    // Zero on the first pass (the menu has not mounted) — the layout effect
    // re-measures once it has, and the trigger's position does not move, so
    // the decision cannot oscillate.
    const natural = menuRef?.current?.scrollHeight ?? 0;
    const needs = natural > 0 ? natural : minHeight;
    const placeAbove = below < needs && above > below;
    // Capped, not just fitted.
    //
    // Room available is an upper bound, not a target: on a tall window the menu
    // would grow to most of the screen, which is a wall to read rather than a
    // list to scan, and it stops looking like a menu at all. Past this the list
    // scrolls, which is what a long list should do.
    const MAX_MENU_HEIGHT = 340;
    const maxHeight = Math.min(
      MAX_MENU_HEIGHT,
      Math.max(minHeight, placeAbove ? above : below),
    );

    const menuWidth = width === 'trigger' ? rect.width : width;

    // Viewport coordinates: the menu lives on the body now, so there is no
    // host offset to subtract and no transformed ancestor to correct for.
    const left = clamp(rect.left, margin, Math.max(margin, window.innerWidth - menuWidth - margin));

    // Opening upwards needs the menu's real height to know where its TOP goes,
    // capped at what will fit.
    const menuHeight = Math.min(natural || maxHeight, maxHeight);
    const top = placeAbove ? rect.top - gap - menuHeight : rect.bottom + gap;

    setPos((prev) =>
      prev.top === top && prev.left === left && prev.width === menuWidth && prev.maxHeight === maxHeight
        ? prev
        : { top, left, width: menuWidth, maxHeight },
    );
  }, [host, triggerRef, gap, margin, minHeight, width, menuRef]);

  useLayoutEffect(() => {
    if (!open) return;
    // The SDK's shadow portal frame when isolated, else the BODY — never the
    // nearest .verification-root.
    //
    // Portaling inside the dialog meant the dialog's own overflow bounded the
    // menu: it could never float over the flow, only scroll or clip within it.
    // Both targets sit directly under the body with no transformed ancestor,
    // so fixed viewport coordinates are correct in a way they were not inside
    // a translated dialog — and the shadow frame additionally keeps the menu
    // styled by (and only by) the SDK's own sheet.
    setHost(portalFrame ?? (typeof document === 'undefined' ? null : document.body));
  }, [open, triggerRef, portalFrame]);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return undefined;
    // Capture, so scrolling the step body (not just the window) repositions it.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);

    // The menu's height decides where an upward placement starts, and it
    // changes as a list filters — so track it rather than measuring once.
    const el = menuRef?.current;
    const ro = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el!);

    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [open, measure, menuRef]);

  return {
    host,
    style: {
      // The menu now renders on the BODY, outside .verification-root, so it no longer
      // inherits the theme variables that element carries. Merging them in
      // here keeps every menu themed without each caller remembering to, and
      // without a menu ever rendering in the host page's colours.
      ...themeVars,
      position: 'fixed',
      top: pos.top,
      left: pos.left,
      width: pos.width,
      // Radix sets pointer-events:none on the body while a dialog is open, so a
      // menu portaled here inherits it and becomes unclickable. Re-enabling it
      // on the menu itself is what makes the body a usable portal target - and
      // portaling here is what lets the menu escape the dialog's overflow.
      pointerEvents: 'auto',
    },
    maxHeight: pos.maxHeight,
  };
}
