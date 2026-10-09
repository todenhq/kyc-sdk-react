# Changelog

## 3.6.0

A full-screen liveness camera, signing on screen, and no selfie review by default.

**Deploy note for Myaza:** drawn signatures need a server with the signature upload route. The face tracking files are tried on the server first and fall back to the public CDN when the server does not serve them.

### The liveness camera is full screen

While the liveness camera is live it now takes the whole dialog, on desktop as well as on a phone. The camera fills the dialog, sharp inside a tall window for the face and blurred around it, with the instruction above the window and "Step 1 of 3" below. Back and close are drawn over the camera, and close stays hidden under `disableClose`. A line around the window shows progress, and the face is now judged against the window rather than the whole frame.

Where the browser cannot blur, the person prefers more contrast or less transparency, or the device cannot keep up, the surround is a plain tint instead. Phones that support it give a short buzz as each step passes.

No change to your code.

### No selfie review unless you ask for one

**This changes existing integrations.** After the liveness capture the SDK used to show the selfie with Retake and Continue. It now hands straight on to the next step. A liveness selfie is evidence, not a portrait, and the capture already waits for a face that is in the window and still.

Switch the review back on with `selfieReview={true}`, or with the switch on the workflow's Presence Intelligence step. On a biometric workflow its own setting wins. A selfie that fails to upload still shows the review, which is where the retry is.

### Going back to a finished liveness step

Going back to the liveness step after the selfie is taken now shows "Selfie already taken" with the photo and Continue. There is no Retake, so the check runs once per session.

### Sign a supporting document on screen

A supporting document in a workflow can now be signed on screen. The workflow sets `capture` on the document: `upload` (the default, as before), `draw` (a signature drawn on screen) or `draw_or_upload` (either). The person signs in a box with Clear and an Expand button for more room, and "Use this signature" stays disabled until there is real ink. With `draw_or_upload` they can switch to "Upload a photo of your signature instead".

After saving, the card shows the signature with an Edit action that reopens the box with the signature in it. A session picked up later shows a mark that it was signed, not the drawing itself.

Existing workflows are unchanged: a document with no `capture` is uploaded as before. The server must be on a version that accepts drawn signatures.

### Face tracking files load from the Myaza server

The liveness step downloads its face tracking files when it opens. They came from a public CDN only, with no version pinned, so a slow CDN meant the camera never started. They are now tried in order: your own host at `<assetsBasePath>/face-mesh/` when `assetsBasePath` is set, then the Myaza server, then the CDN pinned to one version. A source that fails or times out is skipped.

If you set `assetsBasePath` only for the gesture pictures, the SDK now asks your host for `face-mesh/face_mesh.js` first and moves on when it is not there. Under a Content Security Policy, allow the Myaza server in `script-src` and `connect-src`, or the SDK falls back to the CDN.

### The flash check tells the server when each colour came on

The submission now carries the time each flash colour came on, measured from the start of the recording, so the server's own check of the recording looks in the right place. Where the browser allows it (Chrome on Android and some webcams, not Safari), exposure and white balance are held still for the sequence. No change to your code, and an older server ignores the new field.

### The hosted map gets longer to load

The SDK waited 8 seconds for the hosted map before falling back to the built-in one. It now waits 20 seconds, which a slow connection needs.

### New texts

`presence.camera.secure`, `presence.camera.stepCount`, `presence.review.captured`, `presence.review.saving`, `presence.review.doneTitle`, `presence.review.doneDescription`, the `supportingDocuments.signature.*` group, `supportingDocuments.error.signatureEmpty` and `supportingDocuments.error.signatureFailed`.

## 3.5.0

A screen for a cancelled verification, and a device ID on uploads.

**Deploy note for Myaza:** this version sends a new `X-Myaza-Device-Id` header on uploads. The server must allow that header before this version is used against it, or the browser refuses every upload.

### A screen for a cancelled verification

An organisation or Myaza support can now cancel a verification session midway. When the server says a session is cancelled (on start, on a progress save, on submission, or in the result check), the flow stops on a screen reading "This verification was cancelled", with the server's message and a Close button. There is no Try again or Go back: the session cannot continue until it is reopened from the dashboard. `onError` fires once with the new code `session_cancelled`.

A failed session start used to be ignored so the flow could carry on. A cancelled session is the one exception: the flow now stops instead of walking the person through steps the server will refuse.

On a hosted link, the screen also appears when the person reopens a link they already finished and the application was cancelled afterwards, instead of a generic error.

### Device ID on uploads

When the workflow's Device Intelligence is on, every upload now carries the same per-install device ID the submission's fingerprint carries, so the server can tell when one session's captures came from more than one device. The fingerprint also gains a small entropy block (an audio render hash and a check for a fixed list of fonts). Nothing is collected when Device Intelligence is off.

## 3.4.1

A way back after a refused submission.

### Go back after a refused submission

When the server refused a submission, the error screen offered only Close, even when its message asked the person to fix something earlier in the flow. It now also offers Go back, which returns to the step that can fix the refusal: company documents, company details, key people, supporting documents, questionnaire, proof of address, address, or the photo a refused upload names. When the refusal doesn't point at one step, Go back returns to the step before submission. Coming back to the end submits again. Refusals that going back can't fix (not enough credits, an invalid API key) still show Close alone.

The button reads "Go back". You can change it with the `result.error.goBackButton` text.

## 3.4.0

The progress bar becomes the default indicator, plus fixes on the address confirmation screens.

### The progress bar is now the default indicator

A workflow or config that doesn't choose a progress indicator now shows the thin bar on the header's bottom edge instead of the numbered step circles. To keep the circles, set `progressStyle: 'steps'` (or choose Steps in the workflow builder). Workflows that already chose a style are unchanged.

### "Edit" keeps clear of the entrance photo on the address review

On the "Confirm your address" card, the "Edit" link sat right against the entrance photo that hangs over the card. When a photo is there, "Edit" now sits under the address instead; without one it stays where it was.

### The address intro button now reads "Continue"

The button on the "Let's confirm your address" screen said "Got it, let's go". Google Play's guidance for the disclosure shown before a background location request asks for a clear accept button rather than a vague "Got it", and a reviewer can treat this screen as that disclosure. The default is now "Continue". If you set your own text for `address.intro.start`, nothing changes for you.

## 3.3.0

Passive Liveness, customisable texts, the organisation's own footer logo, silent capture and a bright screen during liveness.

These features need the Myaza server release of 2026-09-28. Against an older server the flow still completes: the new settings are simply ignored, and silent frames are refused at upload and left out.

### Passive Liveness, and a head turn in every 3D Active Motion run

`livenessMode: 'passive'` asks the person to hold still for a moment while the SDK records a short clip and takes the selfie. There are no prompts: Myaza's liveness model decides from the capture. 3D Active Motion now always includes a head turn among its prompts, and the SDK reports the prompts it ran with the submission.

### Customisable texts

A workflow can reword the main text of each screen (titles, descriptions, checklists, labels and buttons) through its `texts` setting. Errors, legal lines and anything with a value filled in keep the SDK's own wording. The older copy fields (`consent`, `success`, `questionnaire`) still take priority over `texts` for the same line. The new `@myazahq/kyc-sdk-react/texts` entry exports the catalogue (`TEXT_GROUPS`, `DEFAULT_TEXTS`, `resolveText`) for editors.

### The organisation's own footer logo

When a workflow uses custom trust branding, its logo replaces the Myaza mark in the footer, with a separate logo on dark flows when one is set. The consent notice then names Myaza Trust as the processor for the organisation, since Myaza still processes the applicant's data.

### Silent capture

When the document camera faces the person (a laptop webcam), the SDK takes up to three unposed frames of them, one per side, so a reviewer can see who was holding the ID. A phone's rear camera takes none. It is on by default; a workflow turns it off with `silentCapture: false`.

### A bright screen during liveness

While the liveness camera is on, the flow shows its light theme so the screen lights the face, then restores the theme afterwards. The flash check's baseline between colours is now black. A workflow turns this off with `livenessBrightScreen: false`.

### Liveness is reported more honestly

A flash sequence that could not be measured no longer counts as passed, and a liveness recording that fails to upload is reported with its reason instead of silently missing.

### Selfie guidance

The selfie primer asks for a bright spot with no glare and an uncovered face (glasses off), and no longer states a duration.

### Fixes

A resumed KYB application replays the committed application. The consent screen discloses supporting documents the flow may ask for. The driver's licence is drawn as an ID card again, and the Privacy Policy link text is restored.

### No presence promise in a browser flow

The success screen, the returning applicant's completed screen and the address primer no longer tell the applicant an address presence check is running. Only the mobile SDKs can report presence, so a browser flow (a hosted link or a web embed) can never collect evidence, and the server now starts no watch for one. The builder preview still shows these screens, since there the web SDK stands in for the mobile flow. In the preview, the primer now describes background monitoring unless the workflow turns it off, matching its new default.

## 3.2.1

The CommonJS build loads again, and a multi-region workflow keeps its ID types.

### The CJS build no longer resolves to zero icons

`@hugeicons/core-free-icons` declares `"type": "module"` at its root while
pointing `require` at `dist/cjs/index.js`, and ships no `package.json` marking
that directory CommonJS. Node parses its CJS entry as ESM: on Node 20 and 22 the
require throws `exports is not defined in ES module scope`, and on Node 24 it
resolves silently to an object with ZERO keys, so every icon renders as nothing.
Left external, this SDK's CJS build inherited that. It is now bundled, so the
icon path data tree-shakes to the glyphs we draw and no consumer ever requires
the broken package.

### A consumer's `idTypes` prop can no longer narrow a multi-region flow

Such a flow declares its offering inside `countries[]`, where a country pinning
nothing already means "every granted ID for that country", and leaves the
top-level list unset. The merge read that unset value as "the flow did not
define it" and kept the prop, which the config context then falls back to for any
country pinning none of its own — so a hardcoded `['bvn','nin','passport']`
reduced a 58-country flow to three Nigerian types, on every country. The prop is
now dropped at the merge, so a flow that sets its OWN top-level list still wins
and single-country flows are unchanged.

### Retake draws a circular arrow, not a rotating hand

Lucide's `RotateCcw` is a circular arrow; Hugeicons reuses the name for a hand
rotating an object, so every Retake and retry control drew a hand. The fourth
name collision in this set found by comparing path data rather than names.

## 3.2.0

### Dark mode: the card surface is not the border's colour

`--secondary` and `--border` were both `#302D53` in dark, so anything bordered
ON a card drew its edge in the card's own colour and vanished — the
supporting-documents dropzone lost its dashed outline and the divider above it
disappeared. The card now takes `#0F0C2E`, the surface the React Native and
Flutter SDKs already use against that same border, so the three agree.

### The back control draws a long arrow

Hugeicons' `MoveLeft` is a move affordance (an arrow trailing a dot) and its
longest true left arrow spans 13.5 of the 24-unit viewBox against Lucide's 20,
so the glyph is drawn locally in `components/icons/glyphs.ts` — the one
deliberate exception to drawing everything from the set.

### The fullscreen toggle draws a real expand icon

`Maximize2`/`Minimize2` resolve to pinch-gesture glyphs in this set. They now
take `Expand` and `Collapse`, the glyphs the dashboard draws.

### One icon set across the product

The SDK now draws Hugeicons Stroke Rounded, the set the dashboard already moved
to, so the product no longer renders two icon languages at two stroke weights.

Every icon comes through `src/components/icons/`, which wraps `HugeiconsIcon` at
a 1.6 stroke in `currentColor`, decorative unless the caller passes an accessible
name. Each is exported under the name Lucide gave it, so call sites keep their
intent-led names and the Flutter SDK stays in lockstep by NAME rather than by
glyph. Where the dashboard had already chosen a glyph for a name, that exact
choice is repeated rather than re-picked.

Nothing in the public API changes and an existing integration needs no code edit.

- `lucide-react` is no longer a dependency, and a guard test fails the build on
  an import of it.
- The size default stays 24, since every call site here was written against it
  and almost all size the glyph with a class, which wins either way.

## 3.1.0

### Supporting documents

A new step collects the artefacts an organisation holds **on file** — a NIN slip,
a signed mandate, a bank letter — as opposed to the identity evidence the
verification is decided on. It sits after the identity checks and before proof of
address, because the documents are resolved against the ID the person actually
verified with.

There is no catalogue. The organisation names each document it asks for, so the
SDK renders the title and guidance the workflow sent rather than captioning a key
it recognises. A document with no title is not asked for at all.

Entirely workflow-driven (`supportingDocuments` on the resolved config), so no
props change and an existing integration needs no code edit to receive it.

- One card per requested document, naming **what the document is being taken
  for**: the values the server will read off it appear as chips under the
  guidance, so a slot says more than a noun.
- Per-document **ID scoping**. A document scoped to `NG/nin` is never demanded of
  a passport holder, which is what stops the step being a dead end.
- **`alwaysAsk`** shows the slot to everyone while the scope decides only who
  must provide one, for an organisation that will take a document from anybody
  who has it.
- Where nothing is required, Continue reads **Skip**: pressing on is a deliberate
  choice to add nothing.

### Fixes

- An address flow that verifies by document alone no longer opens a map, and its
  consent notice no longer promises one it never shows.
- A flow with nothing to capture is no longer offered a phone handoff.
- Choosing to verify on this device now gives the handoff session back instead of
  leaving it open.

## 3.0.0

### Face re-authentication has one entry point (breaking)

`MyazaBiometricAuth` and its `MyazaBiometricAuthProps` type are **removed** from
the package's exports.

Face re-authentication now runs through the ordinary entry point. Mount
`<MyazaKYC/>` with a workflow whose scope is `biometric-authentication`, and the
flow parks on the real liveness step and submits to `/verify` under that scope's
marker ID type, exactly as every other scoped workflow does:

```tsx
<MyazaKYC
  apiKey={apiKey}
  workflowId="wf_…"     // a workflow scoped to biometric-authentication
  userId={userId}       // the enrolled entity's reference
  onResult={handleResult}
  onError={handleError}
/>
```

If you imported `MyazaBiometricAuth`, replace it with the mount above. Nothing
else changes: the same check runs, against the same enrolment reference, and
returns the same verdict.

**Why it went rather than being deprecated.** A second component meant two code
paths for one behaviour, and that is how the two drift — a fix or a copy change
lands in one and not the other. Keeping a deprecated shim would have preserved
exactly the duplication the change exists to remove. Nobody had integrated the
component, so an outright removal costs less than a shim nobody needs.

The `/api/kyc/biometric/*` endpoints are unaffected and remain available for
direct server-to-server integration. No SDK calls them.

### Version alignment

The web, React Native and Flutter SDKs now all carry **3.0.0** for the same
release, so a given version number means the same generation of the product on
every platform.
