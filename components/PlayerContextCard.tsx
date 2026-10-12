import { Play, Pause, Video, RotateCcw, RotateCw } from 'lucide-react';
import { VideoPlaybackState } from '../lib/types';
import { formatTime } from '../lib/formatting';

interface PlayerContextCardProps {
  playbackState: VideoPlaybackState;
  onSeek: (seconds: number) => void;
}

export const PlayerContextCard: React.FC<PlayerContextCardProps> = ({
  playbackState,
  onSeek
}) => {
  const { title, currentTime, duration, isPaused, videoId } = playbackState;

  const durationSec = duration || 0;
  const progressPercent = durationSec > 0 ? Math.min(100, (currentTime / durationSec) * 100) : 0;

  const handleSeekRelative = (delta: number) => {
    const target = Math.max(0, currentTime + delta);
    onSeek(target);
  };

  return (
    <div className="glass-card">
      <div className="video-context-header">
        <div className="video-thumb-placeholder">
          <Video size={22} />
        </div>
        <div className="video-info">
          <div className="video-title" title={title || 'YouTube Video'}>
            {title || (videoId ? `Video: ${videoId}` : 'Loading video...')}
          </div>
          <div className="video-subtext">
            {isPaused ? (
              <>
                <Pause size={12} /> Paused
              </>
            ) : (
              <>
                <Play size={12} className="pulse" /> Playing
              </>
            )}
            {videoId && <span>· ID: {videoId.slice(0, 8)}...</span>}
          </div>
        </div>
      </div>

      <div className="playback-progress-wrap">
        <div className="playback-time-labels">
          <span>{formatTime(currentTime)}</span>
          <span>{durationSec > 0 ? formatTime(durationSec) : '--:--'}</span>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="player-controls">
        <button
          className="btn-secondary"
          onClick={() => handleSeekRelative(-10)}
          title="Jump 10s backward"
        >
          <RotateCcw size={14} /> -10s
        </button>

        <button
          className="btn-secondary"
          onClick={() => handleSeekRelative(10)}
          title="Jump 10s forward"
        >
          <RotateCw size={14} /> +10s
        </button>
      </div>
    </div>
  );
};
