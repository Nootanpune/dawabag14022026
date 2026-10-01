'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Video, Phone, MessageSquare } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import { MODE_LABELS } from '@/lib/telemedicine/labels';
import type { JoinInfo } from '@/lib/telemedicine/types';
import { tokenNotice } from '@/lib/telemedicine/callToken';
import { canStartCall } from '@/lib/telemedicine/callStatus';

// The Agora SDK needs the browser: never part of the server render (Sprint 14)
const CallRoom = dynamic(() => import('../call/CallRoom'), { ssr: false });

const ICONS = { video: Video, audio: Phone, text: MessageSquare };

/**
 * Call details from GET /consultations/:id/join. For a video or audio
 * consultation with a server-issued token the call opens full screen and joins
 * `channel` as the user account `uid` with `token` (Sprint 13/14, C-23). A
 * missing token (provider not configured) is explained and no call starts; chat
 * consultations keep the plain room details.
 */
export default function JoinDialog({ consultationId, info, onClose }: { consultationId: string; info: JoinInfo; onClose: () => void }) {
  const [inCall, setInCall] = useState(false);
  const Icon = ICONS[info.mode] ?? Video;
  const notice = tokenNotice(info);
  const callable = canStartCall(info);

  if (inCall) return <CallRoom consultationId={consultationId} info={info} onClose={onClose} />;

  return (
    <Modal title="Consultation room" onClose={onClose}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center">
          <Icon className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <p className="font-medium">{MODE_LABELS[info.mode] ?? info.mode}</p>
          <p className="text-xs text-gray-500">Joining as {info.role}</p>
        </div>
      </div>
      <dl className="text-sm grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 mb-4">
        <dt className="text-gray-500">Channel</dt>
        <dd className="font-mono text-xs break-all">{info.channel}</dd>
        <dt className="text-gray-500">App</dt>
        <dd className="font-mono text-xs break-all">{info.app_id ?? 'not configured'}</dd>
      </dl>
      <p
        role={notice.ok ? undefined : 'alert'}
        className={`text-xs rounded-lg p-2.5 mb-3 border ${notice.ok ? 'text-green-800 bg-green-50 border-green-200' : 'text-amber-800 bg-amber-50 border-amber-200'}`}
      >
        {notice.text}
      </p>
      {info.mode === 'text' ? (
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
          The chat window opens here. Keep this page open; the in-browser chat is being added and will connect to this channel automatically.
        </p>
      ) : (
        callable && (
          <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
            Your browser will ask to use your {info.mode === 'video' ? 'camera and microphone' : 'microphone'}. The call is private between you
            and the {info.role === 'doctor' ? 'patient' : 'doctor'} and is not recorded.
          </p>
        )
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="btn-outline text-sm">
          Close
        </button>
        {callable && (
          <button onClick={() => setInCall(true)} className="btn-primary text-sm inline-flex items-center gap-1.5">
            <Icon className="w-4 h-4" /> {info.mode === 'video' ? 'Start video call' : 'Start audio call'}
          </button>
        )}
      </div>
    </Modal>
  );
}
