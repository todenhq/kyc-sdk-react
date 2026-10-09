// The Myaza mark, as a data URI to drop in the centre of a QR code.
//
// Provenance, at the one moment it is load-bearing. A bare QR is a black box:
// the user is being asked to point their camera at an unreadable square and hand
// over a passport on the other side. The mark makes the destination legible
// before they scan, and matches the "Protected by Myaza Trust" lockup already at
// the foot of the modal.
//
// A data URI rather than a file: the SDK ships as a bundle into other people's
// pages, and an <img src> pointing anywhere would be a network request at the
// exact moment the user is deciding whether to trust us — and would simply fail
// behind a strict CSP.
//
// Paths are the first three from MyazaWordmark (the mark, without the wordmark);
// regenerate both from public/assets/images/logo-white.svg rather than hand-
// editing either.
const MARK_PATHS = [
  {
    d: 'M18.6008 22.9368C14.2202 24.4324 9.83824 24.4324 5.45764 22.9368C3.41995 22.2414 1.81712 20.6385 1.12163 18.6008C-0.373877 14.2202 -0.373877 9.83824 1.12163 5.45764C1.81712 3.41995 3.41995 1.81712 5.45764 1.12163C9.83824 -0.373877 14.2202 -0.373877 18.6008 1.12163C20.6385 1.81712 22.2414 3.41995 22.9368 5.45764C24.4324 9.83824 24.4324 14.2202 22.9368 18.6008C22.2414 20.6385 20.6385 22.2414 18.6008 22.9368Z',
    fill: '#BDB6FB',
  },
  {
    d: 'M13.0606 6.06204L18.1298 11.2775C18.6887 11.8517 18.8517 12.7033 18.5465 13.4434L16.7931 17.6874C16.5813 18.2003 15.9945 18.4443 15.4816 18.2324C15.3562 18.1808 15.2419 18.1042 15.1471 18.0066L12.1059 14.8999L8.92116 18.1056C8.5309 18.4986 7.89535 18.5014 7.50091 18.1097C7.40474 18.0136 7.32808 17.8993 7.27791 17.7725L5.50086 13.3626C5.19841 12.6113 5.37681 11.7528 5.95244 11.1841L11.1581 6.04253C11.6836 5.52265 12.531 5.52823 13.0509 6.05507C13.0537 6.05786 13.0565 6.06065 13.0579 6.06204H13.0606Z',
    fill: '#5645F5',
  },
  {
    d: 'M8.52707 11.2556L12.8422 15.6502L12.8199 15.6279C12.431 15.232 11.7955 15.2265 11.3996 15.6139C11.3954 15.6181 11.3913 15.6223 11.3871 15.6265L11.3634 15.6502L8.91872 18.106C8.52707 18.499 7.89151 18.5004 7.49847 18.1088C7.4023 18.0126 7.32704 17.8983 7.27547 17.7729L5.47891 13.3142C5.11653 12.4139 5.52908 11.3867 6.41412 10.988C7.14724 10.6577 7.8511 10.7469 8.52568 11.2556H8.52707Z',
    fill: '#19156F',
  },
];

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
 */
export const MYAZA_QR_LOGO = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">` +
    // The ring: separates the tile from the surrounding dots at any scale.
    `<rect width="40" height="40" rx="12" fill="#FFFFFF"/>` +
    `<rect x="2.5" y="2.5" width="35" height="35" rx="10" fill="#5645F5"/>` +
    // The mark sits on solid brand purple (flat, no gradients in the flow),
    // so its own indigo body is swapped for white and the accent keeps the
    // gold-free brand purple — what keeps it legible at 40px on a saturated
    // ground. Scaled to fill the tile: at QR size the mark is ~40px across,
    // and its native size left it reading as a speck. The faint outer blob is
    // dropped on purpose — at this scale it muddied the glyph.
    `<g transform="translate(6.5 6) scale(1.12)">` +
    `<path d="${MARK_PATHS[1].d}" fill="#FFFFFF"/>` +
    `<path d="${MARK_PATHS[2].d}" fill="#C9C2FB"/>` +
    `</g></svg>`,
)}`;
