import React, { useState, useEffect, useCallback } from 'react';
import { DiscoveryHeader } from '../../components/DiscoveryHeader';
import { PlayerContextCard } from '../../components/PlayerContextCard';
import { DiscoveryControls } from '../../components/DiscoveryControls';
import { TrackTimeline } from '../../components/TrackTimeline';
import { EmptyState } from '../../components/EmptyState';
import { VideoPlaybackState, DiscoveryStatus, TrackOccurrence, DiscoverySession } from '../../lib/types';
import { ExtensionMessage } from '../../lib/messages';
import { getSession, saveSession } from '../../lib/storage';
import { Sparkles, Trash2 } from 'lucide-react';

export default function App() {
  const [playbackState, setPlaybackState] = useState<VideoPlaybackState | null>(null);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [occurrences, setOccurrences] = useState<TrackOccurrence[]>([]);
  const [status, setStatus] = useState<DiscoveryStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');

  // 1. Query the active tab to find YouTube player
  const queryActiveTab = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;
      setActiveTabId(tab.id);

      if (tab.url && tab.url.includes('youtube.com/watch')) {
        // Request immediate state from content script
        chrome.tabs.sendMessage(
          tab.id,
          { type: 'REQUEST_PLAYER_STATE' } as ExtensionMessage,
          (response: VideoPlaybackState) => {
            if (chrome.runtime.lastError) {
              console.log('[Sidepanel] Content script not yet ready on tab:', tab.id);
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

  // 4. Setup runtime message listener and tab update listeners
  useEffect(() => {
    queryActiveTab();

    const handleMessage = (message: ExtensionMessage) => {
      if (message.type === 'YOUTUBE_PLAYER_STATE') {
        setPlaybackState(message.payload);
      } else if (message.type === 'YOUTUBE_NAVIGATED') {
        queryActiveTab();
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    const handleTabActivated = () => {
      queryActiveTab();
    };

    const handleTabUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.status === 'complete' || changeInfo.url) {
        queryActiveTab();
      }
    };

    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
    };
  }, [queryActiveTab]);

  // 5. Seek video in YouTube player
  const handleSeek = (seconds: number) => {
    if (!activeTabId) return;

    chrome.tabs.sendMessage(
      activeTabId,
      {
        type: 'SEEK_TO_TIMESTAMP',
        payload: { seconds }
      } as ExtensionMessage,
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Sidepanel] Seek error:', chrome.runtime.lastError);
        } else {
          console.log('[Sidepanel] Seek response:', response);
        }
      }
    );
  };

  // 6. Milestone test action: Identify or add bookmark occurrence at current time
  const handleIdentify = () => {
    if (!playbackState) return;

    setStatus('capturing');
    setStatusMessage('Sampling audio window...');

    setTimeout(() => {
      setStatus('identifying');
      setStatusMessage('Analyzing audio fingerprint...');

      setTimeout(() => {
        setStatus('idle');
        setStatusMessage('Track detected!');

        // Milestone 1 proof: add a test track pinned to the current timestamp
        const currentSec = Math.floor(playbackState.currentTime);
        const newTrack: TrackOccurrence = {
          id: `trk_${Date.now()}`,
          trackKey: `key_${currentSec}`,
          metadata: {
            recordingId: null,
            acoustId: null,
            title: `Sample Track at ${currentSec}s`,
            artists: ['Audio Stream'],
            source: 'acoustid-musicbrainz'
          },
          observedWindows: [
            {
              sampleStartSeconds: currentSec,
              sampleEndSeconds: currentSec + 15,
              matchedAtEpochMs: Date.now()
            }
          ],
          approximateStartSeconds: currentSec,
          approximateEndSeconds: currentSec + 15,
          lastSeenSeconds: currentSec + 15,
          boundaryQuality: 'observed-only'
        };

        setOccurrences((prev) => {
          // Avoid duplicates around same timestamp
          const filtered = prev.filter((o) => Math.abs(o.approximateStartSeconds - currentSec) > 3);
          return [...filtered, newTrack].sort((a, b) => a.approximateStartSeconds - b.approximateStartSeconds);
        });

        setTimeout(() => setStatusMessage(''), 3000);
      }, 1000);
    }, 1000);
  };

  const handleClearTimeline = () => {
    setOccurrences([]);
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
            onIdentify={handleIdentify}
            statusMessage={statusMessage}
          />

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
