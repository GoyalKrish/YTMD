import React from 'react';
import { Video, Music } from 'lucide-react';

interface EmptyStateProps {
  type: 'no-youtube' | 'no-tracks';
}

export const EmptyState: React.FC<EmptyStateProps> = ({ type }) => {
  if (type === 'no-youtube') {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <Video size={26} />
        </div>
        <div className="empty-state-title">No YouTube Video Active</div>
        <div className="empty-state-desc">
          Navigate to any YouTube video watch page to start discovering music playing in the video.
        </div>
      </div>
    );
  }

  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Music size={26} />
      </div>
      <div className="empty-state-title">No Music Discovered Yet</div>
      <div className="empty-state-desc">
        Click <strong>Identify this moment</strong> while music is playing to detect the track and build your timeline.
      </div>
    </div>
  );
};
