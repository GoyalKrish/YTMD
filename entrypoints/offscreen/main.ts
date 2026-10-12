import { ExtensionMessage } from '../../lib/messages';

console.log('[YTMD Offscreen] Audio pipeline ready');

let activeStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let audioContext: AudioContext | null = null;
let recordedChunks: Blob[] = [];

async function startAudioCapture(streamId: string, maxDurationSeconds: number) {
  try {
    console.log('[YTMD Offscreen] Starting audio capture with streamId:', streamId);

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

    // Route captured audio to destination so playback is not muted for user
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(audioContext.destination);

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const sampleBlob = new Blob(recordedChunks, { type: 'audio/webm' });
      console.log('[YTMD Offscreen] Capture complete, total blob size:', sampleBlob.size);

      chrome.runtime.sendMessage({
        type: 'CAPTURE_COMPLETE',
        payload: {
          sampleBlob,
          durationSeconds: maxDurationSeconds
        }
      } as ExtensionMessage).catch(() => {});

      cleanupAudio();
    };

    mediaRecorder.start();

    // Automatically stop when bounded window completes
    setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    }, maxDurationSeconds * 1000);

  } catch (err: any) {
    console.error('[YTMD Offscreen] Capture error:', err);
    chrome.runtime.sendMessage({
      type: 'CAPTURE_ERROR',
      payload: { error: err.message || 'Failed to capture tab audio' }
    } as ExtensionMessage).catch(() => {});
    cleanupAudio();
  }
}

function cleanupAudio() {
  if (activeStream) {
    activeStream.getTracks().forEach((t) => t.stop());
    activeStream = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  mediaRecorder = null;
  recordedChunks = [];
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === 'START_CAPTURE') {
    startAudioCapture(message.payload.streamId, message.payload.maxDurationSeconds || 15);
  } else if (message.type === 'STOP_CAPTURE') {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    } else {
      cleanupAudio();
    }
  }
});
