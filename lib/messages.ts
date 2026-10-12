import { VideoPlaybackState, DiscoverySession, TrackOccurrence } from './types';

export type ExtensionMessage =
  // Content Script -> Background / Sidepanel
  | { type: 'YOUTUBE_PLAYER_STATE'; payload: VideoPlaybackState }
  | { type: 'YOUTUBE_NAVIGATED'; payload: { videoId: string | null; pageUrl: string } }
  
  // Sidepanel -> Content Script
  | { type: 'SEEK_TO_TIMESTAMP'; payload: { seconds: number } }
  | { type: 'REQUEST_PLAYER_STATE' }

  // Sidepanel / Background -> Offscreen
  | { type: 'START_CAPTURE'; payload: { streamId: string; maxDurationSeconds: number } }
  | { type: 'STOP_CAPTURE' }

  // Offscreen -> Background / Sidepanel
  | { type: 'CAPTURE_PROGRESS'; payload: { elapsedSeconds: number } }
  | { type: 'CAPTURE_COMPLETE'; payload: { sampleBlob: Blob; durationSeconds: number } }
  | { type: 'CAPTURE_ERROR'; payload: { error: string } }

  // Background / Sidepanel state sync
  | { type: 'GET_SESSION'; payload: { videoId: string } }
  | { type: 'SESSION_UPDATED'; payload: DiscoverySession }
  | { type: 'TRACK_OCCURRENCE_DETECTED'; payload: TrackOccurrence };
