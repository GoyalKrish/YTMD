import React from 'react';
import { Music2 } from 'lucide-react';

interface DiscoveryHeaderProps {
  isConnected: boolean;
}

export const DiscoveryHeader: React.FC<DiscoveryHeaderProps> = ({ isConnected }) => {
  return (
    <header className="app-header">
      <div className="logo-group">
        <div className="logo-icon">
          <Music2 size={18} />
        </div>
        <div>
          <h1 className="logo-title">YT Music Discovery</h1>
          <p className="logo-subtitle">YouTube Companion</p>
        </div>
      </div>

      <div className={`status-badge ${isConnected ? 'status-connected' : 'status-disconnected'}`}>
        <span className="status-dot"></span>
        <span>{isConnected ? 'Connected' : 'No Player'}</span>
      </div>
    </header>
  );
};
