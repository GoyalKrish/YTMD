import { describe, it, expect } from 'vitest';
import { formatTime, formatTimeRange } from '../lib/formatting';

describe('formatTime', () => {
  it('formats zero and negative numbers safely', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(-10)).toBe('00:00');
    expect(formatTime(null)).toBe('00:00');
    expect(formatTime(undefined)).toBe('00:00');
  });

  it('formats MM:SS correctly', () => {
    expect(formatTime(5)).toBe('00:05');
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(600)).toBe('10:00');
    expect(formatTime(3599)).toBe('59:59');
  });

  it('formats HH:MM:SS for durations over an hour', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3665)).toBe('1:01:05');
    expect(formatTime(7325)).toBe('2:02:05');
  });
});

describe('formatTimeRange', () => {
  it('formats single point detection', () => {
    expect(formatTimeRange(65, null)).toBe('01:05 · detected');
  });

  it('formats bounded interval', () => {
    expect(formatTimeRange(65, 85)).toBe('01:05 - 01:25');
  });
});
