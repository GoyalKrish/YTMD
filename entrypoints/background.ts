export default defineBackground(() => {
  console.log('[YTMD Background] Service Worker initialized');

  // Configure side panel to open when extension action icon is clicked
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) => console.error('[YTMD Background] Failed to set side panel behavior:', err));
  }

  // Handle capture shortcut command (Alt+Shift+S)
  if (chrome.commands?.onCommand) {
    chrome.commands.onCommand.addListener((command) => {
      if (command === 'capture_sample') {
        chrome.runtime.sendMessage({ type: 'TRIGGER_CAPTURE_SHORTCUT' }).catch(() => {});
      }
    });
  }

  async function ensureOffscreenDocument(): Promise<boolean> {
    try {
      // Check if offscreen document is already alive
      if (chrome.runtime.getContexts) {
        const contexts = await chrome.runtime.getContexts({
          contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
        });
        if (contexts.length > 0) {
          return true;
        }
      }

      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification: 'Capture tab audio for recognition while keeping user playback audible'
      });
      console.log('[YTMD Background] Offscreen document created');
      return true;
    } catch (err: any) {
      // If document already exists or is in transition, ignore duplicate creation error
      if (err?.message?.includes('Only a single offscreen document may be created')) {
        return true;
      }
      console.error('[YTMD Background] Error creating offscreen document:', err);
      throw err;
    }
  }

  // Handle messages across extension contexts
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'ENSURE_OFFSCREEN') {
      ensureOffscreenDocument()
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message?.type === 'GET_TAB_STREAM_ID') {
      const targetTabId = message.payload?.tabId || sender.tab?.id;
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
        .catch((err) => {
          sendResponse({ error: err.message || 'Failed to initialize offscreen capture' });
        });

      return true; // async sendResponse
    }

    return false;
  });
});
