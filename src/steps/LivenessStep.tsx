'use client';

import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, RotateCcw } from '../components/icons';
import { StepHeader } from '../components/StepHeader';
import { useSetCaptureLight } from '../components/capture-light';
import { useReportLivenessCamera } from '../components/liveness-camera';
import { flashOverlayColor } from '../liveness/flash-overlay';
import { Button } from '../components/ui/button';
import { CameraPermissionPrimer } from '../components/CameraPermissionPrimer';
import { ReadyPrimer } from '../components/ReadyPrimer';
import { READY_LIVENESS, READY_LIVENESS_PASSIVE } from '../components/ready-primer-content';
import { useVerificationContext } from '../context/VerificationContext';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { multiIdEvidenceStep } from '../lib/multi-id';
import { stepAfterCapture } from '../lib/post-capture';
import { stepBeforeLiveness } from '../lib/contact-steps';
import { useCamera } from '../hooks/useCamera';
import { useCameraPrimer } from '../hooks/useCameraPrimer';
import { useImageCapture } from '../hooks/useImageCapture';
import { useImageCompress } from '../hooks/useImageCompress';
import { useLiveness } from '../hooks/useLiveness';
import { useLightLevel } from '../hooks/useLightLevel';
import { primeSpeech } from '../liveness/speech';
import { recordLivenessSignals, recordRecorderFailure } from '../lib/integrity-signals';
import { markRecordingStart } from '../liveness/flash-timeline';
import { withRetry } from '../lib/retry';
import { mapToVerificationError, safeReportError } from '../lib/errors';
import { VerificationError } from '../types/verification';
import {
  LIVENESS_VIDEO_BITRATE,
  createVideoRecorder,
  pickVideoMimeType,
  logCaptureSize,
} from '../lib/capture-settings';
import { challengeInstruction } from '../liveness/types';
import { useText, type TextFn } from '../i18n';
import { usePortalHost } from '../lib/sdk-frame-context';
import { LivenessHandover, useSelfieAutoAdvance } from './liveness-handover';
import { showsSelfieReview } from '../lib/biometric-options';
import { isSelfieBlurry, measureSelfieSharpness } from '../lib/selfie-sharpness';
import { verifiedIdsFromState } from '../lib/supporting-documents';
import { useSetImmersiveCapture } from '../components/immersive-capture';
import {
  faceWindowFor,
  livenessCutout,
  surroundPath,
  windowDrop,
  type FaceWindow,
  type Size,
} from '../lib/liveness-cutout';
import { LiveView } from './liveness/LiveView';
import { ReviewView } from './liveness/ReviewView';
import { useBlurBudget } from './liveness/use-blur-budget';

/** How long the full-screen camera is held after the photo: the shutter, then
 *  the scan down the window (globals.css `liveness-scan`), then a breath. */
const SCAN_HOLD_MS = 800;

// ---------------------------------------------------------------------------
// LivenessStep — active liveness check with gesture challenges
// ---------------------------------------------------------------------------

export function LivenessStep() {
  const { state: verificationState, dispatch } = useVerificationContext();
  const config = useVerificationConfig();
  const t = useText();
  const portalHost = usePortalHost();
  const [preview, setPreview] = useState<string | null>(verificationState.selfieImage);
  // The fresh capture measured soft. A notice on the review, never a gate:
  // Continue stays available whatever it says (see lib/selfie-sharpness).
  const [selfieSoft, setSelfieSoft] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [retryInfo, setRetryInfo] = useState<{ attempt: number; total: number } | null>(null);

  // Show an "Allow camera access" primer before the OS prompt (Stripe-style),
  // unless the camera is already granted. The camera only starts — and thus the
  // OS prompt only fires — once the user taps "Grant access".
  const primerStatus = useCameraPrimer();
  const [primed, setPrimed] = useState(false);
  // A selfie that survived a session restore: the uploaded mediaId is the
  // durable record (session progress deliberately drops the preview bytes), so
  // its presence means "already captured" exactly as it does for documents —
  // the step opens on review, never on a fresh gesture run.
  const restoredSelfie = !preview && Boolean(verificationState.mediaIds.selfie);
  // The step was OPENED with its selfie already taken: the person came back
  // to it, or resumed a session past it. It then says so and offers Continue;
  // it never hands forward by itself and never runs the check again.
  const arrivedDone = useRef(Boolean(preview) || restoredSelfie).current;
  // "Here's what happens next" gate — the selfie camera never opens
  // unannounced. A returning user with a captured selfie skips it.
  const [ready, setReady] = useState(false);
  const showReadyPrimer = !ready && !preview && !restoredSelfie;
  const needsPrimer = ready && primerStatus === 'needed' && !primed && !preview;

  // Where the preview circle sits in the VIEWPORT, so the flash overlay can
  // punch a hole for it. Only tracked while a flash is on screen.
  const previewRef = useRef<HTMLDivElement>(null);
  const [flashHole, setFlashHole] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    viewport: Size;
  } | null>(null);

  // How much of the camera frame the full-screen window shows, for the hook to
  // judge the face against (see steps/liveness). Null until it is laid out.
  const faceWindowRef = useRef<FaceWindow | null>(null);
  const frameSizeRef = useRef<Size | null>(null);

  const camera = useCamera({
    facingMode: 'user',
    enabled: ready && !preview && !restoredSelfie && (primerStatus === 'granted' || primed),
  });
  const { capture } = useImageCapture({ videoRef: camera.videoRef, mirror: true });
  const { compress, isCompressing } = useImageCompress();

  // Video recording refs
  const livenessRecorderRef = useRef<MediaRecorder | null>(null);
  const livenessChunksRef = useRef<Blob[]>([]);
  const livenessMimeRef = useRef('video/webm');

  const livenessActive = !preview && camera.isReady;
  const { level: lightLevel } = useLightLevel(camera.videoRef, livenessActive);
  const isDim = lightLevel === 'dark';
  const isBright = lightLevel === 'bright';

  // How Presence Intelligence verifies: gesture challenges (default), the
  // screen-reflection flash sequence, or both. Workflow-configured.
  const livenessMode = config.livenessMode ?? 'gestures';

  const liveness = useLiveness({
    videoRef: camera.videoRef,
    cameraReady: camera.isReady && !preview,
    captureFrame: capture,
    compressImage: compress,
    lightLevel,
    config: { mode: livenessMode, flashSequenceLength: config.flashSequenceLength },
    faceWindowRef,
  });

  const syncFaceWindow = useCallback(() => {
    const frame = frameSizeRef.current;
    const video = camera.videoRef.current;
    faceWindowRef.current =
      frame && frame.width > 0 && video && video.videoWidth > 0 && video.videoHeight > 0
        ? faceWindowFor({
            frame,
            window: livenessCutout(frame),
            frameAspect: video.videoWidth / video.videoHeight,
            drop: windowDrop(frame, livenessCutout(frame)),
          })
        : null;
  }, [camera.videoRef]);
  const onFrameSize = useCallback(
    (size: Size) => {
      frameSizeRef.current = size;
      syncFaceWindow();
    },
    [syncFaceWindow],
  );
  // The video's own shape arrives with the stream, after the first layout.
  useEffect(() => {
    syncFaceWindow();
  }, [camera.isReady, syncFaceWindow]);

  // The room has read as dark since the camera opened. Latched: more of the
  // screen is then given to the light background, which brightens the face,
  // and a tint that followed the reading would drop again and flicker.
  const [dimRoom, setDimRoom] = useState(false);
  useEffect(() => {
    if (isDim) setDimRoom(true);
  }, [isDim]);

  // Flash mode: ask the modal for a bright backdrop ONLY while the sequence is
  // emitting. The rest of the step needs no extra light (the sequence supplies
  // its own, and measures the reflection of it), and a constant white field
  // arrives as a full-screen flash the moment the step opens. Other modes keep
  // the default by leaving the override null.
  const setCaptureLight = useSetCaptureLight();
  useEffect(() => {
    if (livenessMode !== 'flash') return undefined;
    setCaptureLight(liveness.flashing);
    return () => setCaptureLight(null);
  }, [livenessMode, liveness.flashing, setCaptureLight]);

  // Bright screen: tell the modal once the CAMERA screen is showing (not the
  // primers before it), so it holds the flow light from here to the step's end.
  useReportLivenessCamera(
    !preview && !restoredSelfie && !camera.permissionDenied && !showReadyPrimer && !needsPrimer,
  );

  // What the flash overlay paints: the colour, or BLACK between colours while
  // the sequence runs, so the check's baseline stays dark even on the light
  // palette (liveness/flash-overlay.ts). No overlay outside the sequence.
  const overlayColor = flashOverlayColor(liveness.flashing, liveness.flashColor);

  // Measure the preview while a flash is on screen. The overlay lives at body
  // level, so these are plain viewport coordinates. Re-measured on scroll and
  // resize; the circle does not move otherwise, and the colour changes every
  // ~1.1s without shifting anything.
  const measureHole = useCallback(() => {
    const el = previewRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setFlashHole({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
  }, []);

  const overlayShown = overlayColor !== null;
  useLayoutEffect(() => {
    if (!overlayShown) return undefined;
    measureHole();
    window.addEventListener('resize', measureHole);
    window.addEventListener('scroll', measureHole, true);
    return () => {
      window.removeEventListener('resize', measureHole);
      window.removeEventListener('scroll', measureHole, true);
    };
  }, [overlayShown, measureHole]);

  // Record the mode once for the submit's integrity metadata (flash results
  // are recorded by the hook when the sequence runs).
  useEffect(() => {
    recordLivenessSignals({ mode: livenessMode });
  }, [livenessMode]);

  // Start/stop recorder with the camera stream
  React.useEffect(() => {
    if (!camera.stream || preview) return;
    // Guard against a stale stream whose tracks have already ended — starting a
    // MediaRecorder on it throws. The effect re-runs once a live stream arrives.
    if (!camera.stream.getVideoTracks().some((t) => t.readyState === 'live')) return;

    livenessChunksRef.current = [];
    const created = createVideoRecorder(camera.stream, LIVENESS_VIDEO_BITRATE);
    if (!created) {
      // Report WHY there will be no recording (lib/integrity-signals.ts).
      recordRecorderFailure(pickVideoMimeType() ? 'recorder_start_failed' : 'recorder_unsupported');
      return;
    }
    recordRecorderFailure(null);
    const { recorder, mimeType } = created;
    livenessMimeRef.current = mimeType;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) livenessChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      if (livenessChunksRef.current.length === 0) recordRecorderFailure('recording_empty');
      if (livenessChunksRef.current.length > 0) {
        const blob = new Blob(livenessChunksRef.current, { type: livenessMimeRef.current });
        logCaptureSize('liveness video', blob);
        dispatch({
          type: 'SET_LIVENESS_VIDEO',
          payload: blob,
        });
        livenessChunksRef.current = [];
      }
    };
    try {
      recorder.start(200);
    } catch {
      // Stream became unusable between the live-track check and start() — skip
      // recording rather than crashing the liveness step, and say so.
      recordRecorderFailure('recorder_start_failed');
      return;
    }
    // The flash reports its colours' times from this moment (flash-timeline.ts).
    markRecordingStart(performance.now());
    livenessRecorderRef.current = recorder;

    return () => {
      // If the recorder was stopped manually (e.g. on capture complete), let
      // the original onstop handler dispatch the recorded blob — don't touch it.
      if (recorder.state === 'inactive') {
        if (livenessRecorderRef.current === recorder) livenessRecorderRef.current = null;
        return;
      }
      // Still recording: user navigated away or camera changed. Discard.
      markRecordingStart(null);
      livenessChunksRef.current = [];
      recorder.onstop = null;
      try { recorder.stop(); } catch { /* already stopped */ }
      if (livenessRecorderRef.current === recorder) livenessRecorderRef.current = null;
    };
  }, [camera.stream, preview, dispatch]);

  // Handle liveness complete — stop recorder and wait for the final chunk before
  // transitioning to preview, so the cleanup race doesn't drop the video.
  React.useEffect(() => {
    if (liveness.state.phase !== 'complete') return;
    const selfie = liveness.state.selfieBase64;

    let cancelled = false;

    (async () => {
      const r = livenessRecorderRef.current;
      livenessRecorderRef.current = null;

      if (r && r.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          // Wrap the existing onstop so the original dispatch still runs
          const originalOnStop = r.onstop;
          r.onstop = (ev) => {
            try {
              if (typeof originalOnStop === 'function') originalOnStop.call(r, ev);
            } finally {
              resolve();
            }
          };
          try {
            r.stop();
          } catch {
            resolve();
          }
        });
      }

      // The frame is held for the shutter and the scan that follows it; the
      // review would otherwise replace them unseen.
      await new Promise<void>((resolve) => setTimeout(resolve, SCAN_HOLD_MS));

      if (cancelled) return;

      setPreview(selfie);
      dispatch({ type: 'SET_SELFIE_IMAGE', payload: selfie });
      uploadSelfie(selfie);
      // Measured AFTER the preview is up, so the review never waits on it. A
      // restored selfie is not measured: its bytes are gone by design.
      void measureSelfieSharpness(selfie).then((score) => {
        if (!cancelled) setSelfieSoft(isSelfieBlurry(score));
      });
    })();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveness.state.phase]);

  async function uploadSelfie(selfieBase64: string) {
    setIsUploading(true);
    setUploadError(null);
    setRetryInfo(null);
    // The reducer-side progress report: the biometric scopes hand over before
    // this lands, and the submitted step waits on THIS (lib/selfie-upload-wait).
    dispatch({ type: 'SET_SELFIE_UPLOAD', payload: { status: 'uploading', message: null } });

    const api = config.api;

    try {
      const [header, data] = selfieBase64.split(',');
      const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });

      // Retried on transient failures (network / timeout / 5xx).
      const mediaId = await withRetry(() => api.upload(blob, 'selfie'), {
        onRetry: (attempt, total) => setRetryInfo({ attempt, total }),
      });
      dispatch({ type: 'SET_MEDIA_ID', payload: { mediaType: 'selfie', mediaId } });
      setRetryInfo(null);
      setIsUploading(false);
      dispatch({ type: 'SET_SELFIE_UPLOAD', payload: { status: 'done', message: null } });
    } catch (err) {
      setRetryInfo(null);
      setIsUploading(false);
      const verificationError = mapToVerificationError(err, 'upload');
      setUploadError(verificationError.message);
      dispatch({ type: 'SET_SELFIE_UPLOAD', payload: { status: 'failed', message: verificationError.message } });
      safeReportError(config.onError, verificationError);
    }
  }

  // A preview that came back from the reducer with no uploaded mediaId is an
  // interrupted upload (it failed, or the user left mid-flight): resume it once
  // on mount. Idempotent — with a mediaId there is nothing to do.
  useEffect(() => {
    if (preview && !verificationState.mediaIds.selfie && !isUploading) {
      void uploadSelfie(preview);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Report a denied camera permission to onError once. Liveness can't proceed
  // without a camera, so the dedicated permission screen (below) is shown too.
  const permissionReportedRef = useRef(false);
  useEffect(() => {
    if (camera.permissionDenied && !permissionReportedRef.current) {
      permissionReportedRef.current = true;
      safeReportError(
        config.onError,
        new VerificationError(
          'camera_permission_denied',
          'Camera access is required for the liveness check. Please allow camera access and try again.',
        ),
      );
    }
    if (!camera.permissionDenied) permissionReportedRef.current = false;
  }, [camera.permissionDenied, config]);

  // Track the last active gesture so the avatar stays visible during transitions
  const phase = liveness.state.phase;
  const activeChallenge = phase === 'challenge' ? liveness.state.challenge : null;

  const lastGestureRef = useRef(activeChallenge?.type ?? null);
  useEffect(() => {
    if (activeChallenge?.type) {
      lastGestureRef.current = activeChallenge.type;
    }
  }, [activeChallenge?.type]);

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const handleRetake = () => {
    primeSpeech();
    setPreview(null);
    setUploadError(null);
    setSelfieSoft(false);
    setReady(true);
    // Clears the preview AND mediaIds.selfie, so the restored-selfie review
    // (no bytes, mediaId only) falls back into a fresh capture too.
    dispatch({ type: 'CLEAR_SELFIE_IMAGE' });
    dispatch({ type: 'CLEAR_LIVENESS_VIDEO' });
    // Discard current recording; a new one starts when camera restarts
    livenessChunksRef.current = [];
    const r = livenessRecorderRef.current;
    if (r && r.state !== 'inactive') { r.onstop = null; r.stop(); }
    livenessRecorderRef.current = null;
    liveness.retry();
  };

  const handleContinue = () => {
    camera.stop();
    // Proof of Address / questionnaire (when configured) sit between capture
    // and the final submission; otherwise submit straight away.
    const next = stepAfterCapture(config, verifiedIdsFromState(verificationState, config));
    if (next === 'submitted') {
      dispatch({ type: 'SUBMIT_VERIFICATION' });
    } else {
      dispatch({ type: 'SET_STEP', payload: next });
    }
  };

  // The biometric scopes skip the review by default: hand over the moment a
  // selfie exists, WITHOUT waiting for the upload (see liveness-handover.tsx).
  // The upload reports to the reducer and the submitted step waits on it, so
  // the person sees one loading screen rather than one per step. A restored
  // selfie (media id, no bytes) is ready at once; an upload that already
  // failed keeps the review, whose Retry Upload is the recovery.
  const selfieReview = showsSelfieReview(config);

  const handleBack = () => {
    camera.stop();
    const hasDocCapture = verificationState.selectedIdType
      ? config.getIdTypeDefinition(verificationState.selectedIdType)?.requiresDocumentCapture ?? false
      : false;
    // Multi-ID: every slot is committed by now, so the evidence steps hold
    // nothing — step back INTO the last verification instead (popping it and
    // restoring its capture), or the applicant lands on an empty screen.
    const lastSlot = verificationState.multiIdSlots[verificationState.multiIdSlots.length - 1];
    if (lastSlot) {
      dispatch({
        type: 'UNCOMMIT_MULTI_ID_SLOT',
        payload: { step: multiIdEvidenceStep(config.getIdTypeDefinition(lastSlot.idType)) },
      });
      return;
    }
    // Scope-aware: a face-scoped flow has no evidence step to go back to.
    dispatch({
      type: 'SET_STEP',
      payload: stepBeforeLiveness(config, hasDocCapture ? 'document-capture' : 'id-input'),
    });
  };

  // Hands forward once, the moment the selfie is taken. A step opened on a
  // selfie that already exists stays put (see `arrivedDone`).
  useSelfieAutoAdvance({
    enabled: !selfieReview && !arrivedDone,
    ready: (!!preview || restoredSelfie) && !uploadError,
    onAdvance: handleContinue,
  });

  // A tap in the hand for each step that lands and for the photo, where the
  // browser offers one: the screen is being looked at, not read.
  useEffect(() => {
    if (phase !== 'challenge_passed' && phase !== 'complete') return;
    try {
      navigator.vibrate?.(phase === 'complete' ? 20 : 10);
    } catch {
      /* not offered, or refused without a gesture: nothing to do */
    }
  }, [phase]);

  // ── Taking the whole surface ───────────────────────────────────────────────
  // On every device: a phone's screen, and the whole modal on a desktop. The
  // live camera has it, and so does the review that follows while there is a
  // photo to show. The primers, the permission screens, the hand-over and a
  // restored selfie with no photo stay ordinary modal screens.
  const cameraScreen =
    !preview && !restoredSelfie && !camera.permissionDenied && !showReadyPrimer && !needsPrimer;
  const handingOver = (!!preview || restoredSelfie) && !selfieReview && !uploadError && !arrivedDone;
  const immersive = cameraScreen || (!!preview && !handingOver);
  const setImmersiveCapture = useSetImmersiveCapture();
  // A LAYOUT effect, so the modal has dropped its header and padding before
  // the browser paints: the full-screen layout never shows inside the padded
  // body. The view itself is not held back for it, deliberately. The camera
  // hook hands the stream to the <video> element the moment the stream
  // arrives, and marks the camera ready only if the element was there to take
  // it, so a view mounted a render late could miss its own stream.
  useLayoutEffect(() => {
    setImmersiveCapture(immersive);
    return () => setImmersiveCapture(false);
  }, [immersive, setImmersiveCapture]);
  useEffect(() => {
    if (!(immersive && cameraScreen)) faceWindowRef.current = null;
  }, [immersive, cameraScreen]);
  const blurs = useBlurBudget(immersive && cameraScreen);

  // ---------------------------------------------------------------------------
  // Preview mode (after selfie is captured)
  // ---------------------------------------------------------------------------

  if (preview || restoredSelfie) {
    // Review hidden: the hook above advances on this render; the view is the
    // submitted step's own loading screen, so the hand-over is invisible. A
    // FAILED upload still gets the review, for its retry.
    if (!selfieReview && !uploadError && !arrivedDone) {
      return <LivenessHandover />;
    }
    // Finished on an earlier visit and no review to show: no Retake, so the
    // check runs once per session.
    const done = arrivedDone && !selfieReview;
    if (immersive && preview) {
      return (
        <ReviewView
          preview={preview}
          title={
            isUploading
              ? t('presence.review.saving')
              : done
                ? t('presence.review.doneTitle')
                : t('presence.review.captured')
          }
          note={done ? t('presence.review.doneDescription') : selfieSoft ? t('presence.review.blurry') : null}
          noteIsWarning={!done && selfieSoft}
          retrying={
            retryInfo && isUploading
              ? t('presence.review.retrying', { attempt: retryInfo.attempt, total: retryInfo.total })
              : null
          }
          uploadError={uploadError}
          busy={isCompressing || isUploading}
          onRetake={done ? null : handleRetake}
          retakeLabel={t('common.retake')}
          onContinue={uploadError ? () => uploadSelfie(preview) : handleContinue}
          continueLabel={uploadError ? t('presence.review.retryUpload') : t('common.continue')}
          blurs={blurs}
          onBack={handleBack}
        />
      );
    }
    return (
      <div className="space-y-5 animate-slide-up">
        <StepHeader
          title={done ? t('presence.review.doneTitle') : t('presence.review.title')}
          description={
            done
              ? t('presence.review.doneDescription')
              : preview
                ? t('presence.review.description')
                : t('presence.review.restoredDescription')
          }
          onBack={handleBack}
        />

        <div className="relative mx-auto w-56 sm:w-64 overflow-hidden rounded-full border-4 border-primary/20">
          {preview ? (
            <img src={preview} alt="Selfie preview" className="aspect-square w-full object-cover" />
          ) : (
            // Restored session: the bytes are gone by design (only the mediaId
            // travels), so show a completed state rather than a broken image.
            <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 bg-muted/40">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
                <Check className="h-7 w-7 text-primary" />
              </span>
              <span className="px-6 text-center text-xs text-muted-foreground">{t('presence.review.restoredBadge')}</span>
            </div>
          )}
        </div>

        {retryInfo && isUploading && (
          <p className="text-center text-xs text-amber-700 dark:text-amber-400">
            {t('presence.review.retrying', { attempt: retryInfo.attempt, total: retryInfo.total })}
          </p>
        )}

        {uploadError && (
          <p className="text-center text-sm text-destructive">{uploadError}</p>
        )}

        {/* Blurry selfie: the same amber notice the lighting warning uses.
            Advice, not a block. Retake and Continue both stay enabled. */}
        {selfieSoft && preview && !done && (
          <div className="flex w-full items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 animate-lighting-in dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden>
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            <span>{t('presence.review.blurry')}</span>
          </div>
        )}

        <div className="flex gap-3">
          {!done && (
            <Button variant="outline" className="flex-1 gap-2" onClick={handleRetake} disabled={isCompressing || isUploading}>
              <RotateCcw className="h-4 w-4" />
              {t('common.retake')}
            </Button>
          )}
          <Button
            className="flex-1 gap-2"
            onClick={uploadError && preview ? () => uploadSelfie(preview) : handleContinue}
            disabled={isCompressing || isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {uploadError ? t('presence.review.retryUpload') : t('common.continue')}
          </Button>
        </div>

        {isCompressing && <p className="text-center text-xs text-muted-foreground">{t('presence.review.compressing')}</p>}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Camera permission denied
  // ---------------------------------------------------------------------------

  if (camera.permissionDenied) {
    return (
      <div className="space-y-5 animate-slide-up">
        <StepHeader title={t('presence.title')} description={t('presence.permissionDenied.description')} onBack={handleBack} />
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center space-y-2">
          <p className="text-sm font-medium text-destructive">{t('presence.permissionDenied.heading')}</p>
          <p className="text-xs text-muted-foreground">
            {t('presence.permissionDenied.body')}
          </p>
        </div>
        <Button className="w-full" onClick={() => camera.restart('user')}>
          {t('presence.tryAgainButton')}
        </Button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Camera permission primer (before the OS prompt)
  // ---------------------------------------------------------------------------

  if (showReadyPrimer) {
    return (
      <div className="space-y-5 animate-slide-up">
        <StepHeader
          title={t('presence.title')}
          description={t('presence.intro.description')}
          onBack={handleBack}
        />
        <ReadyPrimer
          {...(livenessMode === 'passive' ? READY_LIVENESS_PASSIVE : READY_LIVENESS)}
          onReady={() => {
            // Speech needs a user gesture to start — prime it on this tap, the
            // same way the permission primer does.
            primeSpeech();
            setReady(true);
          }}
        />
      </div>
    );
  }

  if (needsPrimer) {
    return (
      <div className="space-y-5 animate-slide-up">
        <StepHeader
          title={t('presence.title')}
          description={t('presence.intro.description')}
          onBack={handleBack}
        />
        <CameraPermissionPrimer
          bodyText={t('presence.permission.body')}
          onGrant={() => {
            // Speech needs a user gesture to start — prime it here.
            primeSpeech();
            setPrimed(true);
          }}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main liveness UI
  // ---------------------------------------------------------------------------

  const isFlashChallenge = activeChallenge?.type === 'flash';
  // Neither the flash nor the passive hold has a gesture to demonstrate.
  const showAvatar =
    (phase === 'challenge' || phase === 'challenge_passed') && !isFlashChallenge && activeChallenge?.type !== 'hold';
  const avatarGesture = activeChallenge?.type ?? lastGestureRef.current;

  // Show the gray loading overlay only while the camera stream hasn't started yet.
  // Face mesh loading is separate — once the camera is live we show the feed and
  // display a non-blocking text indicator while the model finishes downloading.
  const isLoading = !camera.isReady;
  const isFaceMeshLoading = phase === 'loading' && camera.isReady;

  const challengeWarning = phase === 'challenge' ? liveness.state.warning : undefined;
  const hasWrongGesture = challengeWarning === 'wrong_gesture';
  const hasMultipleFaces = challengeWarning === 'multiple_faces';
  const hasPositionWarning = challengeWarning && !hasWrongGesture;

  // 'multiple_faces' is a sentinel — render the friendly guidance, not the code.
  const warningText = hasMultipleFaces ? t('presence.position.multipleFaces') : challengeWarning;

  const instructionText = isFaceMeshLoading
    ? t('presence.camera.preparingDetection')
    : hasPositionWarning
      ? warningText
      : getInstructionText(liveness.state, t);

  // Screen-reflection flash: the display has to emit real light for the face
  // to reflect it, so this covers the WHOLE viewport.
  //
  // PORTALED to document.body, which is the whole trick. `fixed inset-0` alone
  // does not span the viewport here: on desktop the dialog carries a
  // translate, and a transformed ancestor becomes the containing block for
  // fixed descendants, so the overlay was confined to the modal and emitted
  // far less light than the check assumes. Out here getBoundingClientRect() is
  // directly usable, so the face stays visible through a hole cut at the
  // window's own position. Under SdkFrame the same reasoning routes it to the
  // shadow portal frame instead: also untransformed, and styled by the SDK's
  // own sheet.
  //
  // The hole is the window's own shape (tall, round-ended); a box that is not
  // taller than wide falls back to a circle.
  const tallHole = flashHole != null && flashHole.height > flashHole.width * 1.15;
  const holeRadius = flashHole ? flashHole.width / 2 : 0;
  const holeMask = flashHole
    ? `radial-gradient(circle ${holeRadius}px at ${flashHole.left + holeRadius}px ${flashHole.top + holeRadius}px, transparent 0 ${holeRadius}px, #000 ${holeRadius + 1}px)`
    : undefined;
  const flashOverlay =
    overlayColor && typeof document !== 'undefined'
      ? createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-[100]"
            style={{
              backgroundColor: overlayColor,
              opacity: 0.96,
              transition: 'background-color 120ms linear',
              // Punch out the preview so the user still sees their face. The
              // hole is a hard edge, not a gradient: a soft falloff would tint
              // the face itself and skew the reflection the detector measures.
              ...(flashHole && tallHole
                ? {
                    clipPath: `path(evenodd, "${surroundPath(flashHole.viewport, flashHole.left, flashHole.top, flashHole)}")`,
                  }
                : flashHole
                  ? { WebkitMaskImage: holeMask, maskImage: holeMask }
                  : null),
            }}
          />,
          portalHost ?? document.body,
        )
      : null;

  const passed = liveness.challenges.filter((entry) => entry.progress === 'passed').length;
  const total = liveness.challenges.length;
  const settingUp = isLoading || isFaceMeshLoading;
  return (
    <>
      {flashOverlay}
      <LiveView
        videoRef={camera.videoRef}
        windowRef={previewRef}
        progressRef={liveness.livenessProgressRef}
        phase={phase}
        loading={settingUp}
        text={
          isLoading
            ? t('presence.camera.settingUp')
            : hasWrongGesture
              ? t('presence.challenge.wrongGesture')
              : (instructionText ?? '')
        }
        tone={
          settingUp
            ? 'prompt'
            : hasWrongGesture || hasPositionWarning
              ? 'warning'
              : phase === 'challenge_passed' || phase === 'complete'
                ? 'done'
                : 'prompt'
        }
        warning={!settingUp && Boolean(hasWrongGesture || hasPositionWarning)}
        gesture={showAvatar ? avatarGesture : null}
        assetsBasePath={config.assetsBasePath}
        lightingNote={
          isBright ? t('presence.lighting.brightNotice') : isDim ? t('presence.lighting.darkNotice') : null
        }
        step={Math.min(passed + (phase === 'challenge' ? 1 : 0), total)}
        total={total}
        failure={
          phase === 'failed'
            ? {
                message: t(FAILURE_TEXT_KEYS[liveness.state.reason] ?? 'presence.failed.generic'),
                retryLabel: t('presence.tryAgainButton'),
                onRetry: liveness.retry,
              }
            : null
        }
        dimRoom={dimRoom}
        blurs={blurs}
        onBack={handleBack}
        onSize={onFrameSize}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Instruction text helper
// ---------------------------------------------------------------------------

/** The catalogue key of each failure's message; anything else reads the generic one. */
const FAILURE_TEXT_KEYS: Partial<Record<string, string>> = {
  timeout: 'presence.failed.timeout',
  face_lost: 'presence.failed.faceLost',
  load_error: 'presence.failed.loadError',
  flash_failed: 'presence.failed.flash',
  face_swap: 'presence.failed.faceSwap',
};

function getInstructionText(state: ReturnType<typeof useLiveness>['state'], t: TextFn): string {
  switch (state.phase) {
    case 'loading':
      return t('presence.camera.loading');
    case 'positioning':
      return state.guidance;
    case 'challenge':
      return challengeInstruction(state.challenge.type, t);
    case 'challenge_passed':
      return t('presence.challenge.passed');
    case 'capturing':
      return state.guidance ?? t('presence.capture.holdStill');
    case 'complete':
      // No line at all. The ring closing green on the same frame as the shutter
      // IS the completion signal, and the review follows within the beat —
      // narrating the upload over it said nothing the user needed.
      return '';
    case 'failed':
      return '';
    default:
      return '';
  }
}
