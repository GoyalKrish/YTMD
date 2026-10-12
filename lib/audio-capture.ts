import { CapturedSampleMeta } from './types';
import { computeAudioBlobFingerprint } from './fingerprint';

export interface AudioCaptureCallbacks {
  onProgress: (elapsedSeconds: number, maxSeconds: number) => void;
  onComplete: (metadata: CapturedSampleMeta) => void;
  onError: (error: string) => void;
}

export class TabAudioCaptureSession {
  private activeStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private recordedChunks: Blob[] = [];
  private progressInterval: number | null = null;
  private autoStopTimeout: number | null = null;
  private startTimeMs: number = 0;
  private isFinished: boolean = false;

  constructor(
    private targetTabId: number,
    private videoId: string,
    private startPlaybackSeconds: number,
    private maxDurationSeconds: number = 15,
    private callbacks: AudioCaptureCallbacks
  ) {}

  public async start(): Promise<void> {
    try {
      let stream: MediaStream;
      let usedTabCapture = false;

      // 1. Attempt silent tab capture first
      try {
        const streamId = await new Promise<string>((resolve, reject) => {
          chrome.tabCapture.getMediaStreamId({ targetTabId: this.targetTabId }, (id) => {
            if (chrome.runtime.lastError || !id) {
              reject(new Error(chrome.runtime.lastError?.message || 'Failed to acquire tab media stream ID'));
            } else {
              resolve(id);
            }
          });
        });

        console.log('[YTMD AudioCapture] Acquired tabCapture streamId:', streamId);

        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'tab',
              chromeMediaSourceId: streamId
            }
          } as any,
          video: false
        });
        usedTabCapture = true;
      } catch (tabCaptureErr: any) {
        console.warn(
          '[YTMD AudioCapture] tabCapture silent method failed, falling back to tab display media:',
          tabCaptureErr?.message || tabCaptureErr
        );

        // Fallback: Use standard getDisplayMedia targeting the current tab's audio
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: true,
          // @ts-ignore - Chrome extensions support hint options
          preferCurrentTab: true,
          selfBrowserSurface: 'include',
          systemAudio: 'include'
        });

        // Ensure audio track was granted
        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length === 0) {
          displayStream.getTracks().forEach((t) => t.stop());
          throw new Error('No audio track selected. Make sure "Also share tab audio" is enabled.');
        }

        // Stop video tracks immediately since we only analyze audio
        displayStream.getVideoTracks().forEach((t) => t.stop());

        stream = new MediaStream(audioTracks);
        usedTabCapture = false;
      }

      this.activeStream = stream;

      // 3. For tabCapture, prevent tab audio from muting by routing to AudioContext destination
      // For getDisplayMedia, tab audio is not muted by the browser, so routing is not needed (prevents echo)
      if (usedTabCapture) {
        this.audioContext = new AudioContext();
        const source = this.audioContext.createMediaStreamSource(stream);
        source.connect(this.audioContext.destination);
      }

      // 4. Initialize MediaRecorder with Opus codec
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(stream, { mimeType });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        if (this.isFinished) return;
        this.isFinished = true;

        const totalElapsedMs = Date.now() - this.startTimeMs;
        const actualDurationSec = Math.max(1, Math.round(totalElapsedMs / 1000));
        const sampleBlob = new Blob(this.recordedChunks, { type: mimeType });

        console.log('[YTMD AudioCapture] Captured raw audio blob:', {
          sizeBytes: sampleBlob.size,
          durationSec: actualDurationSec,
          mimeType
        });

        // Compute Chromaprint WASM fingerprint locally
        let fingerprint: string | undefined;
        try {
          const fpResult = await computeAudioBlobFingerprint(sampleBlob);
          fingerprint = fpResult.compressedFingerprint;
          console.log('[YTMD AudioCapture] Chromaprint generated:', fingerprint.slice(0, 20) + '...');
        } catch (fpErr: any) {
          console.warn('[YTMD AudioCapture] Fingerprint computation warning:', fpErr);
        }

        const metadata: CapturedSampleMeta = {
          videoId: this.videoId,
          startPlaybackSeconds: this.startPlaybackSeconds,
          endPlaybackSeconds: this.startPlaybackSeconds + actualDurationSec,
          sampleDurationSeconds: actualDurationSec,
          blobSizeBytes: sampleBlob.size,
          mimeType,
          capturedAtEpochMs: this.startTimeMs,
          fingerprint
        };

        this.cleanup();
        this.callbacks.onComplete(metadata);
      };

      this.startTimeMs = Date.now();
      this.mediaRecorder.start(500);

      // 5. Progress tick every 1000ms
      let elapsed = 0;
      this.progressInterval = window.setInterval(() => {
        elapsed++;
        this.callbacks.onProgress(Math.min(elapsed, this.maxDurationSeconds), this.maxDurationSeconds);
      }, 1000);

      // 6. Auto-stop after bounded duration
      this.autoStopTimeout = window.setTimeout(() => {
        this.stop();
      }, this.maxDurationSeconds * 1000);

    } catch (err: any) {
      console.error('[YTMD AudioCapture] Start error:', err);
      this.cleanup();
      this.callbacks.onError(err?.message || 'Failed to capture tab audio');
    }
  }

  public stop(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.stop();
      } catch {
        this.cleanup();
      }
    } else {
      this.cleanup();
    }
  }

  public cancel(reason = 'Capture cancelled'): void {
    this.isFinished = true;
    this.cleanup();
    this.callbacks.onError(reason);
  }

  private cleanup(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    if (this.autoStopTimeout) {
      clearTimeout(this.autoStopTimeout);
      this.autoStopTimeout = null;
    }
    if (this.activeStream) {
      this.activeStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.activeStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.mediaRecorder = null;
    this.recordedChunks = [];
  }
}
