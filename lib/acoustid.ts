/**
 * AcoustID Web Service integration.
 *
 * Endpoint:  https://api.acoustid.org/v2/lookup
 * Docs:      https://acoustid.org/webservice
 *
 * Rate limit guidance: ≤3 requests/second. This MVP issues one per user click.
 *
 * CLIENT_KEY is the application's own client key registered at
 * https://acoustid.org/new-application
 * It is a public client identifier (not a secret) and is safe to bundle
 * in a browser extension. Replace the placeholder below with your real key.
 */

export const ACOUSTID_CLIENT_KEY = '2SdmIhJ4B3'; // ← replace with your registered key

/** Minimum AcoustID score [0–1] we require to accept a candidate match. */
export const ACOUSTID_MIN_SCORE = 0.5;

// ---------------------------------------------------------------------------
// Raw API types (subset of what AcoustID actually returns)
// ---------------------------------------------------------------------------

interface AcoustIDArtist {
  id: string;
  name: string;
}

interface AcoustIDRecording {
  id: string;
  title?: string;
  artists?: AcoustIDArtist[];
  duration?: number;
}

interface AcoustIDCandidate {
  id: string;           // AcoustID identifier
  score: number;        // 0..1
  recordings?: AcoustIDRecording[];
}

interface AcoustIDResponse {
  status: string;       // 'ok' | 'error'
  error?: { code: number; message: string };
  results?: AcoustIDCandidate[];
}

// ---------------------------------------------------------------------------
// Normalized result
// ---------------------------------------------------------------------------

export interface AcoustIDMatch {
  acoustId: string;
  score: number;
  recordingId?: string;
  title?: string;
  artists?: string[];
}

export type AcoustIDLookupResult =
  | { outcome: 'matched'; match: AcoustIDMatch }
  | { outcome: 'no-match' }
  | { outcome: 'no-metadata'; acoustId: string; score: number }
  | { outcome: 'error'; code: 'network' | 'http' | 'api-error' | 'bad-response' | 'rate-limit'; message: string };

// ---------------------------------------------------------------------------
// Lookup implementation
// ---------------------------------------------------------------------------

/**
 * Sends a fingerprint to AcoustID and returns a normalized result.
 *
 * @param fingerprint  Compressed Chromaprint fingerprint string
 * @param durationSeconds  Duration of the audio sample in seconds (integer)
 */
export async function lookupAcoustID(
  fingerprint: string,
  durationSeconds: number
): Promise<AcoustIDLookupResult> {
  const url = 'https://api.acoustid.org/v2/lookup';
  const params = new URLSearchParams({
    client: ACOUSTID_CLIENT_KEY,
    format: 'json',
    duration: String(Math.round(durationSeconds)),
    fingerprint,
    meta: 'recordings'
  });

  let response: Response;
  try {
    response = await fetch(`${url}?${params.toString()}`);
  } catch (netErr: any) {
    return { outcome: 'error', code: 'network', message: netErr?.message || 'Network request failed' };
  }

  if (response.status === 429) {
    return { outcome: 'error', code: 'rate-limit', message: 'AcoustID rate limit hit (429)' };
  }

  if (!response.ok) {
    return {
      outcome: 'error',
      code: 'http',
      message: `AcoustID returned HTTP ${response.status}`
    };
  }

  let json: AcoustIDResponse;
  try {
    json = await response.json();
  } catch {
    return { outcome: 'error', code: 'bad-response', message: 'AcoustID response was not valid JSON' };
  }

  if (json.status !== 'ok') {
    const msg = json.error?.message || `AcoustID API error (status=${json.status})`;
    return { outcome: 'error', code: 'api-error', message: msg };
  }

  const results = json.results;
  if (!results || results.length === 0) {
    return { outcome: 'no-match' };
  }

  // Pick the highest-scoring candidate that has recording metadata with title + artist
  const sorted = [...results].sort((a, b) => b.score - a.score);

  for (const candidate of sorted) {
    if (candidate.score < ACOUSTID_MIN_SCORE) break;

    const recordings = candidate.recordings;
    if (!recordings || recordings.length === 0) continue;

    // Find first recording with both title and artists
    const rec = recordings.find((r) => r.title && r.artists && r.artists.length > 0);
    if (rec) {
      return {
        outcome: 'matched',
        match: {
          acoustId: candidate.id,
          score: candidate.score,
          recordingId: rec.id,
          title: rec.title!,
          artists: rec.artists!.map((a) => a.name)
        }
      };
    }

    // Candidate had metadata-less recordings — report it honestly
    if (recordings.length > 0) {
      return {
        outcome: 'no-metadata',
        acoustId: candidate.id,
        score: candidate.score
      };
    }
  }

  return { outcome: 'no-match' };
}
