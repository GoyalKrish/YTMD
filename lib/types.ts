export type DiscoveryStatus =
  | 'idle'
  | 'requesting-permission'
  | 'capturing'
  | 'fingerprinting'
  | 'identifying'
  | 'listening'
  | 'stopped'
  | 'error';

export interface VideoPlaybackState {
  videoId: string | null;
  title: string | null;
  currentTime: number;
  duration: number | null;
  isPaused: boolean;
  playbackRate: number;
  isLive: boolean;
  pageUrl: string;
}

export interface RecordingMetadata {
  recordingId: string | null; // MusicBrainz recording ID when available
  acoustId: string | null;
  title: string;
  artists: string[];
  releaseTitle?: string;
  releaseId?: string;
  artworkUrl?: string;
  source: 'acoustid-musicbrainz';
}

export interface ObservedWindow {
  sampleStartSeconds: number;
  sampleEndSeconds: number;
  matchedAtEpochMs: number;
  acoustIdScore?: number;
}

export interface TrackOccurrence {
  id: string;
  trackKey: string;
  metadata: RecordingMetadata;
  observedWindows: ObservedWindow[];
  approximateStartSeconds: number;
  approximateEndSeconds: number | null;
  lastSeenSeconds: number;
  boundaryQuality: 'observed-only' | 'estimated';
}

export interface DiscoverySession {
  schemaVersion: 1;
  videoId: string;
  videoTitle: string;
  videoDuration: number | null;
  startedAtEpochMs: number;
  updatedAtEpochMs: number;
  status: DiscoveryStatus;
  occurrences: TrackOccurrence[];
  lastSampleStartSeconds?: number;
  lastErrorCode?: string;
}
