import { VideoPlaybackState } from '../lib/types';
import { ExtensionMessage } from '../lib/messages';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',
  allFrames: false,
  matchAboutBlank: false,
  main() {
    // Only execute in top-level YouTube window, ignoring sandboxed or about:blank iframes
    try {
      if (window.self !== window.top || window.location.href.startsWith('about:')) {
        return;
      }
    } catch {
      return;
    }

    console.log('[YTMD Content] YouTube content script initialized');

    let currentVideoEl: HTMLVideoElement | null = null;
    let lastKnownVideoId: string | null = null;
    let lastStateBroadcastTime = 0;
    let checkIntervalId: number | null = null;
    let isTerminated = false;

    // Helper to check if extension context is still valid
    function isContextValid(): boolean {
      if (isTerminated) return false;
      try {
        return Boolean(chrome.runtime && chrome.runtime.id);
      } catch {
        return false;
      }
    }

    // Teardown everything if extension gets reloaded or context invalidates
    function teardown() {
      if (isTerminated) return;
      isTerminated = true;

      if (checkIntervalId) {
        clearInterval(checkIntervalId);
        checkIntervalId = null;
      }

      if (currentVideoEl) {
        videoEvents.forEach(({ event, handler }) => {
          currentVideoEl?.removeEventListener(event, handler);
        });
        currentVideoEl = null;
      }

      window.removeEventListener('yt-navigate-finish', checkNavigation);
      window.removeEventListener('yt-page-data-updated', checkNavigation);
      window.removeEventListener('popstate', checkNavigation);

      console.log('[YTMD Content] Cleaned up listeners after extension context change');
    }

    // Safe message dispatcher that catches context invalidation
    function safeSendMessage(message: ExtensionMessage) {
      if (!isContextValid()) {
        teardown();
        return;
      }

      try {
        chrome.runtime.sendMessage(message).catch((err: any) => {
          if (err?.message?.includes('Extension context invalidated')) {
            teardown();
          }
        });
      } catch (err: any) {
        if (err?.message?.includes('Extension context invalidated')) {
          teardown();
        }
      }
    }

    function getVideoIdFromUrl(): string | null {
      try {
        const url = new URL(window.location.href);
        return url.searchParams.get('v');
      } catch {
        return null;
      }
    }

    function getVideoTitle(): string | null {
      const titleElem =
        document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
        document.querySelector('#title h1 yt-formatted-string') ||
        document.querySelector('h1.title yt-formatted-string');

      if (titleElem && titleElem.textContent) {
        return titleElem.textContent.trim();
      }

      const docTitle = document.title;
      if (docTitle) {
        return docTitle.replace(/ - YouTube$/, '').trim();
      }
      return null;
    }

    function getPlaybackState(): VideoPlaybackState {
      const videoId = getVideoIdFromUrl();
      const video = currentVideoEl;

      const playerEl = document.querySelector('.html5-video-player');
      const isPlayerLive = Boolean(playerEl?.classList.contains('ytp-live'));
      const isDurationInfinite = Boolean(video && !Number.isNaN(video.duration) && !Number.isFinite(video.duration));
      const isLive = isPlayerLive || isDurationInfinite;

      return {
        videoId,
        title: getVideoTitle(),
        currentTime: video ? video.currentTime : 0,
        duration: video && !isNaN(video.duration) && isFinite(video.duration) ? video.duration : null,
        isPaused: video ? video.paused : true,
        playbackRate: video ? video.playbackRate : 1,
        isLive,
        pageUrl: window.location.href
      };
    }

    function broadcastState(force = false) {
      if (!isContextValid()) {
        teardown();
        return;
      }

      const now = Date.now();
      if (!force && now - lastStateBroadcastTime < 350) {
        return;
      }
      lastStateBroadcastTime = now;

      const state = getPlaybackState();
      safeSendMessage({
        type: 'YOUTUBE_PLAYER_STATE',
        payload: state
      });
    }

    const videoEvents: Array<{ event: string; handler: () => void }> = [
      { event: 'timeupdate', handler: () => broadcastState(false) },
      { event: 'play', handler: () => broadcastState(true) },
      { event: 'pause', handler: () => broadcastState(true) },
      { event: 'ratechange', handler: () => broadcastState(true) },
      { event: 'seeked', handler: () => broadcastState(true) },
      { event: 'durationchange', handler: () => broadcastState(true) }
    ];

    function attachVideoListeners(video: HTMLVideoElement) {
      if (currentVideoEl === video) return;

      // Detach from previous video if any
      if (currentVideoEl) {
        videoEvents.forEach(({ event, handler }) => {
          currentVideoEl?.removeEventListener(event, handler);
        });
      }

      currentVideoEl = video;
      console.log('[YTMD Content] Attached to active HTMLVideoElement');

      videoEvents.forEach(({ event, handler }) => {
        video.addEventListener(event, handler);
      });

      broadcastState(true);
    }

    function locateVideoElement(): HTMLVideoElement | null {
      if (!isContextValid()) {
        teardown();
        return null;
      }

      const video =
        document.querySelector<HTMLVideoElement>('video.html5-main-video') ||
        document.querySelector<HTMLVideoElement>('ytd-player video') ||
        document.querySelector<HTMLVideoElement>('video');

      if (video) {
        attachVideoListeners(video);
      }
      return video;
    }

    function checkNavigation() {
      if (!isContextValid()) {
        teardown();
        return;
      }

      const videoId = getVideoIdFromUrl();
      if (videoId !== lastKnownVideoId) {
        lastKnownVideoId = videoId;
        console.log('[YTMD Content] YouTube navigation detected, videoId:', videoId);

        safeSendMessage({
          type: 'YOUTUBE_NAVIGATED',
          payload: {
            videoId,
            pageUrl: window.location.href
          }
        });

        setTimeout(() => {
          if (!isContextValid()) return;
          locateVideoElement();
          broadcastState(true);
        }, 300);
      }
    }

    // Attach YouTube SPA listeners
    window.addEventListener('yt-navigate-finish', checkNavigation);
    window.addEventListener('yt-page-data-updated', checkNavigation);
    window.addEventListener('popstate', checkNavigation);

    // Initial detection
    checkNavigation();
    locateVideoElement();

    // Periodic check to recover if YouTube replaces its player
    checkIntervalId = window.setInterval(() => {
      if (!isContextValid()) {
        teardown();
        return;
      }
      if (!currentVideoEl || !document.contains(currentVideoEl)) {
        locateVideoElement();
      }
    }, 1500);

    // Runtime message listener
    try {
      chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
        if (!isContextValid()) {
          teardown();
          return false;
        }

        if (message.type === 'REQUEST_PLAYER_STATE') {
          locateVideoElement();
          sendResponse(getPlaybackState());
          return true;
        }

        if (message.type === 'SEEK_TO_TIMESTAMP') {
          const { seconds } = message.payload;
          const video = locateVideoElement();
          if (video) {
            video.currentTime = Math.max(0, Math.min(seconds, video.duration || seconds));
            broadcastState(true);
            sendResponse({ success: true, currentTime: video.currentTime });
          } else {
            sendResponse({ success: false, error: 'No active video element found' });
          }
          return true;
        }

        return false;
      });
    } catch (err: any) {
      if (err?.message?.includes('Extension context invalidated')) {
        teardown();
      }
    }
  }
});
