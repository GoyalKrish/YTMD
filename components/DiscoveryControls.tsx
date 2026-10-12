import React from 'react';
import { Sparkles, Loader2, Disc3 } from 'lucide-react';
import { DiscoveryStatus } from '../lib/types';

interface DiscoveryControlsProps {
  status: DiscoveryStatus;
  disabled: boolean;
  onIdentify: () => void;
  statusMessage?: string;
}

export const DiscoveryControls: React.FC<DiscoveryControlsProps> = ({
  status,
  disabled,
  onIdentify,
  statusMessage
}) => {
  const isBusy = status === 'capturing' || status === 'fingerprinting' || status === 'identifying';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <button
        className="btn-primary"
        onClick={onIdentify}
        disabled={disabled || isBusy}
      >
        {isBusy ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            <span>{status === 'capturing' ? 'Listening...' : 'Recognizing Track...'}</span>
          </>
        ) : (
          <>
            <Sparkles size={16} />
            <span>Identify this moment</span>
          </>
        )}
      </button>

      {statusMessage && (
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center' }}>
          {statusMessage}
        </div>
      )}
    </div>
  );
};
