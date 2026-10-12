import { describe, it, expect } from 'vitest';
import { float32ToInt16, generateFingerprintFromPcm } from '../lib/fingerprint';

describe('float32ToInt16', () => {
  it('converts normalized float32 samples to 16-bit integer bounds', () => {
    const input = new Float32Array([-1.0, 0.0, 1.0, 0.5, -0.5]);
    const output = float32ToInt16(input);

    expect(output.length).toBe(5);
    expect(output[0]).toBe(-32768);
    expect(output[1]).toBe(0);
    expect(output[2]).toBe(32767);
    expect(output[3]).toBeCloseTo(16383, -1);
    expect(output[4]).toBeCloseTo(-16384, -1);
  });

  it('clamps out-of-range float values safely', () => {
    const input = new Float32Array([-2.5, 3.0]);
    const output = float32ToInt16(input);

    expect(output[0]).toBe(-32768);
    expect(output[1]).toBe(32767);
  });
});

describe('generateFingerprintFromPcm', () => {
  it('generates a valid compressed AcoustID fingerprint from synthetic sine audio', () => {
    const sampleRate = 11025;
    const channels = 1;
    const durationSec = 10;
    const totalSamples = sampleRate * durationSec;

    // Generate a 440 Hz concert pitch A sine wave
    const pcm = new Int16Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const val = Math.sin(2 * Math.PI * 440 * t);
      pcm[i] = Math.round(val * 32000);
    }

    const result = generateFingerprintFromPcm(sampleRate, channels, pcm);

    expect(result.durationSeconds).toBe(10);
    expect(result.sampleRate).toBe(11025);
    expect(typeof result.compressedFingerprint).toBe('string');
    expect(result.compressedFingerprint.length).toBeGreaterThan(10);
  });
});
