export type DiscoveryStatus =
  | 'idle'
  | 'requesting-permission'
  | 'capturing'
  | 'fingerprinting'
  | 'identifying'
  | 'matched'
  | 'no-match'
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

export interface CapturedSampleMeta {
  videoId: string;
  startPlaybackSeconds: number;
  endPlaybackSeconds: number;
  sampleDurationSeconds: number;
  blobSizeBytes: number;
  mimeType: string;
  capturedAtEpochMs: number;
  fingerprint?: string;
  fingerprintDurationSeconds?: number;
}

/** Normalized identification result returned to the side panel */
export type IdentificationErrorCode =
  | 'NO_ACTIVE_YOUTUBE_VIDEO'
  | 'VIDEO_PAUSED'
  | 'VIDEO_IS_LIVE'
  | 'CAPTURE_PERMISSION_DENIED'
  | 'CAPTURE_FAILED'
  | 'CAPTURE_INTERRUPTED'
  | 'FINGERPRINT_FAILED'
  | 'ACOUSTID_REQUEST_FAILED'
  | 'ACOUSTID_BAD_RESPONSE'
  | 'NO_MATCH'
  | 'METADATA_UNAVAILABLE'
  | 'TIMEOUT';

export interface IdentificationResult {
  captureId: string;
  videoId: string;
  videoTitle: string | null;
  sampleStartSeconds: number;
  sampleEndSeconds: number;
  status: 'matched' | 'no-match' | 'error' | 'cancelled';
  track?: {
    title: string;
    artists: string[];
    recordingId?: string;
    acoustId?: string;
    score?: number;
  };
  errorCode?: IdentificationErrorCode;
  message?: string;
}

// Legacy types kept for existing timeline/session code (not used in new identify flow)
export interface RecordingMetadata {
  recordingId: string | null;
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
