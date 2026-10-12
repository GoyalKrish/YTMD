import {
  VideoPlaybackState,
  DiscoverySession,
  TrackOccurrence,
  CapturedSampleMeta,
  IdentificationResult
} from './types';

export type ExtensionMessage =
  // Content Script -> Background / Sidepanel
  | { type: 'YOUTUBE_PLAYER_STATE'; payload: VideoPlaybackState }
  | { type: 'YOUTUBE_NAVIGATED'; payload: { videoId: string | null; pageUrl: string } }

  // Sidepanel -> Content Script
  | { type: 'SEEK_TO_TIMESTAMP'; payload: { seconds: number } }
  | { type: 'REQUEST_PLAYER_STATE' }

  // Sidepanel -> Background (identification orchestration)
  | { type: 'IDENTIFY_SONG'; payload: { captureId: string; tabId: number; videoId: string; videoTitle: string | null; currentTime: number } }
  | { type: 'CANCEL_IDENTIFICATION'; payload: { captureId: string } }

  // Sidepanel -> Background (legacy helpers)
  | { type: 'GET_TAB_STREAM_ID'; payload: { tabId: number } }
  | { type: 'ENSURE_OFFSCREEN' }

  // Sidepanel / Background -> Offscreen
  | {
      type: 'START_CAPTURE';
      payload: {
        captureId: string;
        streamId: string;
        maxDurationSeconds: number;
        videoId: string;
        startPlaybackSeconds: number;
      };
    }
  | { type: 'STOP_CAPTURE' }
  | { type: 'CANCEL_CAPTURE'; payload?: { reason?: string } }

  // Offscreen -> Background
  | {
      type: 'CAPTURE_COMPLETE';
      payload: {
        captureId: string;
        fingerprint: string;
        durationSeconds: number;
        sampleStartSeconds: number;
        sampleEndSeconds: number;
        blobSizeBytes: number;
      };
    }
  | { type: 'CAPTURE_ERROR'; payload: { captureId: string; error: string } }

  // Offscreen -> Sidepanel (progress)
  | { type: 'CAPTURE_PROGRESS'; payload: { captureId: string; elapsedSeconds: number; maxDurationSeconds: number } }

  // Background -> Sidepanel (identification result)
  | { type: 'IDENTIFICATION_RESULT'; payload: IdentificationResult }

  // Background -> Sidepanel (status updates)
  | { type: 'IDENTIFICATION_STATUS'; payload: { captureId: string; stage: 'capturing' | 'fingerprinting' | 'identifying' } }

  // Internal shortcut trigger
  | { type: 'TRIGGER_CAPTURE_SHORTCUT' }

  // Background / Sidepanel state sync
  | { type: 'GET_SESSION'; payload: { videoId: string } }
  | { type: 'SESSION_UPDATED'; payload: DiscoverySession }
  | { type: 'TRACK_OCCURRENCE_DETECTED'; payload: TrackOccurrence };
