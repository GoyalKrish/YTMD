import { DiscoverySession } from './types';

const STORAGE_PREFIX = 'ytmd_session_';

export async function getSession(videoId: string): Promise<DiscoverySession | null> {
  if (!videoId) return null;
  const key = `${STORAGE_PREFIX}${videoId}`;
  const result = await chrome.storage.local.get(key);
  return result[key] || null;
}

export async function saveSession(session: DiscoverySession): Promise<void> {
  if (!session.videoId) return;
  const key = `${STORAGE_PREFIX}${session.videoId}`;
  await chrome.storage.local.set({ [key]: session });
}

export async function clearSession(videoId: string): Promise<void> {
  if (!videoId) return;
  const key = `${STORAGE_PREFIX}${videoId}`;
  await chrome.storage.local.remove(key);
}
