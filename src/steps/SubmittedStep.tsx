"use client";

import { configScope, SCOPE_ID_TYPES } from '../lib/scope';
import { useEffect, useRef, useState } from "react";
import { useVerificationContext } from "../context/VerificationContext";
import { useVerificationConfig } from "../context/VerificationConfigContext";
import { withRetry } from "../lib/retry";
import { mapToVerificationError } from "../lib/errors";
import { isBusinessFlow } from "../lib/business";
import { VerificationError } from "../types/verification";
import {
	generateRequestId,
	buildSubmitMetadata,
	uploadCaptureVideos,
	silentCaptureForSubmit,
	withSilentCaptureMetadata,
} from "./submit-helpers";
import { contactStepFor, expiredContactChannels } from "./contact-recovery";
import { recoveryStepFor, serverRefusalOf } from "../lib/submit-recovery";
import { isSessionCancelledError, sessionCancelledMessage } from "../lib/session-cancelled";
import type { VerificationStep } from "../types/config";
import { multiIdWireSlots } from "../lib/multi-id";
import { keepsIdEvidence } from "../lib/resubmit";
import { submitBusinessApplication } from "./submit-business";
import { submissionRequestId } from "../lib/resumed-application";
import { KeyPeopleAwaitList } from "./KeyPeopleAwaitList";
import { toAwaitRows } from "./CompletedStep";
import { KeyPeoplePending } from "./KeyPeoplePending";
import { useAwaitingPeople } from "./use-awaiting-people";
import { successAction, successDescription, successTitle } from "./success-copy";
import { PresenceExpectations } from "./presence-expectations";
import { showsPresencePromise } from "../lib/presence-promise";
import { SubmittingScreen, SubmitErrorScreen, SubmitSuccessScreen } from "./SubmittedScreens";
import { requiredPrefillSubmission } from './address/address-field-modes';
import { describeWaiting } from '../lib/result-copy';
import { biometricCopyFor } from '../lib/biometric-copy';
import { showsDoneButton, showsSelfieReview, waitsForResult } from '../lib/biometric-options';
import { IDLE_SELFIE_UPLOAD, selfieUploadExpected } from '../lib/selfie-upload-wait';
import { settleLivenessVideo } from '../lib/integrity-signals';
import { useSelfieUploadGate } from './selfie-upload-gate';
import { SubmittedResult } from './SubmittedResult';
import { useText } from '../i18n';

/**
 * `stepOrder` is this flow's current step order (VerificationModal builds it), so a
 * refused submission can offer Go back to the step that fixes it.
 */
export function SubmittedStep({ stepOrder = [] }: { stepOrder?: readonly VerificationStep[] } = {}) {
	const { state, dispatch } = useVerificationContext();
	const config = useVerificationConfig();
	const t = useText();
	// Where Go back lands after a refusal (lib/submit-recovery.ts); null when
	// going back cannot help.
	const [recoverTo, setRecoverTo] = useState<VerificationStep | null>(null);

	// Increment to trigger a (re-)submission; starts at 0 to fire on mount.
	const [submitTrigger, setSubmitTrigger] = useState(0);
	const submittedTriggerRef = useRef<number | null>(null);

	// While a transient failure is being retried, surface "Retrying (n/total)…"
	// under the spinner so the user knows the SDK hasn't frozen.

	// Whether the server minted any invites for this application. Not the invites
	// themselves: those are the applicant-entered first draft, and the list the
	// screen shows comes from the server once the register has been reconciled.
	// This only answers "is a list coming?", which is the difference between a
	// waiting line and an empty space.
	const [invitesExpected, setInvitesExpected] = useState(false);
	// The register is read AFTER the submission returns, so nothing is shown until
	// the server reports it has finished: discovery can add people the applicant
	// never listed and fill in ownership they did not know, and a list shown before
	// that is one a refresh would contradict.
	const settled = useAwaitingPeople(
		config.api,
		{ token: config.hostedToken, sessionId: state.sessionId },
		state.status === "success",
	);
	const [retryInfo, setRetryInfo] = useState<{ attempt: number; total: number } | null>(null);
	const onRetry = (attempt: number, total: number) => setRetryInfo({ attempt, total });

	// The biometric scopes hand over BEFORE the selfie upload lands (the review
	// is off, so nothing on the liveness step gated on it): wait for the
	// upload's own record here, under the same loading screen. Settled from
	// the start on every flow that shows the review, and on every flow with no
	// selfie to upload (no liveness step). A failed upload was already
	// reported to onError by the step that ran it.
	const uploadGate = useSelfieUploadGate({
		enabled:
			!showsSelfieReview(config) &&
			selfieUploadExpected(
				{ selfieUpload: state.selfieUpload, selfieMediaId: state.mediaIds.selfie },
				stepOrder.includes('liveness'),
			),
		selfieUpload: state.selfieUpload,
		selfieMediaId: state.mediaIds.selfie,
	});

	useEffect(() => {
		if (uploadGate === 'waiting') return;
		if (!uploadGate.ok) {
			dispatch({ type: "SET_ERROR", payload: new VerificationError("upload_failed", uploadGate.message) });
			return;
		}
		// Guard against React 18 Strict Mode double-invocation in dev — without
		// this, each mount fires two requests with different requestIds, creating
		// duplicate Verification rows.
		if (submittedTriggerRef.current === submitTrigger) return;
		submittedTriggerRef.current = submitTrigger;
		runSubmit();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [submitTrigger, uploadGate]);

	// Try Again after a failed selfie upload re-enters the liveness step, whose
	// mount resumes the interrupted upload and hands straight back here. The
	// record is reset first so this step waits for the NEW attempt rather than
	// reading the old failure a second time.
	const retryUpload = () => {
		dispatch({ type: "SET_SELFIE_UPLOAD", payload: IDLE_SELFIE_UPLOAD });
		dispatch({ type: "CLEAR_ERROR" });
		dispatch({ type: "SET_STEP", payload: "liveness" });
	};

	// Business (KYB) APPLICATION — registry details + documents/key-people/
	// applicant extras, then (fire-and-forget) the applicant's own individual
	// verification. Extracted to submit-business.ts per the 200-line rule.
	async function submitBusiness(requestId: string): Promise<void> {
		// A replay of an application that already committed is answered from
		// the row that exists, whatever the restored form still holds.
		if (!state.resumedApplication && !state.business.registrationNumber.trim()) {
			dispatch({ type: "SET_ERROR", payload: new VerificationError("unknown", t("result.error.missingRegistrationNumber")) });
			return;
		}
		const result = await submitBusinessApplication({ config, state, requestId, onRetry });
		setInvitesExpected((result.keyPeopleInvites?.length ?? 0) > 0);
		finishSubmit(result.verificationId, requestId);
	}

	async function submitIndividual(requestId: string): Promise<void> {
		// Multi-ID: everything was committed per slot; ONE submission carries all
		// the checks (the server judges it by the workflow's pass policy). The
		// primary (first) slot fills the single-ID fields.
		const multiSlots = state.multiIdSlots.length >= 2 ? state.multiIdSlots : null;
		// Scoped flows carry the scope's transport marker instead of a picked ID —
		// the server requires a published workflow of the matching scope for it.
		const scope = configScope(config);
		const primaryIdType = scope
			? SCOPE_ID_TYPES[scope]
			: multiSlots
				? multiSlots[0]!.idType
				: state.selectedIdType;
		if (!primaryIdType) {
			dispatch({ type: "SET_ERROR", payload: new VerificationError("unknown", t("result.error.missingIdType")) });
			return;
		}
		const isNumberOnly = multiSlots
			? false
			: config.getIdTypeDefinition(primaryIdType)?.requiresDocumentCapture === false;
		const idNumber = multiSlots ? multiSlots[0]!.idNumber : isNumberOnly ? state.idNumber : undefined;
		// A redo that keeps its ID submits the type alone: the server fills in the
		// number the earlier attempt gave.
		const idKept = !multiSlots && keepsIdEvidence(config.resubmit);
		if (!multiSlots && isNumberOnly && !idNumber && !idKept) {
			dispatch({ type: "SET_ERROR", payload: new VerificationError("unknown", t("result.error.missingIdNumber")) });
			return;
		}

		const api = config.api;

		// Upload video recordings (best-effort — failures never block verification).
		//
		// Multi-ID runs send the LIVENESS video only. The document recordings are
		// per-slot, but the row has ONE documentFrontVideo slot, so shipping them
		// would file the last ID's recording as though it were the verification's
		// — a quiet misattribution in an audit trail. The per-slot document
		// IMAGES are all kept either way.
		const videoIds = await uploadCaptureVideos(
			api,
			multiSlots
				? { documentFrontVideoBlob: null, documentBackVideoBlob: null, livenessVideoBlob: state.livenessVideoBlob }
				: state,
		);

		// Whether the liveness recording reached us, and why not when it did
		// not: rides the integrity claim the server records (integrity-signals.ts).
		settleLivenessVideo({
			hadRecording: Boolean(state.livenessVideoBlob),
			uploaded: Boolean(videoIds.livenessVideo),
		});

		// Multi-ID: each check has its OWN document recording, so they upload
		// per slot and ride that slot rather than the row's single
		// documentFrontVideo column — which can only hold one, and would file
		// the last ID's recording as though it were the verification's own.
		// Best-effort, exactly like the single-ID videos: a failed upload costs
		// a recording, never the verification.
		const slotVideos = multiSlots
			? await Promise.all(
					multiSlots.map((slot) =>
						uploadCaptureVideos(api, {
							documentFrontVideoBlob: slot.documentFrontVideoBlob ?? null,
							documentBackVideoBlob: slot.documentBackVideoBlob ?? null,
							livenessVideoBlob: null,
						}),
					),
				)
			: null;

		// Silent capture: the unposed frames that uploaded (lib/silent-capture.ts).
		const silent = await silentCaptureForSubmit();

		// Merge userData: config props take precedence over user-typed values
		const firstName = config.userData?.firstName || state.userData.firstName || undefined;
		const lastName  = config.userData?.lastName  || state.userData.lastName  || undefined;
		const dob       = config.userData?.dateOfBirth;
		// Passed through when the integrator gives one. Nothing in the flow asks for
		// it: the server keeps it as the applicant's address for any email the org
		// has us send about a decision.
		const email     = config.userData?.email?.trim() || undefined;
		const userData = (firstName || lastName || dob || email)
			? { firstName, lastName, ...(dob ? { dateOfBirth: dob } : {}), ...(email ? { email } : {}) }
			: undefined;

		// The verify submission is retried on transient failures (network /
		// timeout / 5xx); terminal errors (401/402/403) surface immediately.
		const result = await withRetry(
			() =>
				api.verify({
					country: config.country,
					idType: primaryIdType,
					...(idNumber ? { idNumber } : {}),
					// Multi-ID: the committed slots, in pick order — ONE submission.
					...(multiSlots ? { idChecks: multiIdWireSlots(multiSlots) } : {}),
					// Resumable session this attempt belongs to (dropped if not ours).
					...(state.sessionId ? { sessionId: state.sessionId } : {}),
					// Flow attribution — validated server-side, dropped if stale.
					...(config.workflowId ? { workflowId: config.workflowId } : {}),
					// The liveness method that ran — per-method billing for
					// prop-configured mounts (a workflow's mode wins server-side).
					...(config.livenessMode ? { livenessMode: config.livenessMode } : {}),
					// What kind of PoA document mediaIds.proofOfAddress is. This pair was
					// MISSING until 2026-08-25: the step uploaded the document, stored the
					// mediaId in state, and the submission then omitted both fields — so
					// the media was never claimed (swept on its TTL), the PoA check never
					// ran and the component never billed, from the web SDK only.
					...(state.mediaIds.proofOfAddress
						? { proofOfAddressType: state.poaDocumentType ?? 'other' }
						: {}),
					// Smart-address submission (Address Intelligence) — the pin, the
					// directions and, when attestPresence took one, the device fix.
					...(state.address
						? {
								address: {
									lat: state.address.lat,
									lng: state.address.lng,
									// The line the applicant CONFIRMED (search pick /
									// reverse geocode): the server prefers it for the
									// composed address over its own weaker derivation.
									...(state.address.label?.trim() ? { label: state.address.label.trim() } : {}),
									...(state.address.accuracy != null ? { accuracy: state.address.accuracy } : {}),
									...(state.address.directions.trim()
										? { directions: state.address.directions.trim() }
										: {}),
									...(state.address.propertyName.trim()
										? { propertyName: state.address.propertyName.trim() }
										: {}),
									...(state.address.propertyNumber.trim()
										? { propertyNumber: state.address.propertyNumber.trim() }
										: {}),
									...(state.address.street?.trim()
										? { street: state.address.street.trim() }
										: {}),
									// The rest of the edit-details form — claims,
									// sent only when actually typed.
									...(state.address.unit?.trim() ? { unit: state.address.unit.trim() } : {}),
									...(state.address.neighbourhood?.trim()
										? { neighbourhood: state.address.neighbourhood.trim() }
										: {}),
									...(state.address.city?.trim() ? { city: state.address.city.trim() } : {}),
									...(state.address.state?.trim() ? { state: state.address.state.trim() } : {}),
									...(state.address.postcode?.trim()
										? { postcode: state.address.postcode.trim() }
										: {}),
									// Workflow-REQUIRED fields the applicant left untouched
										// ride their displayed map prefill: they saw it filled and
										// confirmed by continuing, and the server 422s a required
										// field that never arrives. Typed values are absent from
										// this helper, so nothing above is overridden.
										...requiredPrefillSubmission(config.addressCollection, state.address),
										...(state.address.streetView ? { streetView: state.address.streetView } : {}),
									...(state.address.deviceLat != null && state.address.deviceLng != null
										? {
												deviceLat: state.address.deviceLat,
												deviceLng: state.address.deviceLng,
												...(state.address.deviceAccuracy != null
													? { deviceAccuracy: state.address.deviceAccuracy }
													: {}),
												...(state.address.capturedAt ? { capturedAt: state.address.capturedAt } : {}),
											}
										: {}),
								},
							}
						: {}),
					// Supporting documents — artefacts held on file. Validated against
					// the resolved workflow's request list; anything it did not ask
					// for is dropped server-side rather than refused.
					...(state.supportingDocuments.length > 0
						? {
								supportingDocuments: state.supportingDocuments.map((d) => ({
									type: d.type,
									mediaId: d.mediaId,
									...(d.method ? { method: d.method } : {}),
								})),
							}
						: {}),
					...(config.userId ? { userId: config.userId } : {}),
					...(userData ? { userData } : {}),
					// Extra-info questionnaire answers — validated server-side
					// against the workflow's published definition.
					...(Object.keys(state.questionnaireAnswers).length > 0
						? { questionnaire: state.questionnaireAnswers }
						: {}),
					// Contact-verification proof tokens (email/phone OTP steps).
					...(state.contact.emailToken || state.contact.phoneToken
						? {
								contact: {
									...(state.contact.emailToken ? { emailToken: state.contact.emailToken } : {}),
									...(state.contact.phoneToken ? { phoneToken: state.contact.phoneToken } : {}),
								},
							}
						: {}),
					mediaIds: {
						// Multi-ID: slot documents ride idChecks; only the run-level
						// media (the one selfie + videos) sit at the top level.
						documentFront: multiSlots ? undefined : state.mediaIds.documentFront,
						documentBack: multiSlots ? undefined : state.mediaIds.documentBack,
						selfie: state.mediaIds.selfie,
						// Run-level like the selfie: one PoA document / door photo per run.
						proofOfAddress: state.mediaIds.proofOfAddress,
						addressPhoto: state.mediaIds.addressPhoto,
						...videoIds,
						...silent.mediaIds,
					},
					metadata: {
						...withSilentCaptureMetadata(
							buildSubmitMetadata(config.metadata, requestId, config.deviceIntelligence !== false),
							silent,
						),
						// Ignored by production, so it is safe to send whenever it is set
						// (the business flow's sandboxOutcome contract).
						...(state.addressSandboxOutcome
							? { sandboxOutcome: state.addressSandboxOutcome }
							: {}),
					},
				}),
			{ onRetry },
		);
		finishSubmit(result.verificationId, requestId);
	}

	function finishSubmit(verificationId: string, requestId: string) {
		setRetryInfo(null);
		dispatch({ type: "SUBMISSION_SUCCESS", payload: verificationId });
		config.onSubmit?.({
			verificationId,
			status: "pending",
			metadata: { ...config.metadata, requestId },
			submittedAt: new Date().toISOString(),
		});
	}

	async function runSubmit() {
		// Put UI into loading state immediately
		dispatch({ type: "SUBMIT_VERIFICATION" });
		setRetryInfo(null);
		setRecoverTo(null);
		const business = isBusinessFlow(config);
		// A KYB application whose business half already committed replays its
		// original request id: the server answers from the existing row, with
		// the applicant KeyPerson, instead of refusing a second application on
		// the spent session (lib/resumed-application.ts).
		const requestId = submissionRequestId(business, state.resumedApplication, () =>
			generateRequestId(business ? 'kyb' : 'kyc'),
		);
		try {
			if (business) await submitBusiness(requestId);
			else await submitIndividual(requestId);
		} catch (err) {
			setRetryInfo(null);
			// The organisation cancelled this session: no Try again or Go back can
			// help. The modal swaps to the cancelled screen, which reports onError.
			if (isSessionCancelledError(err)) {
				dispatch({ type: "SET_SESSION_CANCELLED", payload: { message: sessionCancelledMessage(err) } });
				return;
			}
			// A refusal over stale contact proofs is recoverable in-flow: clear
			// the dead tokens and walk back to the contact step, which routes
			// straight back here once re-verified (see contact-recovery.ts).
			// Everything else: retries (if any) are exhausted — surface a typed
			// error.
			const expired = expiredContactChannels(err);
			if (expired.length > 0) {
				dispatch({ type: "CLEAR_CONTACT_PROOFS", payload: { channels: expired } });
				dispatch({ type: "CLEAR_ERROR" });
				dispatch({ type: "SET_STEP", payload: contactStepFor(expired[0]) });
				return;
			}
			// Retries (if any) are exhausted. Read Go back's target off the
			// SERVER's refusal code, not the mapped client one.
			const refusal = serverRefusalOf(err);
			setRecoverTo(
				refusal ? recoveryStepFor(refusal.code, stepOrder, { mediaKey: refusal.mediaKey }) : null,
			);
			dispatch({ type: "SET_ERROR", payload: mapToVerificationError(err, "verify", t) });
		}
	}

	// Only where Try Again is not the answer: a refusal about what was entered
	// is fixed on its own step, and returning to 'submitted' remounts this step,
	// which submits again.
	const goBack =
		recoverTo && state.error && state.error.code !== "upload_failed" && state.error.code !== "network_error"
			? () => {
					dispatch({ type: "CLEAR_ERROR" });
					dispatch({ type: "SET_STEP", payload: recoverTo });
				}
			: undefined;

	if (state.status === "error" && state.error) {
		return (
			<SubmitErrorScreen
				message={state.error.message}
				onRetry={state.error.code === "upload_failed" ? retryUpload : () => setSubmitTrigger((t) => t + 1)}
				onClose={() => config.onClose?.()}
				onGoBack={goBack}
			/>
		);
	}

	const firstName = config.userData?.firstName || state.userData.firstName;
	const lastName = config.userData?.lastName || state.userData.lastName;
	// The applicant has entered the registration name by this screen, so
	// {businessName} resolves from real data (falling back to any upfront value).
	const businessName = state.business.registrationName.trim() || config.userData?.businessName;
	const tokens = { firstName, lastName, businessName };
	// The `doneButton` option hides the embedded Done for a host app that
	// dismisses the flow itself; a hosted page has no host app, so its
	// redirect or close-this-tab note stays whatever the option says.
	const terminalAction =
		!config.hostedMode && !showsDoneButton(config)
			? undefined
			: successAction({
					success: config.success,
					hostedMode: config.hostedMode === true,
					tokens,
					onClose: () => config.onClose?.(),
				}, t);

	// A flow that waits for its verdict (a biometric re-authentication, by
	// default) renders the result screen from the FIRST render: it shows the
	// one loading screen through the upload wait, the submission and the poll,
	// then the verdict. onSubmit has already fired by the time the id lands.
	if (waitsForResult(config)) {
		return (
			<SubmittedResult
				verificationId={state.status === "success" ? state.verificationId : null}
				retryInfo={retryInfo}
				action={terminalAction}
			/>
		);
	}

	if (state.status === "loading") {
		const words = biometricCopyFor(config).waiting;
		const copy = describeWaiting({ scope: configScope(config), waitsForResult: false, retry: retryInfo, override: words }, t);
		return <SubmittingScreen title={copy.title} description={copy.description} retrying={retryInfo != null} />;
	}

	return (
		<SubmitSuccessScreen
			title={successTitle(config.success, tokens, t)}
			description={successDescription(config.success, tokens, isBusinessFlow(config), configScope(config), t)}
			extra={
				<>
					{showsPresencePromise(config) && state.address && (
						<PresenceExpectations />
					)}
					{
				/* ONE list, from the server, once it is final.
				 *
				 * There used to be two: links built from what the applicant typed,
				 * replaced moments later by the server's reconciled view - a
				 * different component with a different layout, swapping under the
				 * reader. The client's version was also the wrong one to show,
				 * since the register can add people they never listed and correct
				 * the roles of those they did.
				 *
				 * So nothing appears until the answer will not change. `settled`
				 * is null while that is still true, and the line below says why
				 * rather than leaving a blank where a list is about to be. */
				settled
					? settled.length > 0
						? <KeyPeopleAwaitList rows={toAwaitRows(settled)} />
						: undefined
					: isBusinessFlow(config) && invitesExpected
						? <KeyPeoplePending />
						: undefined
					}
				</>
			}
			action={terminalAction}
		/>
	);
}
