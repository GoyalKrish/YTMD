import { lookupAcoustID } from '../lib/acoustid';
import { IdentificationResult } from '../lib/types';
import { ExtensionMessage } from '../lib/messages';

/** Duration in seconds to capture. */
const CAPTURE_DURATION_SECONDS = 15;

export default defineBackground(() => {
  console.log('[YTMD Background] Service Worker initialized');

  // Configure side panel to open when extension action icon is clicked
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) => console.error('[YTMD Background] Failed to set side panel behavior:', err));
  }

  // Forward shortcut command to side panel
  if (chrome.commands?.onCommand) {
    chrome.commands.onCommand.addListener((command) => {
      if (command === 'capture_sample') {
        chrome.runtime.sendMessage({ type: 'TRIGGER_CAPTURE_SHORTCUT' } as ExtensionMessage).catch(() => {});
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Active capture tracking
  // ---------------------------------------------------------------------------

  interface PendingCapture {
    captureId: string;
    videoId: string;
    videoTitle: string | null;
    sampleStartSeconds: number;
    tabId: number;
  }

  let pendingCapture: PendingCapture | null = null;

  // ---------------------------------------------------------------------------
  // Offscreen document helpers
  // ---------------------------------------------------------------------------

  async function ensureOffscreenDocument(): Promise<boolean> {
    try {
      if (chrome.runtime.getContexts) {
        const contexts = await chrome.runtime.getContexts({
          contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
        });
        if (contexts.length > 0) return true;
      }

      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification: 'Capture tab audio for Chromaprint fingerprinting and AcoustID song identification'
      });
      console.log('[YTMD Background] Offscreen document created');
      return true;
    } catch (err: any) {
      if (err?.message?.includes('Only a single offscreen document may be created')) return true;
      console.error('[YTMD Background] Error creating offscreen document:', err);
      throw err;
    }
  }

  async function broadcastResult(result: IdentificationResult) {
    chrome.runtime.sendMessage({
      type: 'IDENTIFICATION_RESULT',
      payload: result
    } as ExtensionMessage).catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Main identification flow
  // ---------------------------------------------------------------------------

  async function handleIdentifySong(
    captureId: string,
    tabId: number,
    videoId: string,
    videoTitle: string | null,
    currentTime: number
  ) {
    // Prevent concurrent captures
    if (pendingCapture) {
      console.warn('[YTMD Background] Identification already in progress, ignoring new request');
      return;
    }

    console.log('[YTMD] Identify requested');
    console.log('[YTMD] Active video: ' + videoId + ', start: ' + currentTime);

    pendingCapture = { captureId, videoId, videoTitle, sampleStartSeconds: currentTime, tabId };

    try {
      // Ensure offscreen doc exists
      await ensureOffscreenDocument();

      // Get tab stream ID (must be called from background, not content/sidepanel)
      const streamId = await new Promise<string>((resolve, reject) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
          if (chrome.runtime.lastError || !id) {
            reject(new Error(chrome.runtime.lastError?.message || 'tabCapture.getMediaStreamId failed'));
          } else {
            resolve(id);
          }
        });
      });

      // Notify sidepanel we're capturing
      chrome.runtime.sendMessage({
        type: 'IDENTIFICATION_STATUS',
        payload: { captureId, stage: 'capturing' }
      } as ExtensionMessage).catch(() => {});

      console.log('[YTMD] Capture started');

      // Tell offscreen to start capturing
      await chrome.runtime.sendMessage({
        type: 'START_CAPTURE',
        payload: {
          captureId,
          streamId,
          maxDurationSeconds: CAPTURE_DURATION_SECONDS,
          videoId,
          startPlaybackSeconds: currentTime
        }
      } as ExtensionMessage);

    } catch (err: any) {
      console.error('[YTMD Background] Identification setup failed:', err);
      pendingCapture = null;

      const rawMessage = err?.message || 'Failed to start capture';
      const isUninvoked = rawMessage.includes('Extension has not been invoked');
      const errCode = isUninvoked || rawMessage.toLowerCase().includes('permission')
        ? 'CAPTURE_PERMISSION_DENIED'
        : 'CAPTURE_FAILED';

      const userMessage = isUninvoked
        ? 'Permission needed: Press Alt+Shift+S on the YouTube tab (or click the pinned YTMD icon in your Chrome toolbar) to grant capture access.'
        : rawMessage;

      await broadcastResult({
        captureId,
        videoId,
        videoTitle,
        sampleStartSeconds: currentTime,
        sampleEndSeconds: currentTime,
        status: 'error',
        errorCode: errCode as any,
        message: userMessage
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Handle CAPTURE_COMPLETE from offscreen → call AcoustID
  // ---------------------------------------------------------------------------

  async function handleCaptureComplete(payload: {
    captureId: string;
    fingerprint: string;
    durationSeconds: number;
    sampleStartSeconds: number;
    sampleEndSeconds: number;
    blobSizeBytes: number;
  }) {
    const capture = pendingCapture;

    // Guard against stale/orphan messages
    if (!capture || capture.captureId !== payload.captureId) {
      console.warn('[YTMD Background] Received CAPTURE_COMPLETE for unknown captureId, ignoring');
      return;
    }

    // Notify sidepanel: now fingerprinting
    chrome.runtime.sendMessage({
      type: 'IDENTIFICATION_STATUS',
      payload: { captureId: payload.captureId, stage: 'fingerprinting' }
    } as ExtensionMessage).catch(() => {});

    // Small delay so UI shows 'fingerprinting' (fingerprint was computed in offscreen already)
    await new Promise((r) => setTimeout(r, 100));

    // Notify sidepanel: now querying AcoustID
    chrome.runtime.sendMessage({
      type: 'IDENTIFICATION_STATUS',
      payload: { captureId: payload.captureId, stage: 'identifying' }
    } as ExtensionMessage).catch(() => {});

    console.log('[YTMD] Checking AcoustID...');

    let result: IdentificationResult;

    try {
      const acoustResult = await lookupAcoustID(payload.fingerprint, payload.durationSeconds);
      console.log('[YTMD] AcoustID response: status=' + acoustResult.outcome);

      if (acoustResult.outcome === 'matched') {
        const m = acoustResult.match;
        console.log('[YTMD] Match: title=' + m.title + ', score=' + m.score);
        result = {
          captureId: payload.captureId,
          videoId: capture.videoId,
          videoTitle: capture.videoTitle,
          sampleStartSeconds: payload.sampleStartSeconds,
          sampleEndSeconds: payload.sampleEndSeconds,
          status: 'matched',
          track: {
            title: m.title!,
            artists: m.artists || [],
            recordingId: m.recordingId,
            acoustId: m.acoustId,
            score: m.score
          }
        };
      } else if (acoustResult.outcome === 'no-match') {
        console.log('[YTMD] No match');
        result = {
          captureId: payload.captureId,
          videoId: capture.videoId,
          videoTitle: capture.videoTitle,
          sampleStartSeconds: payload.sampleStartSeconds,
          sampleEndSeconds: payload.sampleEndSeconds,
          status: 'no-match',
          errorCode: 'NO_MATCH',
          message: 'No match found for this sample'
        };
      } else if (acoustResult.outcome === 'no-metadata') {
        console.log('[YTMD] AcoustID matched fingerprint but recording has no title/artist metadata');
        result = {
          captureId: payload.captureId,
          videoId: capture.videoId,
          videoTitle: capture.videoTitle,
          sampleStartSeconds: payload.sampleStartSeconds,
          sampleEndSeconds: payload.sampleEndSeconds,
          status: 'no-match',
          errorCode: 'METADATA_UNAVAILABLE',
          message: `AcoustID matched (score ${acoustResult.score.toFixed(2)}) but recording has no title/artist metadata`,
          track: {
            title: '',
            artists: [],
            acoustId: acoustResult.acoustId,
            score: acoustResult.score
          }
        };
      } else {
        // acoustResult.outcome === 'error'
        const errCode = acoustResult.code === 'rate-limit'
          ? 'ACOUSTID_REQUEST_FAILED'
          : acoustResult.code === 'network'
          ? 'ACOUSTID_REQUEST_FAILED'
          : acoustResult.code === 'bad-response'
          ? 'ACOUSTID_BAD_RESPONSE'
          : 'ACOUSTID_REQUEST_FAILED';

        result = {
          captureId: payload.captureId,
          videoId: capture.videoId,
          videoTitle: capture.videoTitle,
          sampleStartSeconds: payload.sampleStartSeconds,
          sampleEndSeconds: payload.sampleEndSeconds,
          status: 'error',
          errorCode: errCode as any,
          message: acoustResult.message
        };
      }
    } catch (err: any) {
      result = {
        captureId: payload.captureId,
        videoId: capture.videoId,
        videoTitle: capture.videoTitle,
        sampleStartSeconds: payload.sampleStartSeconds,
        sampleEndSeconds: payload.sampleEndSeconds,
        status: 'error',
        errorCode: 'ACOUSTID_REQUEST_FAILED',
        message: err?.message || 'Unexpected error during AcoustID lookup'
      };
    }

    pendingCapture = null;
    await broadcastResult(result);
  }

  // ---------------------------------------------------------------------------
  // Handle CAPTURE_ERROR from offscreen
  // ---------------------------------------------------------------------------

  async function handleCaptureError(payload: { captureId: string; error: string }) {
    const capture = pendingCapture;
    if (!capture || capture.captureId !== payload.captureId) return;

    pendingCapture = null;

    const errCode = payload.error.toLowerCase().includes('fingerprint')
      ? 'FINGERPRINT_FAILED'
      : 'CAPTURE_FAILED';

    await broadcastResult({
      captureId: payload.captureId,
      videoId: capture.videoId,
      videoTitle: capture.videoTitle,
      sampleStartSeconds: capture.sampleStartSeconds,
      sampleEndSeconds: capture.sampleStartSeconds,
      status: 'error',
      errorCode: errCode as any,
      message: payload.error
    });
  }

  // ---------------------------------------------------------------------------
  // Message router
  // ---------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    // IDENTIFY_SONG: user clicked the button
    if (message.type === 'IDENTIFY_SONG') {
      handleIdentifySong(
        message.payload.captureId,
        message.payload.tabId,
        message.payload.videoId,
        message.payload.videoTitle,
        message.payload.currentTime
      );
      sendResponse({ ok: true });
      return true;
    }

    // CANCEL_IDENTIFICATION: user cancelled or video changed
    if (message.type === 'CANCEL_IDENTIFICATION') {
      const capture = pendingCapture;
      if (capture && capture.captureId === message.payload.captureId) {
        pendingCapture = null;
        chrome.runtime.sendMessage({ type: 'CANCEL_CAPTURE' } as ExtensionMessage).catch(() => {});
        broadcastResult({
          captureId: message.payload.captureId,
          videoId: capture.videoId,
          videoTitle: capture.videoTitle,
          sampleStartSeconds: capture.sampleStartSeconds,
          sampleEndSeconds: capture.sampleStartSeconds,
          status: 'cancelled'
        });
      }
      sendResponse({ ok: true });
      return true;
    }

    // CAPTURE_COMPLETE from offscreen → run AcoustID
    if (message.type === 'CAPTURE_COMPLETE') {
      handleCaptureComplete(message.payload);
      return false;
    }

    // CAPTURE_ERROR from offscreen
    if (message.type === 'CAPTURE_ERROR') {
      handleCaptureError(message.payload);
      return false;
    }

    // ENSURE_OFFSCREEN helper (kept for compatibility)
    if (message.type === 'ENSURE_OFFSCREEN') {
      ensureOffscreenDocument()
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    // GET_TAB_STREAM_ID helper (kept for compatibility)
    if (message.type === 'GET_TAB_STREAM_ID') {
      const targetTabId = message.payload?.tabId;
      if (!targetTabId) {
        sendResponse({ error: 'No target tab ID provided' });
        return true;
      }
      ensureOffscreenDocument()
        .then(() => {
          chrome.tabCapture.getMediaStreamId({ targetTabId }, (streamId) => {
            if (chrome.runtime.lastError) {
              sendResponse({ error: chrome.runtime.lastError.message });
            } else {
              sendResponse({ streamId });
            }
          });
        })
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }

    return false;
  });
});
