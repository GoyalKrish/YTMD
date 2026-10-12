import React from 'react';
import { Sparkles, Square, XCircle, Mic } from 'lucide-react';
import { DiscoveryStatus } from '../lib/types';

interface DiscoveryControlsProps {
  status: DiscoveryStatus;
  disabled: boolean;
  onStartCapture: () => void;
  onStopCapture: () => void;
  onCancelCapture: () => void;
  elapsedSeconds?: number;
  maxSeconds?: number;
  statusMessage?: string;
}

export const DiscoveryControls: React.FC<DiscoveryControlsProps> = ({
  status,
  disabled,
  onStartCapture,
  onStopCapture,
  onCancelCapture,
  elapsedSeconds = 0,
  maxSeconds = 15,
  statusMessage
}) => {
  const isCapturing = status === 'capturing';

  if (isCapturing) {
    const progressPercent = Math.min(100, (elapsedSeconds / maxSeconds) * 100);

    return (
      <div className="glass-card" style={{ borderColor: 'rgba(255, 42, 95, 0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
            <Mic size={16} className="pulse" color="var(--accent-red)" />
            <span>Sampling Tab Audio...</span>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
            {elapsedSeconds}s / {maxSeconds}s
          </span>
        </div>

        <div className="progress-track" style={{ marginBottom: '12px', height: '6px' }}>
          <div
            className="progress-fill"
            style={{
              width: `${progressPercent}%`,
              transition: 'width 0.8s linear'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn-primary"
            style={{ flex: 1, padding: '8px 12px', fontSize: '12px' }}
            onClick={onStopCapture}
            title="Finish sample now"
          >
            <Square size={13} /> Finish Sample
          </button>
          <button
            className="btn-secondary"
            style={{ padding: '8px 12px', fontSize: '12px' }}
            onClick={onCancelCapture}
            title="Discard current sample"
          >
            <XCircle size={14} /> Cancel
          </button>
        </div>

        {statusMessage && (
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '8px' }}>
            {statusMessage}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <button
        className="btn-primary"
        onClick={onStartCapture}
        disabled={disabled || status === 'requesting-permission'}
      >
        <Sparkles size={16} />
        <span>Capture 15s Sample & Identify</span>
      </button>

      {statusMessage && (
        <div
          style={{
            fontSize: '11px',
            color: status === 'error' ? 'var(--accent-red)' : 'var(--text-secondary)',
            textAlign: 'center'
          }}
        >
          {statusMessage}
        </div>
      )}
    </div>
  );
};
