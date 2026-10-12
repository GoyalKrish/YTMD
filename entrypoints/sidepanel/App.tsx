import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DiscoveryHeader } from '../../components/DiscoveryHeader';
import { PlayerContextCard } from '../../components/PlayerContextCard';
import { DiscoveryControls } from '../../components/DiscoveryControls';
import { SampleDebugCard } from '../../components/SampleDebugCard';
import { TrackTimeline } from '../../components/TrackTimeline';
import { EmptyState } from '../../components/EmptyState';
import {
  VideoPlaybackState,
  DiscoveryStatus,
  TrackOccurrence,
  DiscoverySession,
  CapturedSampleMeta
} from '../../lib/types';
import { ExtensionMessage } from '../../lib/messages';
import { getSession, saveSession } from '../../lib/storage';
import { TabAudioCaptureSession } from '../../lib/audio-capture';
import { Trash2 } from 'lucide-react';

export default function App() {
  const [playbackState, setPlaybackState] = useState<VideoPlaybackState | null>(null);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [occurrences, setOccurrences] = useState<TrackOccurrence[]>([]);
  const [status, setStatus] = useState<DiscoveryStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  
  // Milestone 2 audio capture state
  const [elapsedCaptureSec, setElapsedCaptureSec] = useState<number>(0);
  const [lastCapturedSample, setLastCapturedSample] = useState<CapturedSampleMeta | null>(null);
  const captureStartPlaybackSec = useRef<number>(0);
  const isCapturingRef = useRef<boolean>(false);
  const captureSessionRef = useRef<TabAudioCaptureSession | null>(null);

  // 1. Query the active tab to find YouTube player
  const queryActiveTab = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;
      setActiveTabId(tab.id);

      if (tab.url && tab.url.includes('youtube.com/watch')) {
        chrome.tabs.sendMessage(
          tab.id,
          { type: 'REQUEST_PLAYER_STATE' } as ExtensionMessage,
          (response: VideoPlaybackState) => {
            if (chrome.runtime.lastError) {
              // Content script not ready yet
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

  // 2. Load stored session whenever videoId changes
  useEffect(() => {
    const videoId = playbackState?.videoId;
    if (!videoId) {
      setOccurrences([]);
      setLastCapturedSample(null);
      return;
    }

    getSession(videoId).then((session) => {
      if (session) {
        setOccurrences(session.occurrences || []);
      } else {
        setOccurrences([]);
      }
    });
  }, [playbackState?.videoId]);

  // 3. Save session whenever occurrences change
  useEffect(() => {
    const videoId = playbackState?.videoId;
    if (!videoId) return;

    const session: DiscoverySession = {
      schemaVersion: 1,
      videoId,
      videoTitle: playbackState.title || 'Untitled',
      videoDuration: playbackState.duration,
      startedAtEpochMs: Date.now(),
      updatedAtEpochMs: Date.now(),
      status,
      occurrences
    };

    saveSession(session).catch((err) => console.error('[Sidepanel] Failed to save session:', err));
  }, [occurrences, playbackState?.videoId, status]);

  // 4. Runtime message listener for capture events and player sync
  useEffect(() => {
    queryActiveTab();

    const handleMessage = (message: ExtensionMessage) => {
      if ((message as any).type === 'TRIGGER_CAPTURE_SHORTCUT') {
        if (!isCapturingRef.current) {
          handleStartCapture();
        }
        return;
      }

      if (message.type === 'YOUTUBE_PLAYER_STATE') {
        const newState = message.payload;
        setPlaybackState(newState);

        // Milestone 2 check: if user seeks or pauses while capturing, warn and cancel
        if (isCapturingRef.current) {
          const expectedTime = captureStartPlaybackSec.current + elapsedCaptureSec;
          if (newState.isPaused) {
            handleCancelCapture('Video paused during capture');
          } else if (Math.abs(newState.currentTime - expectedTime) > 4) {
            handleCancelCapture('Playback was seeked; sample invalidated');
          }
        }
      } else if (message.type === 'YOUTUBE_NAVIGATED') {
        if (isCapturingRef.current) {
          handleCancelCapture('Video changed; capture aborted');
        }
        queryActiveTab();
      } else if (message.type === 'CAPTURE_PROGRESS') {
        setElapsedCaptureSec(message.payload.elapsedSeconds);
      } else if (message.type === 'CAPTURE_COMPLETE') {
        const meta = message.payload.metadata;
        setLastCapturedSample(meta);
        setStatus('idle');
        isCapturingRef.current = false;
        setElapsedCaptureSec(0);
        setStatusMessage('Captured 15s audio sample successfully!');

        // Add occurrence to timeline
        const startSec = Math.floor(meta.startPlaybackSeconds);
        const endSec = Math.floor(meta.endPlaybackSeconds);
        const newTrack: TrackOccurrence = {
          id: `sample_${Date.now()}`,
          trackKey: `audio_${startSec}`,
          metadata: {
            recordingId: null,
            acoustId: null,
            title: `Captured Audio Sample (${startSec}s - ${endSec}s)`,
            artists: ['Tab Audio Stream'],
            source: 'acoustid-musicbrainz'
          },
          observedWindows: [
            {
              sampleStartSeconds: startSec,
              sampleEndSeconds: endSec,
              matchedAtEpochMs: meta.capturedAtEpochMs
            }
          ],
          approximateStartSeconds: startSec,
          approximateEndSeconds: endSec,
          lastSeenSeconds: endSec,
          boundaryQuality: 'observed-only'
        };

        setOccurrences((prev) => {
          const filtered = prev.filter((o) => Math.abs(o.approximateStartSeconds - startSec) > 3);
          return [...filtered, newTrack].sort((a, b) => a.approximateStartSeconds - b.approximateStartSeconds);
        });

        setTimeout(() => setStatusMessage(''), 4000);
      } else if (message.type === 'CAPTURE_ERROR') {
        setStatus('error');
        isCapturingRef.current = false;
        setElapsedCaptureSec(0);
        setStatusMessage(`Capture failed: ${message.payload.error}`);
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
  }, [queryActiveTab, elapsedCaptureSec]);

  // 5. Seek video in YouTube player (with self-healing fallback)
  const handleSeek = async (seconds: number) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const targetTabId = tab?.id || activeTabId;
      if (!targetTabId) return;

      chrome.tabs.sendMessage(
        targetTabId,
        {
          type: 'SEEK_TO_TIMESTAMP',
          payload: { seconds }
        } as ExtensionMessage,
        (response) => {
          if (chrome.runtime.lastError || !response?.success) {
            // Self-healing fallback: seek the video element directly using scripting API
            chrome.scripting?.executeScript({
              target: { tabId: targetTabId },
              func: (targetSec: number) => {
                const video =
                  document.querySelector<HTMLVideoElement>('video.html5-main-video') ||
                  document.querySelector<HTMLVideoElement>('video');
                if (video) {
                  video.currentTime = targetSec;
                }
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

  // 6. Milestone 2: User-initiated tab audio capture using TabAudioCaptureSession
  const handleStartCapture = async () => {
    if (!playbackState || !playbackState.videoId) return;

    setStatus('requesting-permission');
    setStatusMessage('Connecting audio stream...');

    try {
      // Query the active tab dynamically at click-time
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const targetTabId = tab?.id || activeTabId;

      if (!targetTabId) {
        setStatus('error');
        setStatusMessage('No active YouTube tab found');
        return;
      }

      const startPlaybackSec = Math.floor(playbackState.currentTime);
      captureStartPlaybackSec.current = startPlaybackSec;

      const session = new TabAudioCaptureSession(
        targetTabId,
        playbackState.videoId,
        startPlaybackSec,
        15,
        {
          onProgress: (elapsed, _max) => {
            setElapsedCaptureSec(elapsed);
          },
          onComplete: (meta) => {
            setLastCapturedSample(meta);
            setStatus('idle');
            isCapturingRef.current = false;
            setElapsedCaptureSec(0);
            setStatusMessage('Captured 15s audio sample successfully!');

            // Add occurrence to timeline
            const startSec = Math.floor(meta.startPlaybackSeconds);
            const endSec = Math.floor(meta.endPlaybackSeconds);
            const newTrack: TrackOccurrence = {
              id: `sample_${Date.now()}`,
              trackKey: `audio_${startSec}`,
              metadata: {
                recordingId: null,
                acoustId: null,
                title: `Captured Audio Sample (${startSec}s - ${endSec}s)`,
                artists: ['Tab Audio Stream'],
                source: 'acoustid-musicbrainz'
              },
              observedWindows: [
                {
                  sampleStartSeconds: startSec,
                  sampleEndSeconds: endSec,
                  matchedAtEpochMs: meta.capturedAtEpochMs
                }
              ],
              approximateStartSeconds: startSec,
              approximateEndSeconds: endSec,
              lastSeenSeconds: endSec,
              boundaryQuality: 'observed-only'
            };

            setOccurrences((prev) => {
              const filtered = prev.filter((o) => Math.abs(o.approximateStartSeconds - startSec) > 3);
              return [...filtered, newTrack].sort((a, b) => a.approximateStartSeconds - b.approximateStartSeconds);
            });

            setTimeout(() => setStatusMessage(''), 4000);
          },
          onError: (err) => {
            setStatus('error');
            isCapturingRef.current = false;
            setElapsedCaptureSec(0);
            setStatusMessage(`Capture failed: ${err}`);
          }
        }
      );

      captureSessionRef.current = session;
      setStatus('capturing');
      isCapturingRef.current = true;
      setElapsedCaptureSec(0);
      setStatusMessage('');

      await session.start();
    } catch (err: any) {
      setStatus('error');
      isCapturingRef.current = false;
      setElapsedCaptureSec(0);
      setStatusMessage(err?.message || 'Failed to start capture');
    }
  };

  const handleStopCapture = () => {
    captureSessionRef.current?.stop();
    setStatusMessage('Finalizing sample...');
  };

  const handleCancelCapture = (reason = 'Capture cancelled') => {
    captureSessionRef.current?.cancel(reason);
    setStatus('idle');
    isCapturingRef.current = false;
    setElapsedCaptureSec(0);
    setStatusMessage(reason);
    setTimeout(() => setStatusMessage(''), 3500);
  };

  const handleClearTimeline = () => {
    setOccurrences([]);
    setLastCapturedSample(null);
  };

  const isConnected = Boolean(playbackState && playbackState.videoId);

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
            disabled={!isConnected}
            onStartCapture={handleStartCapture}
            onStopCapture={handleStopCapture}
            onCancelCapture={() => handleCancelCapture('Capture cancelled by user')}
            elapsedSeconds={elapsedCaptureSec}
            maxSeconds={15}
            statusMessage={statusMessage}
          />

          {lastCapturedSample && (
            <SampleDebugCard
              sample={lastCapturedSample}
              onSeek={handleSeek}
            />
          )}

          {occurrences.length > 0 ? (
            <>
              <TrackTimeline occurrences={occurrences} onSeek={handleSeek} />
              <button
                className="btn-secondary"
                style={{ alignSelf: 'center', marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}
                onClick={handleClearTimeline}
              >
                <Trash2 size={12} /> Clear session timeline
              </button>
            </>
          ) : (
            <EmptyState type="no-tracks" />
          )}
        </>
      )}
    </div>
  );
}
