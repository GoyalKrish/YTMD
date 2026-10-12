import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DiscoveryHeader } from '../../components/DiscoveryHeader';
import { PlayerContextCard } from '../../components/PlayerContextCard';
import { DiscoveryControls } from '../../components/DiscoveryControls';
import { IdentificationResultCard } from '../../components/IdentificationResultCard';
import { EmptyState } from '../../components/EmptyState';
import { VideoPlaybackState, DiscoveryStatus, IdentificationResult } from '../../lib/types';
import { ExtensionMessage } from '../../lib/messages';

export default function App() {
  const [playbackState, setPlaybackState] = useState<VideoPlaybackState | null>(null);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [status, setStatus] = useState<DiscoveryStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [elapsedCaptureSec, setElapsedCaptureSec] = useState<number>(0);
  const [lastResult, setLastResult] = useState<IdentificationResult | null>(null);

  // Track the in-flight captureId so stale responses are ignored
  const activeCaptureIdRef = useRef<string | null>(null);
  const isIdentifyingRef = useRef<boolean>(false);

  // -------------------------------------------------------------------------
  // Query the active tab to find the YouTube player
  // -------------------------------------------------------------------------
  const queryActiveTab = useCallback(async () => {
    try {
      let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tabs || tabs.length === 0) {
        tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      }
      const tab = tabs[0];
      if (!tab || !tab.id) return;
      setActiveTabId(tab.id);

      if (tab.url && tab.url.includes('youtube.com/watch')) {
        chrome.tabs.sendMessage(
          tab.id,
          { type: 'REQUEST_PLAYER_STATE' } as ExtensionMessage,
          (response: VideoPlaybackState) => {
            if (chrome.runtime.lastError) {
              // Content script not ready yet — silently ignore
            } else if (response) {
              setPlaybackState(response);
            }
          }
        );
      } else {
        setPlaybackState(null);
      }
    } catch (err) {
      console.error('[Sidepanel] Failed to query active tab:', err);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Runtime message handler
  // -------------------------------------------------------------------------
  useEffect(() => {
    queryActiveTab();

    const handleMessage = (message: ExtensionMessage) => {
      // Shortcut command from background
      if ((message as any).type === 'TRIGGER_CAPTURE_SHORTCUT') {
        if (!isIdentifyingRef.current) handleIdentify();
        return;
      }

      // Player state sync from content script
      if (message.type === 'YOUTUBE_PLAYER_STATE') {
        const newState = message.payload;
        setPlaybackState(newState);

        // Cancel in-flight identification if video paused or seeked far
        if (isIdentifyingRef.current && activeCaptureIdRef.current) {
          if (newState.isPaused) {
            handleCancel('Video paused during capture');
          }
        }
        return;
      }

      // YouTube SPA navigation
      if (message.type === 'YOUTUBE_NAVIGATED') {
        if (isIdentifyingRef.current && activeCaptureIdRef.current) {
          handleCancel('Video changed during capture');
        }
        queryActiveTab();
        return;
      }

      // Capture progress tick (from offscreen via background relay)
      if (message.type === 'CAPTURE_PROGRESS') {
        // Only update if this is our active capture
        if (message.payload.captureId === activeCaptureIdRef.current) {
          setElapsedCaptureSec(message.payload.elapsedSeconds);
        }
        return;
      }

      // Stage updates from background
      if (message.type === 'IDENTIFICATION_STATUS') {
        if (message.payload.captureId !== activeCaptureIdRef.current) return;
        const { stage } = message.payload;
        if (stage === 'capturing') {
          setStatus('capturing');
          setStatusMessage('Capturing audio (0/' + 15 + 's)...');
        } else if (stage === 'fingerprinting') {
          setStatus('fingerprinting');
          setStatusMessage('Generating fingerprint...');
          setElapsedCaptureSec(15);
        } else if (stage === 'identifying') {
          setStatus('identifying');
          setStatusMessage('Checking AcoustID...');
        }
        return;
      }

      // Final identification result from background
      if (message.type === 'IDENTIFICATION_RESULT') {
        const result = message.payload;

        // Reject stale responses from a previous capture
        if (result.captureId !== activeCaptureIdRef.current) return;

        activeCaptureIdRef.current = null;
        isIdentifyingRef.current = false;
        setElapsedCaptureSec(0);
        setLastResult(result);

        if (result.status === 'matched') {
          setStatus('matched');
          setStatusMessage('');
        } else if (result.status === 'no-match') {
          setStatus('no-match');
          setStatusMessage(result.message || 'No match found for this sample');
        } else if (result.status === 'cancelled') {
          setStatus('idle');
          setStatusMessage('Capture cancelled');
          setTimeout(() => setStatusMessage(''), 3000);
        } else {
          setStatus('error');
          setStatusMessage(result.message || 'Identification failed');
        }
        return;
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    const handleTabActivated = () => queryActiveTab();
    const handleTabUpdated = (_id: number, change: chrome.tabs.TabChangeInfo) => {
      if (change.status === 'complete' || change.url) queryActiveTab();
    };

    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
    };
  }, [queryActiveTab]);

  // -------------------------------------------------------------------------
  // Seek handler
  // -------------------------------------------------------------------------
  const handleSeek = async (seconds: number) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const targetTabId = tab?.id || activeTabId;
      if (!targetTabId) return;

      chrome.tabs.sendMessage(
        targetTabId,
        { type: 'SEEK_TO_TIMESTAMP', payload: { seconds } } as ExtensionMessage,
        (response) => {
          if (chrome.runtime.lastError || !response?.success) {
            chrome.scripting?.executeScript({
              target: { tabId: targetTabId },
              func: (targetSec: number) => {
                const video =
                  document.querySelector<HTMLVideoElement>('video.html5-main-video') ||
                  document.querySelector<HTMLVideoElement>('video');
                if (video) video.currentTime = targetSec;
              },
              args: [seconds]
            }).catch(() => {});
          }
        }
      );
    } catch (err: any) {
      console.warn('[Sidepanel] Seek error:', err?.message || err);
    }
  };

  // -------------------------------------------------------------------------
  // Identify song — sends IDENTIFY_SONG to background
  // -------------------------------------------------------------------------
  const handleIdentify = async () => {
    if (isIdentifyingRef.current) return;
    if (!playbackState || !playbackState.videoId) return;

    // Validate playback
    if (playbackState.isPaused) {
      setStatus('error');
      setStatusMessage('Video is paused. Start playback first.');
      setTimeout(() => { setStatus('idle'); setStatusMessage(''); }, 4000);
      return;
    }
    if (playbackState.isLive) {
      setStatus('error');
      setStatusMessage('Live streams are not supported yet.');
      setTimeout(() => { setStatus('idle'); setStatusMessage(''); }, 4000);
      return;
    }

    let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tabs || tabs.length === 0) {
      tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    }
    const tab = tabs[0];
    const targetTabId = tab?.id || activeTabId;
    if (!targetTabId) {
      setStatus('error');
      setStatusMessage('No active YouTube tab found');
      return;
    }

    const captureId = `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    activeCaptureIdRef.current = captureId;
    isIdentifyingRef.current = true;
    setLastResult(null);
    setStatus('requesting-permission');
    setStatusMessage('Starting capture...');
    setElapsedCaptureSec(0);

    console.log('[YTMD] Identify requested');

    chrome.runtime.sendMessage({
      type: 'IDENTIFY_SONG',
      payload: {
        captureId,
        tabId: targetTabId,
        videoId: playbackState.videoId,
        videoTitle: playbackState.title,
        currentTime: Math.floor(playbackState.currentTime)
      }
    } as ExtensionMessage, (resp) => {
      if (chrome.runtime.lastError) {
        activeCaptureIdRef.current = null;
        isIdentifyingRef.current = false;
        setStatus('error');
        setStatusMessage('Failed to reach background: ' + chrome.runtime.lastError.message);
      }
    });
  };

  // -------------------------------------------------------------------------
  // Cancel
  // -------------------------------------------------------------------------
  const handleCancel = (reason = 'Capture cancelled') => {
    const captureId = activeCaptureIdRef.current;
    if (!captureId) return;

    chrome.runtime.sendMessage({
      type: 'CANCEL_IDENTIFICATION',
      payload: { captureId }
    } as ExtensionMessage).catch(() => {});

    activeCaptureIdRef.current = null;
    isIdentifyingRef.current = false;
    setStatus('idle');
    setElapsedCaptureSec(0);
    setStatusMessage(reason);
    setTimeout(() => setStatusMessage(''), 3500);
  };

  const isConnected = Boolean(playbackState && playbackState.videoId);
  const isBusy = isIdentifyingRef.current || (
    status !== 'idle' && status !== 'matched' && status !== 'no-match' && status !== 'error'
  );

  return (
    <div className="app-container">
      <DiscoveryHeader isConnected={isConnected} />

      {!playbackState || !playbackState.videoId ? (
        <EmptyState type="no-youtube" />
      ) : (
        <>
          <PlayerContextCard
            playbackState={playbackState}
            onSeek={handleSeek}
          />

          <DiscoveryControls
            status={status}
            disabled={!isConnected || isBusy}
            onIdentify={handleIdentify}
            onCancel={() => handleCancel('Cancelled by user')}
            elapsedSeconds={elapsedCaptureSec}
            maxSeconds={15}
            statusMessage={statusMessage}
          />

          {lastResult && (
            <IdentificationResultCard
              result={lastResult}
              onSeek={handleSeek}
            />
          )}
        </>
      )}
    </div>
  );
}
