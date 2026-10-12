import { ExtensionMessage } from '../../lib/messages';
import { CapturedSampleMeta } from '../../lib/types';
import { computeAudioBlobFingerprint } from '../../lib/fingerprint';

console.log('[YTMD Offscreen] Audio capture pipeline initialized');

let activeStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let audioContext: AudioContext | null = null;
let recordedChunks: Blob[] = [];
let progressIntervalId: number | null = null;
let autoStopTimeoutId: number | null = null;

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
      try {
        track.stop();
      } catch {}
    });
    activeStream = null;
  }

  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => {});
    audioContext = null;
  }

  mediaRecorder = null;
  recordedChunks = [];
}

async function startAudioCapture(
  streamId: string,
  maxDurationSeconds: number,
  videoId: string,
  startPlaybackSeconds: number
) {
  // Always clean up any previous capture state
  cleanupAudio();

  currentVideoId = videoId;
  currentStartPlaybackSec = startPlaybackSeconds;
  configuredDurationSec = maxDurationSeconds;
  captureStartEpochMs = Date.now();

  try {
    console.log('[YTMD Offscreen] Acquiring tab media stream...', { streamId, maxDurationSeconds, videoId });

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

    // Passthrough audio to AudioContext destination so YouTube playback is NOT muted
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(audioContext.destination);

    // Pick best supported MIME type
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

      console.log('[YTMD Offscreen] Sample captured, extracting fingerprint...', {
        sizeBytes: sampleBlob.size,
        durationSeconds: actualDurationSec,
        mimeType
      });

      let fingerprint: string | undefined;
      try {
        const fpResult = await computeAudioBlobFingerprint(sampleBlob);
        fingerprint = fpResult.compressedFingerprint;
        console.log('[YTMD Offscreen] Chromaprint WASM fingerprint generated:', {
          length: fingerprint.length,
          preview: fingerprint.slice(0, 20) + '...'
        });
      } catch (fpErr: any) {
        console.warn('[YTMD Offscreen] Fingerprint generation warning:', fpErr?.message || fpErr);
      }

      const metadata: CapturedSampleMeta = {
        videoId: currentVideoId,
        startPlaybackSeconds: currentStartPlaybackSec,
        endPlaybackSeconds: currentStartPlaybackSec + actualDurationSec,
        sampleDurationSeconds: actualDurationSec,
        blobSizeBytes: sampleBlob.size,
        mimeType,
        capturedAtEpochMs: captureStartEpochMs,
        fingerprint
      };

      chrome.runtime.sendMessage({
        type: 'CAPTURE_COMPLETE',
        payload: { metadata }
      } as ExtensionMessage).catch(() => {});

      cleanupAudio();
    };

    mediaRecorder.start(500); // chunk every 500ms
    console.log('[YTMD Offscreen] MediaRecorder actively recording tab audio');

    // Live progress emitter every 1 second
    let elapsedSeconds = 0;
    progressIntervalId = window.setInterval(() => {
      elapsedSeconds++;
      chrome.runtime.sendMessage({
        type: 'CAPTURE_PROGRESS',
        payload: {
          elapsedSeconds: Math.min(elapsedSeconds, configuredDurationSec),
          maxDurationSeconds: configuredDurationSec
        }
      } as ExtensionMessage).catch(() => {});
    }, 1000);

    // Bounded maximum duration timer
    autoStopTimeoutId = window.setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    }, maxDurationSeconds * 1000);

  } catch (err: any) {
    console.error('[YTMD Offscreen] Capture initialization failed:', err);
    chrome.runtime.sendMessage({
      type: 'CAPTURE_ERROR',
      payload: { error: err.message || 'Failed to capture tab audio' }
    } as ExtensionMessage).catch(() => {});
    cleanupAudio();
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === 'START_CAPTURE') {
    startAudioCapture(
      message.payload.streamId,
      message.payload.maxDurationSeconds || 15,
      message.payload.videoId,
      message.payload.startPlaybackSeconds
    );
  } else if (message.type === 'STOP_CAPTURE') {
    console.log('[YTMD Offscreen] Stopping capture requested');
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    } else {
      cleanupAudio();
    }
  } else if (message.type === 'CANCEL_CAPTURE') {
    console.log('[YTMD Offscreen] Cancelling capture requested');
    cleanupAudio();
  }
});
