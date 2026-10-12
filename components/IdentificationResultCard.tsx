import React, { useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, Music, Play } from 'lucide-react';
import { IdentificationResult } from '../lib/types';
import { formatTime } from '../lib/formatting';

interface IdentificationResultCardProps {
  result: IdentificationResult;
  onSeek: (seconds: number) => void;
}

export const IdentificationResultCard: React.FC<IdentificationResultCardProps> = ({ result, onSeek }) => {
  const [showDebug, setShowDebug] = useState(false);

  const isMatch = result.status === 'matched';
  const isNoMatch = result.status === 'no-match';
  const isError = result.status === 'error';
  const isCancelled = result.status === 'cancelled';

  const borderColor = isMatch
    ? 'var(--accent-emerald)'
    : isNoMatch
    ? 'var(--accent-amber, #f59e0b)'
    : 'var(--accent-red)';

  const Icon = isMatch ? CheckCircle2 : isNoMatch ? XCircle : AlertCircle;
  const iconColor = borderColor;

  const headingText = isMatch
    ? 'Match Found'
    : isNoMatch
    ? 'No Match Found'
    : isCancelled
    ? 'Cancelled'
    : 'Error';

  return (
    <div className="glass-card" style={{ borderLeft: `3px solid ${borderColor}` }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: borderColor }}>
          <Icon size={15} />
          <span>{headingText}</span>
        </div>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {formatTime(result.sampleStartSeconds)} – {formatTime(result.sampleEndSeconds)}
        </span>
      </div>

      {/* Match details */}
      {isMatch && result.track && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <Music size={18} color="var(--accent-emerald)" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                {result.track.title}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {result.track.artists.join(', ') || 'Unknown artist'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No-match / error message */}
      {(isNoMatch || isError || isCancelled) && result.message && (
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          {result.message}
        </div>
      )}

      {/* Debug toggle */}
      <div
        onClick={() => setShowDebug((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          fontSize: '10px',
          color: 'var(--text-muted)',
          padding: '4px 0',
          userSelect: 'none'
        }}
      >
        <span>Debug info</span>
        {showDebug ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </div>

      {showDebug && (
        <div
          style={{
            backgroundColor: 'rgba(0,0,0,0.3)',
            borderRadius: '6px',
            padding: '8px',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
            marginTop: '4px',
            lineHeight: 1.6
          }}
        >
          <div>captureId: {result.captureId}</div>
          <div>videoId: {result.videoId}</div>
          <div>sample: {formatTime(result.sampleStartSeconds)} – {formatTime(result.sampleEndSeconds)}</div>
          {result.track?.score !== undefined && (
            <div>acoustid score: {(result.track.score * 100).toFixed(1)}%</div>
          )}
          {result.track?.acoustId && (
            <div>acoustid: {result.track.acoustId}</div>
          )}
          {result.track?.recordingId && (
            <div>mbid: {result.track.recordingId}</div>
          )}
          {result.errorCode && <div>error: {result.errorCode}</div>}
        </div>
      )}

      {/* Jump to sample start */}
      <button
        className="btn-secondary"
        style={{ width: '100%', justifyContent: 'center', fontSize: '11px', marginTop: '8px' }}
        onClick={() => onSeek(result.sampleStartSeconds)}
      >
        <Play size={12} /> Jump to sample start ({formatTime(result.sampleStartSeconds)})
      </button>
    </div>
  );
};
