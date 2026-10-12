import React from 'react';
import { Music, Play } from 'lucide-react';
import { TrackOccurrence } from '../lib/types';
import { formatTime } from '../lib/formatting';

interface TrackTimelineProps {
  occurrences: TrackOccurrence[];
  onSeek: (seconds: number) => void;
}

export const TrackTimeline: React.FC<TrackTimelineProps> = ({ occurrences, onSeek }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div className="section-header">
        <span className="section-title">Music Timeline</span>
        <span className="badge-count">{occurrences.length} tracks</span>
      </div>

      <div className="timeline-list">
        {occurrences.map((track) => (
          <div
            key={track.id}
            className="track-row"
            onClick={() => onSeek(track.approximateStartSeconds)}
            title="Click to jump to this moment in video"
          >
            <div className="track-artwork">
              {track.metadata.artworkUrl ? (
                <img src={track.metadata.artworkUrl} alt={track.metadata.title} />
              ) : (
                <Music size={18} />
              )}
            </div>

            <div className="track-meta">
              <div className="track-title">{track.metadata.title}</div>
              <div className="track-artist">
                {track.metadata.artists.length > 0
                  ? track.metadata.artists.join(', ')
                  : 'Unknown Artist'}
              </div>
            </div>

            <div className="track-timestamp-badge">
              <Play size={10} />
              <span>{formatTime(track.approximateStartSeconds)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
