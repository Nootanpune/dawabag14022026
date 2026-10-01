'use client';
// Full-screen consultation call (Sprint 14). Loaded with next/dynamic (ssr: false)
// because the Agora SDK runs only in the browser.
// C-23: only the patient and the consultation's doctor hold tokens for this
// channel; the call is never recorded.
import { useAgoraCall } from '@/lib/telemedicine/useAgoraCall';
import { MODE_LABELS } from '@/lib/telemedicine/labels';
import type { JoinInfo } from '@/lib/telemedicine/types';
import CallStage from './CallStage';
import CallControls from './CallControls';
import CallStatusLine from './CallStatusLine';

interface Props {
  consultationId: string;
  info: JoinInfo;
  /** close the room (after leaving) */
  onClose: () => void;
}

export default function CallRoom({ consultationId, info, onClose }: Props) {
  const call = useAgoraCall(consultationId, info);
  const withVideo = info.mode === 'video';
  const over = call.status === 'ended' || call.status === 'error';

  return (
    <div role="dialog" aria-modal="true" aria-label="Consultation call" className="fixed inset-0 z-[60] bg-gray-950 flex flex-col p-3 sm:p-4">
      <div className="flex items-center justify-between text-white pb-2">
        <p className="text-sm font-medium">{MODE_LABELS[info.mode]} consultation</p>
        <p className="text-[11px] text-gray-400">Private between patient and doctor · not recorded</p>
      </div>
      <CallStage role={info.role} withVideo={withVideo} localVideo={call.localVideo} remoteVideo={call.remoteVideo} camOn={call.camOn} />
      <CallStatusLine status={call.status} role={info.role} message={call.message} />
      {over ? (
        <div className="flex justify-center py-4">
          <button onClick={onClose} className="btn-outline text-sm bg-white">
            Close
          </button>
        </div>
      ) : (
        <CallControls
          withVideo={withVideo}
          micOn={call.micOn}
          camOn={call.camOn}
          disabled={call.status === 'connecting'}
          onToggleMic={call.toggleMic}
          onToggleCam={call.toggleCam}
          onLeave={() => void call.leave().then(onClose)}
        />
      )}
    </div>
  );
}
