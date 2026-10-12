import { fingerprintFromSamples, Fingerprinter } from 'rusty-chromaprint-wasm';

export interface FingerprintResult {
  compressedFingerprint: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
}

/**
 * Converts Float32Array PCM samples [-1.0, 1.0] to 16-bit signed PCM Int16Array [-32768, 32767]
 */
export function float32ToInt16(samples: Float32Array): Int16Array {
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16;
}

/**
 * Generates an AcoustID-compatible Chromaprint fingerprint from raw 16-bit PCM samples
 */
export function generateFingerprintFromPcm(
  sampleRate: number,
  channels: number,
  pcmSamples: Int16Array
): FingerprintResult {
  const result = fingerprintFromSamples(sampleRate, channels, pcmSamples);
  const durationSeconds = Math.round(pcmSamples.length / (sampleRate * channels));

  return {
    compressedFingerprint: result.compressed,
    durationSeconds,
    sampleRate,
    channels
  };
}

/**
 * Decodes an audio blob/ArrayBuffer into PCM and computes its Chromaprint fingerprint
 */
export async function computeAudioBlobFingerprint(audioBlob: Blob): Promise<FingerprintResult> {
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioCtx = new AudioContext();

  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const sampleRate = audioBuffer.sampleRate;
    const channels = 1; // Chromaprint AcoustID works best with mono
    const channelData = audioBuffer.getChannelData(0);

    const int16Samples = float32ToInt16(channelData);
    const result = generateFingerprintFromPcm(sampleRate, channels, int16Samples);

    return result;
  } finally {
    if (audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
    }
  }
}
