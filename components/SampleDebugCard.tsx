import React, { useState } from 'react';
import { Play, CheckCircle2, Fingerprint, ChevronDown, ChevronUp } from 'lucide-react';
import { CapturedSampleMeta } from '../lib/types';
import { formatTime } from '../lib/formatting';

interface SampleDebugCardProps {
  sample: CapturedSampleMeta;
  onSeek: (seconds: number) => void;
}

export const SampleDebugCard: React.FC<SampleDebugCardProps> = ({ sample, onSeek }) => {
  const [showFp, setShowFp] = useState(false);
  const sizeKb = (sample.blobSizeBytes / 1024).toFixed(1);

  return (
    <div className="glass-card" style={{ borderLeft: '3px solid var(--accent-emerald)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--accent-emerald)' }}>
          <CheckCircle2 size={15} />
          <span>Audio Sample Captured</span>
        </div>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Chromaprint Ready</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', marginBottom: '10px' }}>
        <div>
          <span style={{ color: 'var(--text-secondary)' }}>Video Window: </span>
          <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {formatTime(sample.startPlaybackSeconds)} - {formatTime(sample.endPlaybackSeconds)}
          </strong>
        </div>

        <div>
          <span style={{ color: 'var(--text-secondary)' }}>Duration: </span>
          <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {sample.sampleDurationSeconds}s
          </strong>
        </div>

        <div>
          <span style={{ color: 'var(--text-secondary)' }}>Sample Size: </span>
          <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {sizeKb} KB
          </strong>
        </div>

        <div>
          <span style={{ color: 'var(--text-secondary)' }}>Tab Audio: </span>
          <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>Audible</span>
        </div>
      </div>

      {sample.fingerprint && (
        <div style={{ marginBottom: '10px' }}>
          <div
            onClick={() => setShowFp(!showFp)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              fontSize: '11px',
              color: 'var(--accent-purple)',
              padding: '4px 0'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Fingerprint size={13} />
              <span>Chromaprint WASM Fingerprint</span>
            </div>
            {showFp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </div>

          {showFp && (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                wordBreak: 'break-all',
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                padding: '6px 8px',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
                maxHeight: '60px',
                overflowY: 'auto',
                marginTop: '4px'
              }}
            >
              {sample.fingerprint}
            </div>
          )}
        </div>
      )}

      <button
        className="btn-secondary"
        style={{ width: '100%', justifyContent: 'center', fontSize: '11px' }}
        onClick={() => onSeek(sample.startPlaybackSeconds)}
      >
        <Play size={12} /> Jump to sample start ({formatTime(sample.startPlaybackSeconds)})
      </button>
    </div>
  );
};
