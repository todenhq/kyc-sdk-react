// The Toden mark, as a data URI to drop in the centre of a QR code.
//
// Provenance, at the one moment it is load-bearing. A bare QR is a black box:
// the user is being asked to point their camera at an unreadable square and hand
// over a passport on the other side. The mark makes the destination legible
// before they scan, and matches the "Protected by" logo already at the foot of
// the modal.
//
// A data URI rather than a file: the SDK ships as a bundle into other people's
// pages, and an <img src> pointing anywhere would be a network request at the
// exact moment the user is deciding whether to trust us — and would simply fail
// behind a strict CSP.
//
// The shapes are the split-shield T from TodenWordmark (the mark, without the
// lettering), as kyc-dashboard/public/assets/images/toden-mark-tile.svg draws
// it. Regenerate both from the brand SVGs rather than hand-editing either.

/**
 * The mark on a squircle tile.
 *
 * A tile, not a bare mark: at the centre of a field of dots an unbacked logo
 * reads as noise, and the rounded ground is the visual convention for "this is
 * an overlay, not part of the code". The white ring around it is the quiet zone
 * that keeps the dots from crowding the tile.
 *
 * Percent-encoded rather than base64 — smaller, and it stays readable in a
 * bundle so nobody has to decode it to see what is being injected into the page.
 *
 * The export keeps its original name: it is part of the package's surface.
 */
export const MYAZA_QR_LOGO = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">` +
    // The ring: separates the tile from the surrounding dots at any scale.
    `<rect width="40" height="40" rx="12" fill="#FFFFFF"/>` +
    // The tile is the logo's own ink, with the mark in white on it and the
    // shield's right half at half strength, as the brand tile draws it.
    `<rect x="2.5" y="2.5" width="35" height="35" rx="10" fill="#080A12"/>` +
    `<g transform="translate(7.05 6.88) scale(0.259)" fill="#FFFFFF">` +
    `<rect x="15" y="12" width="70" height="13" rx="6.5"/>` +
    `<path d="M35 35H47.5V90C39 83 30 74 30 58V40A5 5 0 0 1 35 35Z"/>` +
    `<path d="M52.5 35H65A5 5 0 0 1 70 40V58C70 74 61 83 52.5 90Z" opacity="0.5"/>` +
    `</g></svg>`,
)}`;
