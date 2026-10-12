import { VideoPlaybackState, DiscoverySession, TrackOccurrence, CapturedSampleMeta } from './types';

export type ExtensionMessage =
  // Content Script -> Background / Sidepanel
  | { type: 'YOUTUBE_PLAYER_STATE'; payload: VideoPlaybackState }
  | { type: 'YOUTUBE_NAVIGATED'; payload: { videoId: string | null; pageUrl: string } }
  
  // Sidepanel -> Content Script
  | { type: 'SEEK_TO_TIMESTAMP'; payload: { seconds: number } }
  | { type: 'REQUEST_PLAYER_STATE' }

  // Sidepanel -> Background
  | { type: 'GET_TAB_STREAM_ID'; payload: { tabId: number } }
  | { type: 'ENSURE_OFFSCREEN' }

  // Sidepanel / Background -> Offscreen
  | {
      type: 'START_CAPTURE';
      payload: {
        streamId: string;
        maxDurationSeconds: number;
        videoId: string;
        startPlaybackSeconds: number;
      };
    }
  | { type: 'STOP_CAPTURE' }
  | { type: 'CANCEL_CAPTURE'; payload?: { reason?: string } }

  // Offscreen -> Background / Sidepanel
  | { type: 'CAPTURE_PROGRESS'; payload: { elapsedSeconds: number; maxDurationSeconds: number } }
  | { type: 'CAPTURE_COMPLETE'; payload: { metadata: CapturedSampleMeta } }
  | { type: 'CAPTURE_ERROR'; payload: { error: string } }

  // Background / Sidepanel state sync
  | { type: 'GET_SESSION'; payload: { videoId: string } }
  | { type: 'SESSION_UPDATED'; payload: DiscoverySession }
  | { type: 'TRACK_OCCURRENCE_DETECTED'; payload: TrackOccurrence };
