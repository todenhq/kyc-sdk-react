"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
	Upload,
	RotateCcw,
	Check,
	Loader2,
	Camera,
	TriangleAlert,
	CreditCard,
	ArrowLeft,
	ImageUp,
} from '../components/icons';
import { StepHeader } from "../components/StepHeader";
import { ReadyPrimer } from "../components/ReadyPrimer";
import { READY_DOCUMENT } from "../components/ready-primer-content";
import { ImageCropper } from "../components/ImageCropper";
import { DocumentReview } from "./DocumentReview";
import { Button } from "../components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { CameraPermissionPrimer } from "../components/CameraPermissionPrimer";
import { useVerificationContext } from "../context/VerificationContext";
import { useVerificationConfig } from "../context/VerificationConfigContext";
import { stepAfterCapture } from "../lib/post-capture";
import { multiIdPlan } from "../lib/multi-id";
import { useCamera } from "../hooks/useCamera";
import { useSilentCapture } from "../hooks/useSilentCapture";
import { DOCUMENT_FRAME_DELAY_MS } from "../lib/silent-capture";
import { useCameraPrimer } from "../hooks/useCameraPrimer";
import {
	useDocumentDetection,
	type CardBounds,
} from "../hooks/useDocumentDetection";
import { useImageCompress } from "../hooks/useImageCompress";
import { useTorch } from "../hooks/useTorch";
import { ImmersiveOverlay } from "../components/viewfinder/ImmersiveOverlay";
import { InlineOverlay } from "../components/viewfinder/InlineOverlay";
import { useSetImmersiveCapture } from "../components/immersive-capture";
import { isDesktopDevice } from "../lib/device";
import { documentCropRect } from "../lib/document-guide";
import { shortDocumentLabel } from "../lib/document-label";
import { documentCaptureMethods } from "../lib/document-capture-methods";
import { DocumentUploadPanel } from "./DocumentUploadPanel";
import { DocumentCaptureWarning } from "./DocumentCaptureWarning";
import { useDocumentCaptureCheck } from "./use-document-capture-check";
import type { CaptureSide } from "../lib/document-capture-check";
import {
	DocumentFramingGate,
	documentBoxFrom,
	documentHintText,
	type DocumentGuidance,
} from "../lib/document-framing-gate";
import { useLightLevel } from "../hooks/useLightLevel";
import { primeSpeech } from "../liveness/speech";
import { withRetry } from "../lib/retry";
import { mapToVerificationError, safeReportError } from "../lib/errors";
import { VerificationError } from "../types/verification";
import { cn } from "../lib/utils";
import {
	DOCUMENT_CAPTURE_WIDTH,
	DOCUMENT_CAPTURE_HEIGHT,
	DOCUMENT_IMAGE_QUALITY,
	DOCUMENT_VIDEO_BITRATE,
	createVideoRecorder,
	isFrontFacingStream,
	logCaptureSize,
} from "../lib/capture-settings";
import { verifiedIdsFromState } from '../lib/supporting-documents';
import { useText } from "../i18n";

// Scan phases:
//   front         — camera open for front side
//   front-preview — review front image before proceeding to back
//   back          — camera open for back side
//   review        — both images shown, ready to upload and proceed
type ScanPhase = "front" | "front-preview" | "back" | "review";

// State driving the post-capture zoom-crop animation. `snapshot` is the frozen
// full live frame; `bounds` is the detected card rectangle in full video-pixel
// coordinates; `captured` is the final cropped still to commit when done.
interface CaptureZoomState {
	snapshot: string;
	videoW: number;
	videoH: number;
	bounds: CardBounds;
	mirror: boolean;
	captured: string;
}

/** Respect the user's reduced-motion preference — skip the zoom animation. */
function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

/**
 * Grab the current video frame as a JPEG data URL (downscaled for memory; the
 * reported `w`/`h` are the FULL video dimensions so detected card bounds map
 * correctly onto it).
 */
function grabFrameSnapshot(
	video: HTMLVideoElement,
): { url: string; w: number; h: number } | null {
	const vw = video.videoWidth;
	const vh = video.videoHeight;
	if (vw === 0 || vh === 0) return null;
	const maxW = 1280;
	const scale = vw > maxW ? maxW / vw : 1;
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(vw * scale);
	canvas.height = Math.round(vh * scale);
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
	return { url: canvas.toDataURL("image/jpeg", 0.82), w: vw, h: vh };
}

export function DocumentCaptureStep() {
	const { state, dispatch } = useVerificationContext();
	const config = useVerificationConfig();
	const t = useText();

	// How the user may supply each side: scanned live with the camera, picked
	// from the device (gallery / file picker / drag-and-drop), or either. Both
	// default on, and the pair is resolved in one place so a config with both
	// switched off still keeps the camera (see document-capture-methods.ts).
	const { scan: allowScan, upload: allowUpload } = documentCaptureMethods(config);
	// Upload-only (`allowDocumentScan: false`): this step never starts the
	// camera. No primer, no viewfinder, no recording: each side is a photo the
	// user picks, run through the same crop, compress and upload path.
	const uploadOnly = !allowScan;

	// Label + scan sides come from the resolved definition — the curated local
	// entry when one exists, else the server-supplied metadata (Global
	// Documents: any ISO country).
	const idTypeDef = state.selectedIdType
		? config.getIdTypeDefinition(state.selectedIdType)
		: null;
	const idTypeLabel =
		idTypeDef?.label ?? state.selectedIdType ?? t("uploadDocument.documentFallback");

	const scanSides = idTypeDef?.scanSides ?? "front_only";
	const isTwoSided = scanSides === "front_and_back";

	const initialPhase = (): ScanPhase => {
		if (isTwoSided) {
			if (!state.documentFrontImage) return "front";
			if (!state.documentBackImage) return "front-preview";
			return "review";
		}
		return state.documentFrontImage ? "review" : "front";
	};

	const [phase, setPhase] = useState<ScanPhase>(initialPhase);
	const [frontPreview, setFrontPreview] = useState<string | null>(
		state.documentFrontImage,
	);
	const [backPreview, setBackPreview] = useState<string | null>(
		state.documentBackImage,
	);
	const [showFlipBanner, setShowFlipBanner] = useState(false);
	const [isUploading, setIsUploading] = useState(false);
	// Whether the uploaded photos can be read, asked before moving on.
	const {
		problems: captureProblems,
		setProblems: setCaptureProblems,
		clear: clearCaptureCheck,
		check: checkCapture,
	} = useDocumentCaptureCheck();
	const [uploadError, setUploadError] = useState<string | null>(null);
	// "Upload failed. Retrying (n/total)…" surfaced while a transient upload retries.
	const [retryInfo, setRetryInfo] = useState<{
		attempt: number;
		total: number;
	} | null>(null);
	const [cropperSrc, setCropperSrc] = useState<string | null>(null);
	const [pauseForCrop, setPauseForCrop] = useState(false);
	// While set, a short "zoom-crop" animation plays over the viewport: the frozen
	// live frame zooms onto the detected document before the cropped still is
	// shown — instead of hard-cutting to a tight, zoomed crop. Cleared on finish.
	const [captureZoom, setCaptureZoom] = useState<CaptureZoomState | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	// True between opening the OS file picker and a file actually being chosen.
	// Used to detect a cancelled picker (window refocuses with no file) so we can
	// restore the camera instead of leaving a collapsed, empty screen.
	const uploadPendingRef = useRef(false);

	// Video recording refs — one recorder per camera session.
	// The "side" of each recording is captured at start time so the onstop
	// handler dispatches to the correct slot (front vs back).
	const recorderRef = useRef<MediaRecorder | null>(null);
	const docChunksRef = useRef<Blob[]>([]);
	const docMimeRef = useRef("video/webm");
	const recordingSideRef = useRef<"front" | "back" | null>(null);

	// Every camera surface below (the primers, the stream, detection, the light
	// meter, immersive mode, recording) gates on this, so upload-only keeps them
	// all switched off by never letting it become true.
	const cameraActive =
		allowScan && (phase === "front" || phase === "back") && !pauseForCrop;

	// Show an "Allow camera access" primer before the OS prompt (Stripe-style),
	// unless the camera is already granted. The camera only starts — and thus the
	// OS prompt only fires — once the user taps "Grant access".
	const primerStatus = useCameraPrimer();
	const [primed, setPrimed] = useState(false);
	// "Here's what happens next" gate — shown once before the camera opens, so
	// the viewfinder never appears unannounced. The permission primer (and the
	// OS prompt behind it) follows only after the user says they're ready.
	const [ready, setReady] = useState(false);
	const showReadyPrimer = cameraActive && !ready;
	const needsPrimer = cameraActive && ready && primerStatus === "needed" && !primed;
	// The viewfinder is genuinely on screen — not merely "the camera phase".
	// The primers and the flip banner occupy the same space without a guide, so
	// anything that steps aside for the viewfinder must test this, not
	// `cameraActive`, or it disappears behind a panel that never replaced it.
	const viewfinderVisible =
		cameraActive && !showReadyPrimer && !needsPrimer && !showFlipBanner;

	// Document capture runs at a higher resolution than liveness so the still
	// image stays sharp enough for OCR (see capture-settings.ts). The video is
	// kept small via the bitrate + frame-rate caps, not by lowering resolution.
	const camera = useCamera({
		facingMode: "environment",
		enabled: cameraActive && ready && (primerStatus === "granted" || primed),
		resolution: {
			width: DOCUMENT_CAPTURE_WIDTH,
			height: DOCUMENT_CAPTURE_HEIGHT,
		},
	});
	// The element the video renders into with `object-fit: cover`. Measured at
	// capture time so the shutter can crop to the guide the user framed against
	// (see documentCropRect) instead of storing the whole sensor frame.
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const detectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
	// Set once the guide's aspect is known (below): the fallback capture keeps
	// the region under the guide, like the manual shutter.
	const fallbackCropRef = useRef<
		((frame: { width: number; height: number }) => CardBounds | null) | null
	>(null);
	const detection = useDocumentDetection({
		videoRef: camera.videoRef,
		canvasRef: detectionCanvasRef,
		enabled: cameraActive && camera.isReady,
		getFallbackCrop: (frame) => fallbackCropRef.current?.(frame) ?? null,
	});
	const { compressDocument, isCompressing } = useImageCompress();
	const { level: lightLevel } = useLightLevel(
		camera.videoRef,
		cameraActive && camera.isReady,
	);
	const isDim = lightLevel === "dark";
	const isBright = lightLevel === "bright";

	// ── Immersive capture (mobile) ──────────────────────────────────────────
	//
	// On a phone the live camera takes the whole surface, matching the React
	// Native and Flutter screens: the framing guide has to be big enough to
	// align a card against, and the modal's banner, header, padding and footer
	// eat roughly a third of the viewport. Desktop keeps the inline framing —
	// there the modal is a window on a large screen, and a full-bleed camera
	// would be a webcam filling a monitor.
	//
	// Gated on the preview actually being live, so the chrome stays put through
	// the primer, the permission prompt and the flip banner — going immersive
	// before there is anything to see reads as the UI vanishing.
	const torch = useTorch(camera.stream);
	const setImmersiveCapture = useSetImmersiveCapture();
	// Deliberately NOT gated on `camera.isReady`: the stream takes a moment to
	// come up after the primer closes, and waiting for it rendered the inline
	// layout — header, badge, letterboxed box, hint — for that beat before
	// swapping to full screen. The flash read as two different screens. Going
	// immersive the instant the primers are done means the spinner appears in
	// the surface the camera is about to fill.
	//
	// An error DOES drop back: the error panel carries Try Again / Upload and
	// needs the step's header for context and a way out.
	const immersive =
		!isDesktopDevice() &&
		cameraActive &&
		!camera.error &&
		!showReadyPrimer &&
		!needsPrimer &&
		!showFlipBanner;

	useEffect(() => {
		setImmersiveCapture(immersive);
		// Release on unmount too: leaving mid-capture (back, an error boundary,
		// a completed capture) must not strand the modal without its chrome.
		return () => setImmersiveCapture(false);
	}, [immersive, setImmersiveCapture]);

	// ID-1 cards use 1.586; passports use a taller 1.42 so the data page's MRZ
	// band is not cropped off. Mirrors the native documentGuideAspect.
	const guideAspect = state.selectedIdType === "passport" ? 1.42 : 85.6 / 53.98;
	fallbackCropRef.current = (frame) => {
		const viewport = viewportRef.current;
		if (!viewport) return null;
		return documentCropRect({
			frame,
			view: { width: viewport.clientWidth, height: viewport.clientHeight },
			aspect: guideAspect,
		});
	};

	// Auto-capture framing gate — the Flutter logic, fed from this SDK's edge
	// detector. It decides the five visual states and the instruction; the
	// overlay only draws them. Rebuilt per side so the dwell and the fired
	// latch reset when the user flips the card.
	const gateRef = useRef<DocumentFramingGate | null>(null);
	if (!gateRef.current) {
		gateRef.current = new DocumentFramingGate({ expectedAspect: guideAspect });
	}
	useEffect(() => {
		gateRef.current = new DocumentFramingGate({ expectedAspect: guideAspect });
		setGuidance({ framing: "none", hint: "searching" });
		setDwell(0);
	}, [guideAspect, phase]);

	const [guidance, setGuidance] = useState<DocumentGuidance>({
		framing: "none",
		hint: "searching",
	});
	const [dwell, setDwell] = useState(0);

	// Feed the gate from the detector. `cardBounds` is in detection-canvas
	// coordinates, so it is normalised against that canvas — the same frame the
	// bounds were measured in.
	useEffect(() => {
		const gate = gateRef.current;
		if (!gate || !cameraActive || !camera.isReady) return;
		const canvas = detectionCanvasRef.current;
		const box =
			detection.cardBounds && canvas
				? documentBoxFrom(detection.cardBounds, {
						width: canvas.width,
						height: canvas.height,
					})
				: null;
		// useLightLevel reports a band, not a luma; map it onto the gate's scale
		// so a dark frame still produces the "move somewhere brighter" hint.
		const brightness = lightLevel === "dark" ? 0.1 : 0.5;
		setGuidance(gate.update(box, { brightness }));
		setDwell(gate.progress(Date.now()));
	}, [
		detection.cardBounds,
		detection.isCardDetected,
		detection.isStable,
		cameraActive,
		camera.isReady,
		lightLevel,
	]);

	// Report a denied camera permission to onError once. Document capture still
	// offers a gallery-upload fallback, so this is informational — the flow isn't
	// hard-blocked here (unlike liveness).
	const permissionReportedRef = useRef(false);
	useEffect(() => {
		if (camera.permissionDenied && !permissionReportedRef.current) {
			permissionReportedRef.current = true;
			safeReportError(
				config.onError,
				new VerificationError(
					"camera_permission_denied",
					"Camera access is required to photograph your document. Please allow camera access to continue.",
				),
			);
		}
		if (!camera.permissionDenied) permissionReportedRef.current = false;
	}, [camera.permissionDenied, config]);

	// Mirror the PREVIEW on a front-facing camera, exactly as the selfie steps
	// do: an unmirrored front camera moves the opposite way to the user, which
	// makes lining a card up against the guide needlessly fiddly.
	//
	// The stored photo stays UNMIRRORED, which is where this differs from the
	// selfie steps (they mirror both). A document is read, not looked at: the
	// server's OCR, MRZ scanner and barcode decoders all need the true image,
	// and a flipped one would fail them silently. Both guides are horizontally
	// centred, so the crop takes the same region either way — only the content
	// inside it is flipped back.
	//
	// Front-facing is decided by `isFrontFacingStream`, which mirrors only on
	// positive evidence. The rule this replaced (`facingMode !== 'environment'`)
	// treated an absent `facingMode` as front and so mirrored rear cameras on
	// every browser that omits it.
	const [mirrorPreview, setMirrorPreview] = useState(false);
	useEffect(() => {
		setMirrorPreview(isFrontFacingStream(camera.stream));
	}, [camera.stream]);

	// Silent capture (lib/silent-capture.ts), which runs on this step only:
	// when the document camera is a FRONT one (a laptop webcam), it is also
	// looking at the person, so one unposed frame is taken shortly after each
	// side's camera goes live. A phone's rear camera sees only the document and
	// takes nothing.
	useSilentCapture({
		videoRef: camera.videoRef,
		active: cameraActive && camera.isReady && mirrorPreview,
		delayMs: DOCUMENT_FRAME_DELAY_MS,
	});

	// ---------------------------------------------------------------------------
	// Video recording — starts when camera stream is available
	// ---------------------------------------------------------------------------

	useEffect(() => {
		if (!camera.stream) return;

		docChunksRef.current = [];
		const created = createVideoRecorder(camera.stream, DOCUMENT_VIDEO_BITRATE);
		if (!created) return; // MediaRecorder not supported in this browser
		const { recorder, mimeType } = created;
		docMimeRef.current = mimeType;

		// Capture which side this recording is for. The recorder is created when the
		// camera stream becomes available, which only happens while we're in the
		// 'front' or 'back' capture phases.
		const sideAtStart: "front" | "back" = phase === "back" ? "back" : "front";
		recordingSideRef.current = sideAtStart;

		recorder.ondataavailable = (e) => {
			if (e.data.size > 0) docChunksRef.current.push(e.data);
		};
		recorder.onstop = () => {
			if (docChunksRef.current.length > 0) {
				const blob = new Blob(docChunksRef.current, {
					type: docMimeRef.current,
				});
				docChunksRef.current = [];
				logCaptureSize(`document ${sideAtStart} video`, blob);
				dispatch({
					type:
						sideAtStart === "back" ?
							"SET_DOCUMENT_BACK_VIDEO"
						:	"SET_DOCUMENT_FRONT_VIDEO",
					payload: blob,
				});
			}
		};
		recorder.start(200);
		recorderRef.current = recorder;

		return () => {
			// If the recorder was already stopped manually (e.g. on capture), let
			// the original onstop dispatch the recorded blob — don't disturb it.
			if (recorder.state === "inactive") {
				if (recorderRef.current === recorder) recorderRef.current = null;
				return;
			}
			// Otherwise the user navigated away mid-recording — discard.
			docChunksRef.current = [];
			recorder.onstop = null;
			try {
				recorder.stop();
			} catch {
				/* already stopped */
			}
			if (recorderRef.current === recorder) recorderRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [camera.stream, dispatch]);

	// Stop the active recorder. When `save` is true, the existing onstop handler
	// dispatches the blob to the right slot. When false (user-initiated discard),
	// chunks are cleared first and onstop is suppressed.
	const stopDocRecorder = useCallback((save: boolean) => {
		const r = recorderRef.current;
		if (!r) return;
		if (!save) {
			docChunksRef.current = [];
			r.onstop = null;
		}
		if (r.state !== "inactive") {
			try {
				r.stop();
			} catch {
				/* already stopped */
			}
		}
		recorderRef.current = null;
	}, []);

	// ---------------------------------------------------------------------------
	// Auto-capture from document detection
	// ---------------------------------------------------------------------------

	useEffect(() => {
		if (!detection.capturedImage || !cameraActive) return;
		// Discourage auto-capture while lighting is poor — a too-dark or glare-blown
		// frame won't OCR. The manual shutter still works (user override); the
		// detector will re-fire once the card stabilizes under acceptable light.
		if (lightLevel !== "ok") {
			detection.reset();
			return;
		}
		const captured = detection.capturedImage;
		const bounds = detection.cardBounds;
		// Snapshot the live frame BEFORE stopping the camera, so we can animate the
		// crop-in (camera zooming onto the document) rather than hard-cutting to the
		// tight cropped still. Falls back to an instant swap when we can't animate.
		const video = camera.videoRef.current;
		const snap =
			video && bounds && video.videoWidth > 0 ? grabFrameSnapshot(video) : null;
		detection.reset();
		stopDocRecorder(true);
		camera.stop();
		if (snap && bounds && !prefersReducedMotion()) {
			setCaptureZoom({
				snapshot: snap.url,
				videoW: snap.w,
				videoH: snap.h,
				bounds,
				mirror: mirrorPreview,
				captured,
			});
		} else {
			storeCapture(captured);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [detection.capturedImage, lightLevel]);

	// Finish the zoom-crop animation: drop the overlay and commit the still.
	const finishCaptureZoom = useCallback(() => {
		if (!captureZoom) return;
		const captured = captureZoom.captured;
		setCaptureZoom(null);
		storeCapture(captured);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [captureZoom, phase, isTwoSided]);

	// ---------------------------------------------------------------------------
	// Store a captured image for the current phase
	// ---------------------------------------------------------------------------

	function storeCapture(base64: string) {
		if (phase === "front") {
			setFrontPreview(base64);
			dispatch({ type: "SET_DOCUMENT_FRONT", payload: base64 });
			setPhase(isTwoSided ? "front-preview" : "review");
		} else if (phase === "back") {
			setBackPreview(base64);
			dispatch({ type: "SET_DOCUMENT_BACK", payload: base64 });
			setPhase("review");
		}
	}

	function proceedToBack() {
		if (backPreview) {
			setPhase("review");
			return;
		}
		// Upload-only has no card to flip in front of a camera: the back's own
		// upload screen says what to add next.
		if (uploadOnly) {
			setPhase("back");
			return;
		}
		setShowFlipBanner(true);
		setTimeout(() => {
			setShowFlipBanner(false);
			setPhase("back");
			detection.reset();
		}, 1500);
	}

	// ---------------------------------------------------------------------------
	// File upload / drop
	// ---------------------------------------------------------------------------

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;
			uploadPendingRef.current = false; // a file was chosen — not a cancel
			const reader = new FileReader();
			reader.onload = () => {
				setUploadError(null);
				setPauseForCrop(true);
				setCropperSrc(reader.result as string);
			};
			reader.readAsDataURL(file);
			e.target.value = "";
		},
		[],
	);

	const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		const file = e.dataTransfer.files?.[0];
		if (!file || !file.type.startsWith("image/")) return;
		const reader = new FileReader();
		reader.onload = () => {
			setUploadError(null);
			setPauseForCrop(true);
			setCropperSrc(reader.result as string);
		};
		reader.readAsDataURL(file);
	}, []);

	const handleCropConfirm = useCallback(
		async (cropped: string) => {
			// Uploaded/cropped documents go through OCR too — keep them sharp.
			const compressed = await compressDocument(cropped);
			logCaptureSize("document still (cropped upload)", compressed);
			setPauseForCrop(false);
			setCropperSrc(null);
			storeCapture(compressed);
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[compressDocument, phase, isTwoSided],
	);

	// Restore the camera after an upload that didn't produce a cropper (e.g. the
	// user cancelled the OS file picker), so the step never gets stuck on an
	// empty/collapsed screen.
	const cancelUpload = useCallback(() => {
		uploadPendingRef.current = false;
		setPauseForCrop(false); // cameraActive flips back on → useCamera restarts
	}, []);

	const openUpload = useCallback(() => {
		stopDocRecorder(false);
		camera.stop();
		setPauseForCrop(true);
		uploadPendingRef.current = true;

		// The native file dialog gives no "cancelled" event. When the window
		// regains focus after it closes, check (after a tick, so a real selection's
		// change event lands first) whether a file was chosen — if not, recover.
		const onFocus = () => {
			window.removeEventListener("focus", onFocus);
			window.setTimeout(() => {
				if (uploadPendingRef.current) cancelUpload();
			}, 500);
		};
		window.addEventListener("focus", onFocus);

		fileInputRef.current?.click();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [camera, stopDocRecorder, cancelUpload]);

	// Upload-only: open the picker straight from the side's upload screen. There
	// is no camera to pause or recording to discard, and a cancelled picker just
	// leaves that screen as it was.
	const chooseFile = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	// ---------------------------------------------------------------------------
	// Manual capture button
	// ---------------------------------------------------------------------------

	const handleManualCapture = useCallback(async () => {
		const video = camera.videoRef.current;
		if (!video || video.readyState < video.HAVE_CURRENT_DATA) return;

		// Store the region under the guide, not the whole frame. The preview is
		// `object-cover`, so the user only ever saw a slice of the sensor frame —
		// keeping all of it hands back a wider, zoomed-out photo with the document
		// small and off-centre, which is not what they framed. Matches Flutter,
		// which crops to the same rectangle after every shutter.
		//
		// Crop to the guide that was painted. Both layouts now draw the SAME
		// rectangle (documentGuideRect), so there is one geometry to honour —
		// the desktop view used to paint its own, which meant the crop had to
		// carry a second rectangle just to match it.
		const viewport = viewportRef.current;
		const view =
			viewport ?
				{ width: viewport.clientWidth, height: viewport.clientHeight }
			:	null;
		const crop =
			view ?
				documentCropRect({
					frame: { width: video.videoWidth, height: video.videoHeight },
					view,
					aspect: guideAspect,
				})
			:	null;

		const canvas = document.createElement("canvas");
		canvas.width = crop ? crop.width : video.videoWidth;
		canvas.height = crop ? crop.height : video.videoHeight;
		const ctx = canvas.getContext("2d");
		if (crop) {
			ctx?.drawImage(
				video,
				crop.x,
				crop.y,
				crop.width,
				crop.height,
				0,
				0,
				crop.width,
				crop.height,
			);
		} else {
			ctx?.drawImage(video, 0, 0);
		}
		const raw = canvas.toDataURL("image/jpeg", DOCUMENT_IMAGE_QUALITY);

		const compressed = await compressDocument(raw);
		logCaptureSize("document still (manual)", compressed);
		stopDocRecorder(true);
		camera.stop();
		detection.reset();
		setUploadError(null);
		storeCapture(compressed);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		camera,
		compressDocument,
		detection,
		phase,
		isTwoSided,
		stopDocRecorder,
		immersive,
		guideAspect,
	]);

	// ---------------------------------------------------------------------------
	// Upload images and advance to liveness
	// ---------------------------------------------------------------------------

	// Move on from stored uploads: a successful Continue, or "Continue anyway"
	// past the capture check, which uploads and checks nothing again.
	const advance = useCallback(() => {
		clearCaptureCheck();
		// Skip liveness when the org has it disabled for this ID — go straight
		// to the submission step.
		const features =
			state.selectedIdType ?
				config.getIdTypeFeatures(config.country, state.selectedIdType)
			:	null;
		const skipLiveness =
			config.enableSelfie === false ||
			(features ? !features.livenessCheck : config.enableLiveness === false);
		const afterRun = skipLiveness ? stepAfterCapture(config, verifiedIdsFromState(state, config)) : "liveness";
		// Multi-ID: this slot is done — commit its evidence and move to the
		// next slot's picker, or on to liveness after the last slot.
		const plan = multiIdPlan(config, state, config.serverConfig.idTypes);
		if (!skipLiveness && (!plan || plan.last)) primeSpeech();
		if (plan) {
			dispatch({
				type: "COMMIT_MULTI_ID_SLOT",
				payload: { nextStep: plan.last ? afterRun : "id-type" },
			});
			return;
		}
		dispatch({ type: "SET_STEP", payload: afterRun });
	}, [clearCaptureCheck, config, dispatch, state]);

	const handleContinue = useCallback(async () => {
		if (!frontPreview) return;

		setIsUploading(true);
		setUploadError(null);
		setRetryInfo(null);

		const api = config.api;
		const onRetry = (attempt: number, total: number) =>
			setRetryInfo({ attempt, total });

		try {
			// Convert base64 to blob for upload
			const toBlob = (dataUrl: string): Blob => {
				const [header, data] = dataUrl.split(",");
				const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
				const binary = atob(data);
				const bytes = new Uint8Array(binary.length);
				for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
				return new Blob([bytes], { type: mime });
			};

			// Upload front (retried on transient failures: network / timeout / 5xx)
			const frontBlob = toBlob(frontPreview);
			const frontMediaId = await withRetry(
				() => api.upload(frontBlob, "document_front"),
				{ onRetry },
			);
			dispatch({
				type: "SET_MEDIA_ID",
				payload: { mediaType: "documentFront", mediaId: frontMediaId },
			});

			// Upload back if present
			const uploads: Array<{ side: CaptureSide; mediaId: string }> = [
				{ side: "front", mediaId: frontMediaId },
			];
			if (isTwoSided && backPreview) {
				const backBlob = toBlob(backPreview);
				const backMediaId = await withRetry(
					() => api.upload(backBlob, "document_back"),
					{ onRetry },
				);
				dispatch({
					type: "SET_MEDIA_ID",
					payload: { mediaType: "documentBack", mediaId: backMediaId },
				});
				uploads.push({ side: "back", mediaId: backMediaId });
			}

			setRetryInfo(null);
			// Ask whether the verification can read these photos before moving on,
			// so a photo it could not read is retaken now rather than declined
			// later. The uploads stay stored: "Continue anyway" does not redo them.
			const problems = await checkCapture(uploads);
			setIsUploading(false);
			if (problems.length > 0) {
				setCaptureProblems(problems);
				return;
			}
			advance();
		} catch (err) {
			// Retries exhausted — show the inline error AND report a typed error once.
			setRetryInfo(null);
			setIsUploading(false);
			const verificationError = mapToVerificationError(err, "upload");
			setUploadError(verificationError.message);
			safeReportError(config.onError, verificationError);
		}
	}, [
		frontPreview,
		backPreview,
		isTwoSided,
		config,
		dispatch,
		checkCapture,
		setCaptureProblems,
		advance,
	]);

	// ---------------------------------------------------------------------------
	// Retake helpers
	// ---------------------------------------------------------------------------

	const retakeFront = () => {
		clearCaptureCheck();
		stopDocRecorder(false);
		setCaptureZoom(null);
		setFrontPreview(null);
		setUploadError(null);
		dispatch({ type: "CLEAR_DOCUMENT_FRONT" });
		detection.reset();
		setPhase("front");
		// Upload-only: Replace opens the picker in the same tap. Cancelling it
		// leaves the front's upload screen, where the user can choose again.
		if (uploadOnly) chooseFile();
	};

	const retakeBack = () => {
		clearCaptureCheck();
		stopDocRecorder(false);
		setCaptureZoom(null);
		setBackPreview(null);
		setUploadError(null);
		dispatch({ type: "CLEAR_DOCUMENT_BACK" });
		detection.reset();
		setPhase("back");
		if (uploadOnly) chooseFile();
	};

	const handleBack = () => {
		camera.stop();
		setCaptureZoom(null);
		detection.reset();
		dispatch({ type: "SET_STEP", payload: "id-type" });
	};

	// ---------------------------------------------------------------------------
	// Labels
	// ---------------------------------------------------------------------------

	const isBusy = isCompressing || isUploading;

	// The gallery fallback is normally gated by `allowDocumentUpload`, but it's
	// always offered on the camera-permission-denied screen as an escape hatch so
	// the user is never hard-stuck without a way to provide their document.
	const showUploadFallback = allowUpload || camera.permissionDenied;

	// Centered spinner overlay shown over the document preview frame while uploading.
	const uploadOverlay = (
		<div className='absolute inset-0 flex items-center justify-center bg-black/40 animate-fade-in'>
			<div className='relative flex items-center justify-center'>
				<div className='absolute h-16 w-16 rounded-full border-2 border-primary/40 animate-pulse-ring' />
				<div className='flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 backdrop-blur-sm'>
					<Loader2 className='h-6 w-6 animate-spin text-primary' />
				</div>
			</div>
		</div>
	);

	// Each case is its own catalogue entry, so a workflow can reword it whole.
	const doc = { document: idTypeLabel };
	const titleKey =
		phase === "front" ?
			isTwoSided ?
				uploadOnly ? "uploadDocument.title.uploadFront" : "uploadDocument.title.scanFront"
			: uploadOnly ? "uploadDocument.title.upload"
			: "uploadDocument.title.capture"
		: phase === "front-preview" ?
			uploadOnly ? "uploadDocument.title.frontAdded" : "uploadDocument.title.frontCaptured"
		: phase === "back" ?
			uploadOnly ? "uploadDocument.title.uploadBack" : "uploadDocument.title.scanBack"
		: "uploadDocument.title.review";
	const title = t(titleKey, doc);

	// Upload-only copy: the same beats, with the camera's words taken out.
	const descriptionKey =
		phase === "front" ?
			isTwoSided ?
				uploadOnly ? "uploadDocument.description.uploadFront" : "uploadDocument.description.scanFront"
			: uploadOnly ? "uploadDocument.description.upload"
			: "uploadDocument.description.capture"
		: phase === "front-preview" ?
			uploadOnly ? "uploadDocument.description.frontAdded" : "uploadDocument.description.frontCaptured"
		: phase === "back" ?
			uploadOnly ? "uploadDocument.description.uploadBack" : "uploadDocument.description.scanBack"
		: isTwoSided ?
			uploadOnly ? "uploadDocument.description.reviewBothAdded" : "uploadDocument.description.reviewBoth"
		: "uploadDocument.description.review";
	const description = t(descriptionKey, doc);

	const stepProgress =
		isTwoSided && (phase === "front" || phase === "front-preview") ?
			t("uploadDocument.progress", { current: 1, total: 2 })
		: phase === "back" ? t("uploadDocument.progress", { current: 2, total: 2 })
		: null;

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	if (cropperSrc) {
		const cancelCrop = () => {
			setCropperSrc(null);
			setPauseForCrop(false);
		};
		return (
			<div className='space-y-4 animate-slide-up'>
				<StepHeader
					title={t(
						phase === "back" ? "uploadDocument.crop.titleBack" : "uploadDocument.crop.title",
					)}
					description={t("uploadDocument.crop.description")}
					onBack={cancelCrop}
				/>
				<ImageCropper
					src={cropperSrc}
					onConfirm={handleCropConfirm}
					onCancel={cancelCrop}
				/>
			</div>
		);
	}

	return (
		<div
			className={cn(
				'animate-slide-up',
				// Immersive drops the stack spacing along with the header and badge:
				// the camera is the only child, and `space-y-5` would push it down by
				// a gap with nothing above it.
				immersive ? 'flex min-h-0 flex-1 flex-col' : 'space-y-5',
				// Review opts into the modal's flex layout (like CountrySelectStep) so
				// its action bar can be pinned instead of scrolling out of sight.
				// space-y-5 is KEPT there: the header and the document badge above are
				// siblings, and collapsing their spacing to pin a footer would trade
				// one layout bug for another.
				phase === 'review' && 'flex min-h-0 flex-1 flex-col',
			)}>
			{/* Header and badge are the step's own chrome. In immersive capture the
			    overlay carries both — the document pill names the document and the
			    round control is the way back — so rendering them here would leave a
			    band above a camera that is meant to own the screen. */}
			{!immersive && (
				<StepHeader title={title} description={description} onBack={handleBack} />
			)}

			{/* Document type badge + progress.
			    Hidden while the viewfinder is up: the in-frame document pill now
			    names the document and its country, and the side badge names the
			    side, so this band would say the same thing twice, immediately
			    above itself. It still carries the review and flip phases, which
			    have no viewfinder to carry it for them. */}
			{!immersive && !viewfinderVisible && (
			<div className='flex flex-wrap items-center gap-2'>
				<div className='flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary'>
					<CreditCard
						className={cn(
							"h-4 w-4 shrink-0",
							showFlipBanner && "animate-card-flip",
						)}
					/>
					<span className='font-medium shrink-0'>
						{t("uploadDocument.badge.required")}
					</span>
					<span className='min-w-0 wrap-break-word'>{idTypeLabel}</span>
					{isTwoSided && phase !== "review" && (
						<span className='shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold'>
							{t(
								phase === "back" ?
									"uploadDocument.badge.backSide"
								:	"uploadDocument.badge.frontSide",
							)}
						</span>
					)}
				</div>
				{stepProgress && (
					<span className='shrink-0 text-xs text-muted-foreground'>
						{stepProgress}
					</span>
				)}
			</div>
			)}

			{/* Flip banner */}
			{showFlipBanner && (
				<div className='flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-medium text-primary animate-fade-in'>
					<CreditCard className='h-4 w-4 animate-card-flip' />
					{t("uploadDocument.flipBanner")}
				</div>
			)}

			{/* Hidden file input */}
			<input
				ref={fileInputRef}
				type='file'
				accept='image/*'
				className='hidden'
				onChange={handleFileChange}
			/>

			{/* ------------------------------------------------------------------ */}
			{/* Front preview                                                        */}
			{/* ------------------------------------------------------------------ */}
			{phase === "front-preview" && (
				<div className='space-y-4'>
					{/* Capped for the same reason as the review preview: at natural
					    aspect a document fills a desktop modal and pushes Retake and
					    Continue past the fold. */}
					<div className='mx-auto w-fit max-w-full overflow-hidden rounded-xl border border-border'>
						<img
							src={frontPreview!}
							alt='Front of document'
							className='max-h-[46vh] w-auto max-w-full object-contain'
						/>
					</div>
					<div className='flex gap-3'>
						<Button
							variant='outline'
							className='flex-1 gap-2'
							onClick={retakeFront}
							disabled={isBusy}>
							{uploadOnly ?
								<ImageUp className='h-4 w-4' />
							:	<RotateCcw className='h-4 w-4' />}
							{t(uploadOnly ? "uploadDocument.replace" : "common.retake")}
						</Button>
						<Button
							className='flex-1 gap-2'
							onClick={proceedToBack}
							disabled={isBusy}>
							{t(
								backPreview ? "uploadDocument.frontPreview.continueToReview"
								: uploadOnly ? "uploadDocument.frontPreview.nextUploadBack"
								: "uploadDocument.frontPreview.nextScanBack",
							)}
						</Button>
					</div>
				</div>
			)}

			{/* ------------------------------------------------------------------ */}
			{/* Review screen                                                        */}
			{/* ------------------------------------------------------------------ */}
			{phase === "review" && (
				<DocumentReview
					front={frontPreview!}
					back={isTwoSided ? backPreview : null}
					uploadOverlay={isUploading ? uploadOverlay : null}
					isBusy={isBusy}
					onRetakeFront={retakeFront}
					onRetakeBack={retakeBack}
					source={uploadOnly ? "upload" : "camera"}>
					{retryInfo && isUploading && (
						<p className='mb-2 text-center text-xs text-amber-700 dark:text-amber-400'>
							{t("uploadDocument.review.retrying", {
								attempt: retryInfo.attempt,
								total: retryInfo.total,
							})}
						</p>
					)}

					{captureProblems && captureProblems.length > 0 && !uploadError ?
						<DocumentCaptureWarning
							problems={captureProblems}
							uploadOnly={uploadOnly}
							isBusy={isBusy}
							onRetake={(side) => (side === "front" ? retakeFront() : retakeBack())}
							onContinueAnyway={advance}
						/>
					: uploadError ?
						<div className='space-y-3'>
							<Alert variant='destructive'>
								<TriangleAlert className='h-4 w-4' />
								<AlertTitle>{t("uploadDocument.review.uploadFailed")}</AlertTitle>
								<AlertDescription>{uploadError}</AlertDescription>
							</Alert>
							<Button
								className='w-full gap-2'
								onClick={handleContinue}
								disabled={isBusy}>
								{t("uploadDocument.tryAgain")}
							</Button>
						</div>
					:	<Button
							className='w-full gap-2'
							onClick={handleContinue}
							disabled={isBusy}>
							{isUploading ?
								<Loader2 className='h-4 w-4 animate-spin' />
							:	<Check className='h-4 w-4' />}
							{t("common.continue")}
						</Button>
					}
				</DocumentReview>
			)}

			{/* ------------------------------------------------------------------ */}
			{/* Camera permission primer (before the OS prompt)                     */}
			{/* ------------------------------------------------------------------ */}
			{showReadyPrimer && !showFlipBanner && (
				<ReadyPrimer {...READY_DOCUMENT} onReady={() => setReady(true)} />
			)}

			{needsPrimer && !showFlipBanner && (
				<CameraPermissionPrimer
					bodyText={t("primer.camera.bodyDocument")}
					onGrant={() => setPrimed(true)}
				/>
			)}

			{/* Upload-only: each side is a photo picked from the device. The camera
			    never starts on this step, so this panel is the whole capture screen. */}
			{uploadOnly && (phase === "front" || phase === "back") && (
				<DocumentUploadPanel
					busy={isBusy}
					onChoose={chooseFile}
					onDrop={handleDrop}
				/>
			)}

			{/* ------------------------------------------------------------------ */}
			{/* Camera / capture screen                                             */}
			{/* ------------------------------------------------------------------ */}
			{viewfinderVisible && (
				<div className={immersive ? "flex min-h-0 flex-1 flex-col" : "space-y-3"}>
					<div
						ref={viewportRef}
						className={cn(
							"relative bg-black",
							// Immersive: fill the surface the modal handed over. The
							// negative margins are deliberate — the step body's padding is
							// already gone in immersive mode, but the flex parent still
							// bounds us, and `flex-1` here is what makes the camera the
							// full remaining height rather than a 16:10 letterbox.
							immersive
								? "min-h-0 flex-1 overflow-hidden"
								: "overflow-hidden rounded-xl",
						)}
						style={immersive ? undefined : { aspectRatio: "16/10" }}
						onDragOver={allowUpload ? (e) => e.preventDefault() : undefined}
						onDrop={allowUpload ? handleDrop : undefined}>
						<video
							ref={camera.videoRef}
							autoPlay
							playsInline
							muted
							className={cn(
								"h-full w-full object-cover",
								mirrorPreview && "transform-[scaleX(-1)]",
							)}
						/>
						<canvas
							ref={detectionCanvasRef}
							className='absolute hidden'
							aria-hidden='true'
						/>

						{camera.isReady && !camera.error && !immersive && (
							<InlineOverlay
								side={phase === "back" ? "back" : "front"}
								documentLabel={shortDocumentLabel(state.selectedIdType, idTypeLabel)}
								showMrzBand={state.selectedIdType === "passport"}
								country={state.selectedCountry ?? config.country ?? null}
								guideAspect={guideAspect}
								framing={guidance.framing}
								progress={dwell}
								hint={documentHintText(guidance.hint, idTypeLabel, t)}
								busy={isCompressing}
								mirrored={mirrorPreview}
								onCapture={handleManualCapture}
								primaryColor={config.appearance?.primaryColor ?? "#5645F5"}
							/>
						)}

						{camera.isReady && !camera.error && immersive && (
							<ImmersiveOverlay
								side={phase === "back" ? "back" : "front"}
								documentLabel={shortDocumentLabel(state.selectedIdType, idTypeLabel)}
								showMrzBand={state.selectedIdType === "passport"}
								country={state.selectedCountry ?? config.country ?? null}
								guideAspect={guideAspect}
								framing={guidance.framing}
								progress={dwell}
								hint={documentHintText(guidance.hint, idTypeLabel, t)}
								busy={isCompressing}
								mirrored={mirrorPreview}
								torch={torch.torch}
								hasTorch={torch.hasTorch}
								onToggleTorch={torch.toggleTorch}
								onCapture={handleManualCapture}
								onBack={handleBack}
								onUpload={allowUpload ? openUpload : null}
								// The canvas cannot read a CSS variable, so the resolved brand
								// colour is passed in. Falls back to the SDK default.
								primaryColor={config.appearance?.primaryColor ?? "#5645F5"}
							/>
						)}

						{!camera.isReady && !camera.error && (
							<div className='absolute inset-0 flex items-center justify-center bg-black/70'>
								<div className='h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent' />
								{/* Immersive has hidden the step header, so this is the only
								    way back while the stream comes up — without it a slow
								    camera traps the user on a black screen. */}
								{immersive && (
									<button
										type='button'
										onClick={handleBack}
										aria-label='Go back'
										className='absolute left-4 flex h-11 w-11 items-center justify-center rounded-full text-white backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'
										style={{
											top: "calc(env(safe-area-inset-top) + 0.75rem)",
											backgroundColor: "rgba(0,0,0,0.45)",
										}}>
										<ArrowLeft className='h-5 w-5' />
									</button>
								)}
							</div>
						)}

						{camera.error && (
							<div className='absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center text-white'>
								{camera.permissionDenied ?
									<>
										<p className='text-sm font-medium'>
											{t("uploadDocument.camera.denied")}
										</p>
										<p className='text-xs text-white/80'>
											{t(
												showUploadFallback ?
													"uploadDocument.camera.deniedHintUpload"
												:	"uploadDocument.camera.deniedHint",
											)}
										</p>
									</>
								:	<p className='text-sm'>{camera.error}</p>}
								<div className='flex gap-2'>
									<Button
										variant='outline'
										size='sm'
										onClick={() => camera.restart("environment")}
										className='border-white/30 text-white'>
										{t("uploadDocument.tryAgain")}
									</Button>
									{showUploadFallback && (
										<Button
											variant='outline'
											size='sm'
											onClick={openUpload}
											className='border-white/30 text-white gap-1'>
											<Upload className='h-3.5 w-3.5' /> {t("common.upload")}
										</Button>
									)}
								</div>
							</div>
						)}

						{captureZoom && (
							<CaptureZoomTransition
								{...captureZoom}
								onDone={finishCaptureZoom}
							/>
						)}
					</div>

					{/* Below-camera chrome. All of it is carried by the immersive
					    overlay instead — the hint and lighting warning become the bar's
					    hint line, and the upload link becomes its gallery control. */}
					{!immersive && (
						<p className='text-center text-xs text-muted-foreground'>
							{t("uploadDocument.camera.autoCaption")}
						</p>
					)}

					{!immersive && (isDim || isBright) && (
						<div className='flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 animate-lighting-in dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400'>
							<svg
								xmlns='http://www.w3.org/2000/svg'
								width='14'
								height='14'
								viewBox='0 0 24 24'
								fill='none'
								stroke='currentColor'
								strokeWidth='2'
								strokeLinecap='round'
								strokeLinejoin='round'
								className='mt-0.5 shrink-0'>
								<path d='M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5' />
								<path d='M9 18h6M10 22h4' />
							</svg>
							<span>
								{t(
									isBright ?
										"uploadDocument.camera.tooBright"
									:	"uploadDocument.camera.tooDark",
								)}
							</span>
						</div>
					)}

					{allowUpload && !immersive && (
						<div className='flex items-center justify-center gap-1.5 text-xs text-muted-foreground'>
							<span>{t("uploadDocument.camera.havingTrouble")}</span>
							<button
								type='button'
								onClick={openUpload}
								className='inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline'>
								<Upload className='h-3 w-3' />
								{t("uploadDocument.camera.uploadInstead")}
							</button>
						</div>
					)}
				</div>
			)}

			{/* Upload-in-progress placeholder — keeps the step from collapsing to an
          empty shell while the OS file picker is open (and gives a way back if
          the user cancels it). */}
			{!uploadOnly && pauseForCrop && (phase === "front" || phase === "back") && (
				<div className='space-y-3'>
					<div
						className='flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-muted/30 text-center'
						style={{ aspectRatio: "16/10" }}>
						<Loader2 className='h-6 w-6 animate-spin text-primary' />
						<p className='text-sm text-muted-foreground'>
							{t("uploadDocument.camera.openingPicker")}
						</p>
						<Button
							variant='outline'
							size='sm'
							onClick={cancelUpload}
							className='gap-1.5'>
							<Camera className='h-3.5 w-3.5' />
							{t("uploadDocument.camera.backToCamera")}
						</Button>
					</div>
				</div>
			)}

			{isCompressing && (
				<p className='text-center text-xs text-muted-foreground'>
					{t("uploadDocument.compressing")}
				</p>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// CaptureZoomTransition
// ---------------------------------------------------------------------------

/**
 * Plays a short "the camera zoomed onto your document" animation: the frozen
 * full live frame (rendered object-cover, exactly as the user just saw it) pans
 * and scales so the detected card rectangle expands to fill the frame, then
 * hands off to the cropped still. A quick white shutter flash sells the capture.
 *
 * The transform is derived from the object-cover mapping between video pixels
 * and the rendered container, so the zoom tracks the real on-screen position of
 * the document.
 */
function CaptureZoomTransition({
	snapshot,
	videoW,
	videoH,
	bounds,
	mirror,
	onDone,
}: CaptureZoomState & { onDone: () => void }) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const doneRef = useRef(false);
	const [transform, setTransform] = useState<string>("none");

	const done = useCallback(() => {
		if (doneRef.current) return;
		doneRef.current = true;
		onDone();
	}, [onDone]);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) {
			done();
			return;
		}
		const { width: W, height: H } = el.getBoundingClientRect();
		if (W === 0 || H === 0) {
			done();
			return;
		}

		// object-cover: the frame is uniformly scaled to cover the container, then
		// center-cropped. Map the card's center (video px) to container px.
		const s = Math.max(W / videoW, H / videoH);
		const bcx = bounds.x + bounds.width / 2;
		const bcy = bounds.y + bounds.height / 2;
		let dcx = (bcx - videoW / 2) * s + W / 2;
		const dcy = (bcy - videoH / 2) * s + H / 2;
		// When the preview is mirrored, the content is flipped horizontally, so the
		// card's on-screen x is mirrored about the container center too.
		if (mirror) dcx = W - dcx;

		// Zoom so the whole card fits the container (min → "contain" the card),
		// matching the framing of the cropped still we hand off to.
		const z = Math.min(W / (bounds.width * s), H / (bounds.height * s));
		// translate so the card center lands at the container center (origin 50%).
		const tx = -z * (dcx - W / 2);
		const ty = -z * (dcy - H / 2);

		// Start at identity (the live framing), then animate to the zoom on the next
		// frame so the browser registers the transition.
		const raf = requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				setTransform(`translate(${tx}px, ${ty}px) scale(${z})`);
			});
		});

		// Safety net: if transitionend never fires, finish anyway.
		const timer = window.setTimeout(done, 900);
		return () => {
			cancelAnimationFrame(raf);
			window.clearTimeout(timer);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<div ref={containerRef} className='absolute inset-0 z-10 overflow-hidden bg-black'>
			<div
				className='h-full w-full will-change-transform'
				style={{
					transform,
					transformOrigin: "50% 50%",
					transition:
						transform === "none" ?
							undefined
						:	"transform 620ms cubic-bezier(0.22, 1, 0.36, 1)",
				}}
				onTransitionEnd={(e) => {
					if (e.propertyName === "transform") done();
				}}>
				<img
					src={snapshot}
					alt=''
					draggable={false}
					className={cn(
						"h-full w-full object-cover",
						mirror && "transform-[scaleX(-1)]",
					)}
				/>
			</div>
			<div className='pointer-events-none absolute inset-0 bg-white animate-capture-flash' />
		</div>
	);
}

