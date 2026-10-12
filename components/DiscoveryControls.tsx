import React from 'react';
import { Sparkles, XCircle, Mic, Search, Fingerprint, Loader2 } from 'lucide-react';
import { DiscoveryStatus } from '../lib/types';

interface DiscoveryControlsProps {
  status: DiscoveryStatus;
  disabled: boolean;
  onIdentify: () => void;
  onCancel: () => void;
  elapsedSeconds?: number;
  maxSeconds?: number;
  statusMessage?: string;
}

const STATUS_LABEL: Record<DiscoveryStatus, string> = {
  idle: '',
  'requesting-permission': 'Starting capture...',
  capturing: '',           // shown inline with progress
  fingerprinting: 'Generating fingerprint...',
  identifying: 'Checking AcoustID...',
  matched: '',
  'no-match': '',
  error: ''
};

export const DiscoveryControls: React.FC<DiscoveryControlsProps> = ({
  status,
  disabled,
  onIdentify,
  onCancel,
  elapsedSeconds = 0,
  maxSeconds = 15,
  statusMessage
}) => {
  const isBusy =
    status === 'requesting-permission' ||
    status === 'capturing' ||
    status === 'fingerprinting' ||
    status === 'identifying';

  // ------------------------------------------------------------------
  // Capturing — show progress bar + cancel
  // ------------------------------------------------------------------
  if (status === 'capturing') {
    const progressPercent = Math.min(100, (elapsedSeconds / maxSeconds) * 100);

    return (
      <div className="glass-card" style={{ borderColor: 'rgba(255, 42, 95, 0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
            <Mic size={16} className="pulse" color="var(--accent-red)" />
            <span>Capturing audio...</span>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
            {elapsedSeconds}s / {maxSeconds}s
          </span>
        </div>

        <div className="progress-track" style={{ marginBottom: '12px', height: '6px' }}>
          <div
            className="progress-fill"
            style={{ width: `${progressPercent}%`, transition: 'width 0.8s linear' }}
          />
        </div>

        <button
          className="btn-secondary"
          style={{ width: '100%', justifyContent: 'center', fontSize: '12px' }}
          onClick={onCancel}
        >
          <XCircle size={14} /> Cancel
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Fingerprinting or Identifying — spinner + stage label
  // ------------------------------------------------------------------
  if (status === 'fingerprinting' || status === 'identifying') {
    const Icon = status === 'fingerprinting' ? Fingerprint : Search;
    const label = status === 'fingerprinting' ? 'Generating fingerprint...' : 'Checking AcoustID...';

    return (
      <div className="glass-card" style={{ borderColor: 'rgba(124, 58, 237, 0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 600 }}>
          <Loader2 size={16} className="spin" color="var(--accent-purple)" />
          <Icon size={15} color="var(--accent-purple)" />
          <span>{label}</span>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Default — Identify button
  // ------------------------------------------------------------------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <button
        id="identify-song-btn"
        className="btn-primary"
        onClick={onIdentify}
        disabled={disabled || isBusy}
      >
        <Sparkles size={16} />
        <span>Identify current song</span>
      </button>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          fontSize: '10px',
          color: 'var(--text-muted)'
        }}
      >
        <span>Shortcut:</span>
        <kbd
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '4px',
            padding: '1px 5px',
            fontSize: '9px',
            fontFamily: 'var(--font-mono)'
          }}
        >
          Alt + Shift + S
        </kbd>
      </div>

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
