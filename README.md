# @myazahq/kyc-sdk-react

React component library for Myaza KYC — drop-in identity verification (ID capture, document scan, and active liveness) that talks to the Myaza KYC API.

## Installation

```bash
pnpm add @myazahq/kyc-sdk-react
```

```bash
yarn add @myazahq/kyc-sdk-react
```

```bash
npm install @myazahq/kyc-sdk-react
```

## Usage

`<MyazaKYC />` renders a "Verify Identity" button plus the full modal flow. The trigger is a real `<button>` — pass `children` to relabel it, `className` to restyle it, or any other button attribute (`disabled`, `type`, `aria-*`, …). See [Trigger button](#trigger-button). Import the bundled stylesheet once, anywhere in your app.

### Recommended — mount a workflow

Build the flow once in the Myaza dashboard as a **workflow**, then mount it by id. The country, ID types, capture steps, add-ons, branding and copy all come from the workflow, so changing the flow is a re-publish in the dashboard rather than a redeploy. See [Workflows](#workflows).

```tsx
"use client";

import { MyazaKYC } from "@myazahq/kyc-sdk-react";
import "@myazahq/kyc-sdk-react/styles.css";

export default function VerifyButton() {
	return (
		<MyazaKYC
			apiKey='pk_live_xxx'
			workflowId='wf_AbC123dEf456'
			// Runtime data — a workflow is a shared template and cannot carry any of it.
			userId='usr_123'
			userData={{ firstName: "Jane", lastName: "Doe" }}
			metadata={{ orderId: "ord_456" }}
			onSubmit={(submission) => console.log("Submitted!", submission.verificationId)}
			onError={(err) => console.error("SDK error:", err)}
			onClose={() => console.log("Modal closed")}
		/>
	);
}
```

**`userData` is worth passing.** It is the name you believe the user has, and it is compared against the name read off their document — that comparison is what produces `dataMatch` on the verification. It cannot live on the workflow: `userId`, `userData` and `metadata` are per-user runtime values, and a workflow is a template shared by every visitor, so these stay in code even when everything else moves to the dashboard.

### Or configure everything in code

Skip the workflow and pass the flow's shape as props. Useful for a quick start or a single fixed flow; anything you'd change later means a redeploy.

```tsx
"use client";

import { MyazaKYC } from "@myazahq/kyc-sdk-react";
import "@myazahq/kyc-sdk-react/styles.css";

export default function VerifyButton() {
	return (
		<MyazaKYC
			apiKey='pk_live_xxx'
			country='NG'
			idTypes={["passport", "drivers-license", "bvn", "nin", "pvc"]}
			userData={{ firstName: "Jane", lastName: "Doe" }}
			enableSelfie={true}
			enableDocumentCapture={true}
			enableLiveness={true}
			showThemeToggle={true}
			appearance={{
				primaryColor: "#5645F5",
				companyName: "Myaza",
				logo: "default",
				theme: "dark",
			}}
			consent={{
				title: "Welcome, {firstName}",
				description: "A quick check to confirm it's really you.",
			}}
			success={{
				title: "You're all set, {firstName}!",
				description: "We'll email you once your verification is reviewed.",
			}}
			userId='usr_123'
			metadata={{ orderId: "ord_456" }}
			onStart={() => console.log("KYC started")}
			onStepChange={(step) => console.log("Step:", step)}
			onSubmit={(submission) => {
				// Fires as soon as the server accepts the request.
				// submission.status is always 'pending' — the result arrives later via
				// webhook to your backend (or poll GET /api/kyc/status/:id).
				console.log("Submitted!", submission.verificationId);
			}}
			onClose={() => console.log("Modal closed")}
			onError={(err) => console.error("SDK error:", err)}
		/>
	);
}
```

## Props

| Prop                    | Type                                      | Default             | Description                                                                                                          |
| ----------------------- | ----------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `apiKey`                | `string`                                  | —                   | **Required.** Sent as `Authorization: Bearer`. The **environment is derived from the key prefix** (`pk_test_…` → sandbox, `pk_live_…` → production); an unrecognized prefix throws. |
| `country`               | `string` (ISO-2)                          | —                   | Country whose ID types are offered. **Required unless `workflowId` is set** (the workflow carries its own country). Any ISO-2 code works — `'NG' \| 'GH' \| 'KE' \| 'ZA' \| 'CI'` keep autocomplete and client-side format validation; every other country renders its ID types from the server. See [Country coverage](#country-coverage). |
| `workflowId`            | `string` (`wf_…`)                         | —                   | Run a **published Workflow** built in the dashboard. Workflow config wins over overlapping props. See [Workflows](#workflows). |
| `countries`             | `Array<{ country, idTypes? }>`            | —                   | Multi-region flows — more than one entry opens with a country-select step. Usually supplied by a workflow.            |
| `idTypes`               | `IdType[]`                                | all allowed for org | Subset of ID types to offer; must be valid for `country`.                                                            |
| `userId`                | `string`                                  | —                   | **Your** reference for the person being verified. Not matched during verification — it correlates repeat checks of the same user onto one identity so results map back to your record. Prefer this over putting a user id in `metadata`. |
| `userData`              | `{ firstName?, lastName?, dateOfBirth? }` | —                   | Pre-fills the user's details.                                                                                        |
| `enableSelfie`          | `boolean`                                 | `true`              | Capture a selfie during liveness.                                                                                    |
| `enableDocumentCapture` | `boolean`                                 | `true`              | Enable the document-scan step for document IDs.                                                                      |
| `allowDocumentUpload`   | `boolean`                                 | `true`              | Allow picking a document photo from the device (gallery / drag-and-drop) as an alternative to the camera. `false` hides every "upload instead" affordance (it's still offered on the camera-permission-denied screen as an escape hatch). |
| `allowDocumentScan`     | `boolean`                                 | `true`              | Allow scanning the document live with the camera. `false` makes document capture upload only: the camera never opens and the user uploads a photo of each side instead. At least one of `allowDocumentScan` and `allowDocumentUpload` must stay on; if both are `false`, the camera stays on. |
| `enableLiveness`        | `boolean`                                 | `true`              | Run the liveness challenge step. The server can still disable it per ID type.                                        |
| `livenessMode`          | `'gestures' \| 'flash' \| 'both'`         | `'gestures'`        | How liveness is proven. See [Liveness modes](#liveness-modes).                                                       |
| `flashSequenceLength`   | `number` (2–5)                            | `4`                 | Number of colours in the flash sequence, for `'flash'` / `'both'`.                                                   |
| `livenessBrightScreen`  | `boolean`                                 | `true`              | While the selfie camera is on, show the flow in its light theme so the screen lights the face. See [Liveness modes](#liveness-modes). |
| `selfieReview`         | `boolean`                                 | `false`             | Show the selfie with Retake and Continue after the liveness capture. Off by default: the capture hands straight on to the next step. A failed upload still shows it. |
| `voiceGuidance`         | `boolean \| { enabled?, language? }`      | `true`              | Spoken liveness instructions (accessibility, TTS **output** — no microphone). `false` mutes it; pass `{ language: 'fr-FR' }` to set the voice. See [Robustness & error handling](#robustness--error-handling). |
| `emailVerification`     | `EmailVerificationConfig`                 | off                 | Email OTP step after consent. See [Optional steps](#optional-steps).                                                 |
| `phoneVerification`     | `PhoneVerificationConfig`                 | off                 | Phone OTP step (SMS or WhatsApp). See [Optional steps](#optional-steps).                                             |
| `proofOfAddress`        | `ProofOfAddressConfig`                    | off                 | Proof-of-address upload after capture. See [Optional steps](#optional-steps).                                        |
| `questionnaire`         | `QuestionnaireConfig`                     | off                 | Compliance questions before submission. See [Optional steps](#optional-steps).                                       |
| `nfc`                   | `NfcConfig`                               | off                 | eMRTD chip read. **Mobile SDKs only** — see [Optional steps](#optional-steps).                                       |
| `deviceIntelligence`    | `boolean`                                 | `true`              | Device + IP fraud analysis (multi-accounting, emulator, datacenter IP, velocity). **Billed per verification**; `false` disables the analysis, its charge, and the SDK's fingerprint collection. |
| `showThemeToggle`       | `boolean`                                 | `true`              | Show a light/dark toggle inside the modal. When `false` the flow stays on `appearance.theme`.                         |
| `fullScreen`            | `boolean`                                 | `false`             | Force the fullscreen layout on every device (desktop drops the centered modal). Mobile is always fullscreen.          |
| `disableClose`          | `boolean`                                 | `false`             | Hide the X and block **all** user dismissal (backdrop, Escape, swipe-down). The flow can then only be closed via `useMyazaKYC().close()`. The terminal "Submitted" step is already non-dismissible regardless. |
| `requireMobileDevice`   | `boolean`                                 | `false`             | Refuse to run on desktop. Confirmed via hardware signals (GPU renderer, motion sensor, touch) — never viewport width, so responsive-mode desktops are rejected too. Desktop visitors get the handoff QR screen without the "continue on this device" option. The server re-checks and rejects with `mobile_device_required`. |
| `assetsBasePath`        | `string`                                  | bundled data URIs   | Load the liveness gesture GIFs from a URL instead of the inlined data URIs. Only needed under a strict `img-src` CSP that forbids `data:`. When set, the face tracking files are also tried at `<assetsBasePath>/face-mesh/` first, before the Myaza server and the public CDN. |
| `deviceHandoff`         | `boolean`                                 | `true`              | On desktop, show a "continue on your phone" screen (QR + copyable link) before the flow starts — handy when the computer has no webcam. The user can still choose to continue on the current device, and when they finish on their phone the desktop completes automatically. Set `false` to disable. Has no effect on mobile/touch devices. Skipped when nothing in the flow needs a camera, for example upload-only document capture (`allowDocumentScan: false`) with liveness off. |
| `appearance`            | `KYCAppearance`                           | brand defaults      | Brand & theme the modal — colors, logo, light/dark. See [Appearance & theming](#appearance--theming).                |
| `consent`               | `KYCConsentContent`                       | built-in copy       | Override the consent/welcome screen `title` and `description`. See [Consent screen copy](#consent-screen-copy).      |
| `success`               | `KYCSuccessContent`                       | built-in copy       | Override the success/submitted screen `title` and `description`. See [Success screen copy](#success-screen-copy).    |
| `metadata`              | `Record<string, string>`                  | —                   | Forwarded with every verify request.                                                                                 |
| `onStart`               | `() => void`                              | —                   | Called when the flow opens.                                                                                          |
| `onStepChange`          | `(step: KYCStep) => void`                 | —                   | Called on each step transition.                                                                                      |
| `onSubmit`              | `(submission: KYCSubmission) => void`     | —                   | Called when the server accepts the verification. `status` is always `'pending'`.                                     |
| `onError`               | `(error: KYCError) => void`               | —                   | Called for **technical** errors only. Receives a typed [`KYCError`](#robustness--error-handling) (a real `Error` with a `code`). Verification outcomes never come through here. |
| `onClose`               | `() => void`                              | —                   | Called when the user closes the flow.                                                                                |
| `children`              | `ReactNode`                               | `Verify Identity`   | Trigger button label/content. Defaults to `Verify with {companyName}` when `companyName` is set, else `Verify Identity`. |
| `className`             | `string`                                  | —                   | Trigger button classes. Merged via `tailwind-merge`, so your classes override the built-in styling.                  |
| _other button attrs_    | `ButtonHTMLAttributes`                    | —                   | Any standard `<button>` attribute (`disabled`, `type`, `aria-*`, `style`, …) is forwarded. `onClick` is reserved by the SDK. |

## Environment

There is **no `environment` prop** — the SDK derives the environment (and the
base URL) from the API key prefix, which is the single source of truth:

| Key prefix | Environment | Base URL |
|---|---|---|
| `pk_test_…` / `sk_test_…` | sandbox | `https://trust.myaza.app` |
| `pk_live_…` / `sk_live_…` | production | `https://trust.myaza.app` |

An unrecognized or malformed key throws at setup (it never silently defaults).

## Workflows

The recommended integration (see [Usage](#usage)): build the flow in the Myaza
dashboard and reference it by id —

```tsx
<MyazaKYC apiKey="pk_live_xxx" workflowId="wf_abc123" userId="usr_123" />
```

The SDK fetches the published workflow and uses it as the source of truth:

- **Workflow config wins** over any overlapping prop — country, ID types, step
  toggles, appearance, copy. Set them in the builder, not in code.
- **Runtime data always comes from your code**: `userId`, `userData`,
  `metadata`, and every callback.
- `country` becomes optional, because the workflow carries it.
- An unknown or unpublished id surfaces as a blocking `invalid_workflow` error
  through `onError` and in the modal — never a silently different flow.

This is the recommended way to drive the optional steps below: compliance teams
change the flow in the dashboard without a redeploy.

## Country coverage

Verification is **not limited to a fixed country list**.

- **Curated countries** — `NG`, `GH`, `KE`, `ZA`, `CI` — ship local ID-type
  definitions, so you get TypeScript autocomplete on `idTypes` and client-side
  ID-number format validation before anything is uploaded.
- **Every other ISO-2 country** works too. Its ID types (passport, driver's
  licence, national ID) come from the server along with their labels and how
  many sides to scan, so the SDK renders pairs it has no local definition for.
  There's no client-side number-format check for these — the server validates.

Which `(country, ID type)` pairs your organization may actually use is enforced
server-side; the picker only ever shows the intersection of your `idTypes` prop
and what your org is granted.

## Optional steps

Steps that are off unless configured. Each is normally switched on in the
dashboard workflow builder (so it rides `workflowId`), but every one can also be
passed directly as a prop.

The flow runs them in this order:

```
consent → email-verification → phone-verification → country-select → id-type
       → id-input / document-capture → nfc → liveness → proof-of-address
       → questionnaire → submitted
```

| Prop | Shape | What it adds |
|---|---|---|
| `emailVerification` | `{ enabled?, required?, codeLength?, maxAttempts?, inputStyle? }` | Email OTP right after consent. `required: false` adds a "skip for now". `codeLength` 4–8 (default 6), `maxAttempts` 1–5 (default 3), `inputStyle` `'segmented'` (default) or `'text'`. |
| `phoneVerification` | same, plus `{ channels?, defaultCountry? }` | Phone OTP. `channels` defaults to `['sms']`; add `'whatsapp'` to offer it. `defaultCountry` sets the dial code (falls back to the flow's country). |
| `proofOfAddress` | `{ enabled?, documentTypes?, otherLabel?, maxAgeDays? }` | Upload a utility bill, bank statement, tenancy agreement, or other document. `maxAgeDays` is the recency window the server checks the document date against (default 90). |
| `questionnaire` | `{ enabled?, title?, description?, fields }` | Compliance declarations before submission. Each field has a stable snake_case `key` (also the webhook field name) and a `type`: `text`, `number`, `money`, `select`, `multiselect`, `boolean`, `date`. |
| `nfc` | `{ enabled?, idTypes?, allowSkip? }` | Reads the passport/ID **chip** (eMRTD) for the strongest assurance level. |

**`nfc` is mobile-only.** Browsers can't do ISO-DEP, so the web SDK never puts
the chip step in the flow — use the Flutter or React Native SDK for chip reads.
The web SDK only renders the screen inside the dashboard builder's preview,
where it stands in for the mobile UI.

Answers and outcomes for these steps arrive in the verification webhook
(`data.questionnaire`, `data.emailVerification`, `data.phoneVerification`,
`data.proofOfAddress`) — proof of address never changes the pass/fail outcome on
its own.

```tsx
<MyazaKYC
  apiKey="pk_live_xxx"
  country="NG"
  phoneVerification={{ enabled: true, channels: ["sms", "whatsapp"] }}
  proofOfAddress={{ enabled: true, documentTypes: ["utility_bill", "bank_statement"] }}
  questionnaire={{
    title: "A few final questions",
    fields: [
      { key: "source_of_funds", label: "Source of funds", type: "select", required: true,
        options: [{ value: "salary", label: "Salary" }, { value: "business", label: "Business income" }] },
      { key: "expected_monthly_volume", label: "Expected monthly volume", type: "money",
        currencies: ["NGN", "USD"] },
    ],
  }}
/>
```

## Liveness modes

`livenessMode` picks how the selfie step proves a real person is present:

| Mode | How it works | Trade-off |
|---|---|---|
| `'gestures'` (default) | Randomized gesture challenges — nod, turn, blink, smile. | Familiar; takes a few seconds of user action. |
| `'flash'` | The screen emits a random colour sequence and the reflection on the face is verified. | Fast, hold-still, and defeats replay and camera-injection attacks. |
| `'both'` | Gestures, then flash. | Strongest; longest. |

`flashSequenceLength` (2–5, default 4) sets how many colours the flash sequence
uses. Longer is harder to spoof and takes slightly longer.

**Bright screen.** While the selfie camera is on, the flow switches to its light
theme (your `appearance` colours, never the `dark` overrides) so the display
lights the person's face, then returns to the theme it was on when the step
ends. The theme toggle is hidden meanwhile, and the switch is instant for
anyone who has asked their device for reduced motion. Browsers cannot change
the screen's brightness, so this is the lever the web has. On by default;
`livenessBrightScreen={false}` (or the workflow switch) turns it off. During a
flash sequence the screen shows black between colours whatever this is set to,
so each colour is measured against a dark baseline.

## Face re-authentication

For a **returning** user who has already been verified, re-confirm it's still
them with a live selfie matched 1:1 against their enrollment reference. No
document, no government-database lookup, no re-KYC.

There is no separate component. Build a workflow whose **scope** is
`biometric-authentication` in the dashboard, then mount the ordinary
`<MyazaKYC />` with its `workflowId`:

```tsx
import { MyazaKYC } from "@myazahq/kyc-sdk-react";
import "@myazahq/kyc-sdk-react/styles.css";

<MyazaKYC
  apiKey="pk_live_xxx"
  workflowId="wf_xxx"               // a biometric-authentication workflow
  userId="usr_123"                  // who to re-authenticate — the reference you passed at KYC
  onResult={(result) => {
    // result.status — 'approved' | 'declined' | ...
  }}
  onError={(err) => console.error(err.code, err.message)}
>
  Confirm it's you
</MyazaKYC>
```

The flow opens on the liveness step, captures the selfie, and submits it like
every other scope. `userId` is required here: the server reads the subject off
the session rather than the submission body, and refuses a re-authentication
that names nobody (`user_reference_required`) or names someone who was never
enrolled (`not_enrolled`).

Where the verdict lands is the workflow's own setting — in the app
(`onResult`), your webhook, or both — as are the selfie-review screen and the
Done button. Everything else is the standard `<MyazaKYC />` prop surface above.

> A user must have completed a KYC verification with a selfie before they can be
> re-authenticated. Calling this for someone with no enrollment fires `onError`.

## Trigger button

`<MyazaKYC />` renders a real `<button>`. Beyond the config props above it accepts standard button attributes (the props type is exported as `MyazaKYCProps`), so you can treat it like any other button:

```tsx
<MyazaKYC
  {...config}
  className="w-full rounded-full bg-black px-6 text-white"
  disabled={!ready}
>
  Start verification
</MyazaKYC>
```

- `children` sets the label (falls back to `Verify with {companyName}` / `Verify Identity`).
- `className` is merged through `tailwind-merge`, so your classes win over the defaults.
- `style` is merged on top of the SDK's injected theme variables, so theming still applies.
- `onClick` is **owned by the SDK** (it opens the modal) and can't be overridden. For a fully custom trigger element, use the `useMyazaKYC()` hook and wire its `open()` to your own component.

## Appearance & theming

Pass an `appearance` object to brand the flow. Colors are injected as CSS variables **scoped to the SDK** — they never leak into your page's styles. Because the UI is token-driven, setting one color cascades to all of its shades (hover/selected/focus states included).

| Field              | Type                | Description                                                                      |
| ------------------ | ------------------- | -------------------------------------------------------------------------------- |
| `primaryColor`     | `string`            | Brand color — buttons, selected states, focus rings. Defaults to `#5645F5`.      |
| `primaryTextColor` | `string`            | Text/icons rendered on top of `primaryColor` (e.g. button labels).               |
| `accentColor`      | `string`            | Subtle hover/active surfaces.                                                    |
| `backgroundColor`  | `string`            | Modal background.                                                                |
| `surfaceColor`     | `string`            | Cards & panels.                                                                  |
| `borderColor`      | `string`            | Borders and input outlines.                                                      |
| `textColor`        | `string`            | Primary text color.                                                              |
| `companyName`      | `string`            | Used on the verify button (“Verify with …”) and the persistent header.           |
| `logo`             | `string`            | Image URL, or `'default'` to use your org's logo. See below.                     |
| `theme`            | `'light' \| 'dark'` | Initial mode (defaults to `'light'`). With `showThemeToggle`, users can flip it. |

### Logo

The org logo renders as a small circular avatar in the modal header (top-left), persistent on every step, alongside `companyName`.

- `logo: 'https://…/logo.png'` — uses that image directly.
- `logo: 'default'` — pulls your organization's logo configured in the **Myaza dashboard** (returned by the server on mount). If your org has no logo set, or the image fails to load, it falls back to a built-in shield icon.
- omitted — no header logo.

```tsx
appearance={{
  primaryColor: "#0F7B6C",
  primaryTextColor: "#FFFFFF",
  surfaceColor: "#F4F7F6",
  borderColor: "#D7E3E0",
  logo: "default",
  theme: "light",
}}
```

## Consent screen copy

The welcome/consent step shows a heading and a short description. Override either through the `consent` prop:

| Field         | Type     | Description                                                                                           |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `title`       | `string` | Heading. Defaults to `Welcome, {firstName}` when a first name is known, else `Identity Verification`. |
| `description` | `string` | Sub-text under the heading. Defaults to the built-in regulatory copy.                                 |

Both fields support `{firstName}` and `{lastName}` tokens, replaced with the values from `userData` (empty string when absent), so a custom title can still greet the user by name.

```tsx
consent={{
  title: "Welcome, {firstName}",
  description: "We just need to confirm it's really you. This takes about a minute.",
}}
```

## Success screen copy

After the user submits, the final screen shows a confirmation heading and description. Override either through the `success` prop:

| Field         | Type     | Description                                                                |
| ------------- | -------- | -------------------------------------------------------------------------- |
| `title`       | `string` | Heading. Defaults to `Verification Submitted!`.                            |
| `description` | `string` | Sub-text under the heading. Defaults to the built-in "submitted for review" copy. |

Both fields support the same `{firstName}` / `{lastName}` tokens as `consent`, replaced with the values from `userData` (empty string when absent).

```tsx
success={{
  title: "You're all set, {firstName}!",
  description: "We'll email you once your verification is reviewed.",
}}
```

## Robustness & error handling

The SDK is resilient to flaky networks, denied permissions, and poor capture
conditions, and reports technical failures through `onError` with a typed code.

### Typed errors (`onError`)

`onError` receives a `KYCError` — a real `Error` (so existing `(error: Error)`
handlers still work) that also carries a typed `code` and optional `details`.
The codes are **identical to the Flutter SDK**:

```ts
import { MyazaKYC, KYCError } from "@myazahq/kyc-sdk-react";

<MyazaKYC
  {...config}
  onError={(error: KYCError) => {
    switch (error.code) {
      case "camera_permission_denied": /* ask the user to allow the camera */ break;
      case "insufficient_credits":     /* error.details = { required, balance, currency } */ break;
      case "network_error":
      case "upload_failed":            /* shown only after automatic retries */ break;
    }
  }}
/>
```

| `code`                     | When it fires                                                        |
| -------------------------- | ------------------------------------------------------------------- |
| `network_error`            | Connection failure / timeout, **after retries are exhausted**.      |
| `invalid_api_key`          | Server returned `401`.                                              |
| `insufficient_credits`     | Server returned `402`. `details = { required, balance, currency }`. |
| `upload_failed`            | A media upload failed, **after retries are exhausted**.            |
| `camera_permission_denied` | The user denied (or the OS/browser blocks) camera access.          |
| `feature_disabled`         | Server returned `403` (ID type / feature not enabled for the org). |
| `unknown`                  | Anything else.                                                      |

> Voice guidance is TTS **output** — it never records audio, so there is **no
> microphone permission** and no microphone error code.

### Network resilience

Media uploads and the verify submission are wrapped in exponential-backoff retry
(with jitter), retrying only *transient* failures (network / timeout / `5xx`);
terminal `4xx` surface immediately. The UI shows "Reconnecting… / retrying
(n/3)…" between attempts, and `onError` fires **only after retries are
exhausted** (`upload_failed` for uploads, `network_error` for connectivity).

### Camera permission

If the user denies camera access, the SDK shows a clear "camera access needed"
screen (with how to re-enable it) instead of hanging, and reports
`camera_permission_denied` to `onError`. Document capture additionally offers a
gallery-upload fallback unless `allowDocumentUpload` is `false`. When
`allowDocumentScan` is `false`, document capture never asks for the camera at
all: each side is uploaded as a photo, so only liveness can show this screen.

### Liveness quality guards

- **Multiple faces** — if more than one face is in frame, the challenge pauses
  ("Make sure only your face is visible") and resumes automatically when only
  one face remains. This guards capture quality and a class of spoofing.
- **Lighting** — too-dark *and* too-bright (glare) conditions are detected live
  during liveness and document capture; the SDK shows guidance ("Move to a
  brighter area" / "Too bright — reduce glare") and discourages auto-capture
  until lighting is acceptable.

## Documentation

Full documentation, configuration options, and webhook setup: **[trust.myaza.co/documentation/sdks](https://trust.myaza.co/documentation/sdks)**.
