import { ExtensionMessage } from '../../lib/messages';
import { computeAudioBlobFingerprint } from '../../lib/fingerprint';

console.log('[YTMD Offscreen] Audio capture pipeline initialized');

let activeStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let audioContext: AudioContext | null = null;
let recordedChunks: Blob[] = [];
let progressIntervalId: number | null = null;
let autoStopTimeoutId: number | null = null;

let currentCaptureId: string = '';
let currentVideoId: string = '';
let currentStartPlaybackSec: number = 0;
let captureStartEpochMs: number = 0;
let configuredDurationSec: number = 15;

function cleanupAudio() {
  if (progressIntervalId) {
    clearInterval(progressIntervalId);
    progressIntervalId = null;
  }
  if (autoStopTimeoutId) {
    clearTimeout(autoStopTimeoutId);
    autoStopTimeoutId = null;
  }

  if (activeStream) {
    activeStream.getTracks().forEach((track) => {
      try { track.stop(); } catch {}
    });
    activeStream = null;
  }

  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => {});
    audioContext = null;
  }

  mediaRecorder = null;
  recordedChunks = [];
  console.log('[YTMD] Capture cleaned up');
}

async function startAudioCapture(
  captureId: string,
  streamId: string,
  maxDurationSeconds: number,
  videoId: string,
  startPlaybackSeconds: number
) {
  // Clean up any previous capture state
  cleanupAudio();

  currentCaptureId = captureId;
  currentVideoId = videoId;
  currentStartPlaybackSec = startPlaybackSeconds;
  configuredDurationSec = maxDurationSeconds;
  captureStartEpochMs = Date.now();

  try {
    console.log('[YTMD] Capture started', { captureId, streamId, maxDurationSeconds, videoId });

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      } as any,
      video: false
    });

    activeStream = stream;

    // Route tab audio to AudioContext destination so YouTube playback stays audible
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(audioContext.destination);

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const elapsedTotalMs = Date.now() - captureStartEpochMs;
      const actualDurationSec = Math.max(1, Math.round(elapsedTotalMs / 1000));
      const sampleBlob = new Blob(recordedChunks, { type: mimeType });

      console.log('[YTMD] Capture complete: duration=' + actualDurationSec + 's, size=' + sampleBlob.size + 'B');

      // Compute Chromaprint fingerprint here in the offscreen document
      // (WASM runs cleanly in offscreen context)
      try {
        console.log('[YTMD] Generating fingerprint...');
        const fpResult = await computeAudioBlobFingerprint(sampleBlob);
        const fingerprint = fpResult.compressedFingerprint;
        console.log('[YTMD] Fingerprint generated: length=' + fingerprint.length);

        // Send only the compact serializable result — no Blob
        chrome.runtime.sendMessage({
          type: 'CAPTURE_COMPLETE',
          payload: {
            captureId: currentCaptureId,
            fingerprint,
            durationSeconds: fpResult.durationSeconds,
            sampleStartSeconds: currentStartPlaybackSec,
            sampleEndSeconds: currentStartPlaybackSec + actualDurationSec,
            blobSizeBytes: sampleBlob.size
          }
        } as ExtensionMessage).catch(() => {});
      } catch (fpErr: any) {
        console.error('[YTMD] Fingerprint failed:', fpErr?.message || fpErr);
        chrome.runtime.sendMessage({
          type: 'CAPTURE_ERROR',
          payload: {
            captureId: currentCaptureId,
            error: 'Fingerprint generation failed: ' + (fpErr?.message || String(fpErr))
          }
        } as ExtensionMessage).catch(() => {});
      }

      cleanupAudio();
    };

    mediaRecorder.start(500); // chunk every 500ms

    // Progress emitter every 1 second
    let elapsedSeconds = 0;
    progressIntervalId = window.setInterval(() => {
      elapsedSeconds++;
      chrome.runtime.sendMessage({
        type: 'CAPTURE_PROGRESS',
        payload: {
          captureId: currentCaptureId,
          elapsedSeconds: Math.min(elapsedSeconds, configuredDurationSec),
          maxDurationSeconds: configuredDurationSec
        }
      } as ExtensionMessage).catch(() => {});
    }, 1000);

    // Bounded maximum duration auto-stop
    autoStopTimeoutId = window.setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    }, maxDurationSeconds * 1000);

  } catch (err: any) {
    console.error('[YTMD] Capture initialization failed:', err);
    chrome.runtime.sendMessage({
      type: 'CAPTURE_ERROR',
      payload: {
        captureId: currentCaptureId,
        error: err.message || 'Failed to capture tab audio'
      }
    } as ExtensionMessage).catch(() => {});
    cleanupAudio();
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === 'START_CAPTURE') {
    startAudioCapture(
      message.payload.captureId,
      message.payload.streamId,
      message.payload.maxDurationSeconds || 15,
      message.payload.videoId,
      message.payload.startPlaybackSeconds
    );
  } else if (message.type === 'STOP_CAPTURE') {
    console.log('[YTMD Offscreen] Stop capture requested');
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    } else {
      cleanupAudio();
    }
  } else if (message.type === 'CANCEL_CAPTURE') {
    console.log('[YTMD Offscreen] Cancel capture requested');
    cleanupAudio();
  }
});
