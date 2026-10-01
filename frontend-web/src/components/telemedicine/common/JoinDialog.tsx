'use client';
import { Video, Phone, MessageSquare } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import { MODE_LABELS } from '@/lib/telemedicine/labels';
import type { JoinInfo } from '@/lib/telemedicine/types';
import { tokenNotice } from '@/lib/telemedicine/callToken';

const ICONS = { video: Video, audio: Phone, text: MessageSquare };

/**
 * Call details from GET /consultations/:id/join. The video / audio client opens
 * here once it is integrated; it will join `channel` as `uid` with `token`
 * (Sprint 13, C-23). No video SDK is wired in the web app yet, so the token's
 * validity is shown and a missing token (provider not configured) is explained.
 */
export default function JoinDialog({ info, onClose }: { info: JoinInfo; onClose: () => void }) {
  const Icon = ICONS[info.mode] ?? Video;
  const notice = tokenNotice(info);
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
      <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
        The {info.mode === 'text' ? 'chat' : `${info.mode} call`} window opens here. Keep this page open; the in-browser call client is being
        added and will connect to this channel automatically.
      </p>
      <div className="flex justify-end mt-4">
        <button onClick={onClose} className="btn-outline text-sm">
          Close
        </button>
      </div>
    </Modal>
  );
}
