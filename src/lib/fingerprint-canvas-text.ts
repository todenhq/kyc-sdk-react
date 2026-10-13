// The text the device fingerprint draws on its hidden canvas.
//
// It is never shown to anyone: the canvas is not attached to the page, and only
// a hash of its pixels is sent. But the pixels ARE the fingerprint, so this
// text can never change. A different string draws different pixels, and every
// returning browser would then look like a device nobody has seen before:
// shared-device detection would start again from nothing, and a browser on an
// organisation's device blocklist would stop matching.
//
// It is written as character codes because it carries the product's former
// name, which no longer appears in the SDK as a word. The test beside this
// file pins the exact string by its SHA-256, so an edit to any code fails there
// instead of silently resetting device identities.
export const FINGERPRINT_CANVAS_TEXT = String.fromCodePoint(
  77, 121, 97, 122, 97, 32, 75, 89, 67, 32, 128737, 32,
  102, 105, 110, 103, 101, 114, 112, 114, 105, 110, 116,
);
