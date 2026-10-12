export default defineBackground(() => {
  console.log('[YTMD Background] Service Worker initialized');

  // Configure side panel to open when extension action icon is clicked
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) => console.error('[YTMD Background] Failed to set side panel behavior:', err));
  }

  // Handle messages across extension contexts
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // If the message is requesting an offscreen setup or tabCapture streamId:
    if (message?.type === 'GET_TAB_STREAM_ID') {
      const targetTabId = message.payload?.tabId || sender.tab?.id;
      if (!targetTabId) {
        sendResponse({ error: 'No target tab ID provided' });
        return true;
      }

      chrome.tabCapture.getMediaStreamId({ targetTabId }, (streamId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ streamId });
        }
      });
      return true; // async sendResponse
    }

    return false;
  });
});
