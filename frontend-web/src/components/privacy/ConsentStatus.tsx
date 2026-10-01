'use client';
import { describeNotice, PURPOSE_LABELS, type Consents } from '@/lib/privacy/api';
import ConsentToggleRow from './ConsentToggleRow';
import { formatDateTimeIST } from '@/lib/dates';

const OPTIONAL = ['marketing', 'whatsapp'];

/**
 * Current consent per purpose. Marketing and WhatsApp updates (Sprint 13) are
 * optional and can be withdrawn as easily as given (C-40, C-42).
 */
export default function ConsentStatus({ consents }: { consents: Consents }) {
  const find = (p: string) => consents.current.find((c) => c.purpose === p);
  const others = consents.current.filter((c) => !OPTIONAL.includes(c.purpose));

  return (
    <div className="card mb-4">
      <h2 className="font-semibold text-sm">Your consents</h2>
      <ConsentToggleRow
        purpose="marketing"
        record={find('marketing')}
        note="order and prescription messages are always sent"
        onText="You will receive offers and health tips"
        offText="Marketing messages turned off"
      />
      <ConsentToggleRow
        purpose="whatsapp"
        record={find('whatsapp')}
        note="you can turn this off any time; SMS updates continue either way"
        onText="Order and refill updates will also come on WhatsApp"
        offText="WhatsApp updates turned off"
      />
      <ul className="text-sm pt-2 space-y-1">
        {others.map((c) => (
          <li key={c.purpose} className="flex justify-between gap-3">
            <span>{PURPOSE_LABELS[c.purpose] ?? c.purpose.replace(/_/g, ' ')}</span>
            <span className="text-xs text-gray-500">
              {c.granted ? 'Yes' : 'No'} · {formatDateTimeIST(c.recorded_at)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-400 mt-2">{describeNotice(consents.policy_version, consents.notice_language)}</p>
    </div>
  );
}
