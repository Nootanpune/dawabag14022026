'use client';
import { Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';

interface Props {
  withVideo: boolean;
  micOn: boolean;
  camOn: boolean;
  disabled: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onLeave: () => void;
}

const round = 'w-12 h-12 rounded-full flex items-center justify-center transition-colors disabled:opacity-40';

/** Mute microphone, turn camera off, leave. */
export default function CallControls({ withVideo, micOn, camOn, disabled, onToggleMic, onToggleCam, onLeave }: Props) {
  return (
    <div className="flex items-center justify-center gap-4 py-4">
      <button
        onClick={onToggleMic}
        disabled={disabled}
        aria-pressed={!micOn}
        aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
        className={`${round} ${micOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-white text-gray-900'}`}
      >
        {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </button>
      {withVideo && (
        <button
          onClick={onToggleCam}
          disabled={disabled}
          aria-pressed={!camOn}
          aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
          className={`${round} ${camOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-white text-gray-900'}`}
        >
          {camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>
      )}
      <button onClick={onLeave} aria-label="Leave call" className={`${round} bg-red-600 text-white hover:bg-red-700`}>
        <PhoneOff className="w-5 h-5" />
      </button>
    </div>
  );
}
