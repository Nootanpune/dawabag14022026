'use client';
import { ONLINE_SALE_LABELS, type OnlineSaleChange, type OnlineSaleStatus } from '@/lib/onlineSale/api';

interface Props {
  value: OnlineSaleChange;
  onChange: (v: OnlineSaleChange) => void;
  /** only a pharmacist may choose "Allowed online" */
  canAllow: boolean;
  idPrefix: string;
  /** e.g. the draft form offers "allowed" and "not yet" only */
  statuses?: OnlineSaleStatus[];
}

/**
 * The choice and its evidence: allowing needs a dated notification / approval reference
 * (pharmacist only); stopping needs a reason. Shared by the staff screen and the
 * pharmacist's new-product form (Sprint 39, C-10).
 */
export default function OnlineSaleFields({ value, onChange, canAllow, idPrefix, statuses = ['permitted', 'restricted', 'prohibited'] }: Props) {
  const set = (patch: Partial<OnlineSaleChange>) => onChange({ ...value, ...patch });
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-gray-800">Online sale</legend>
      <div role="radiogroup" className="flex flex-wrap gap-3">
        {statuses.map((s) => (
          <label key={s} className={`text-sm inline-flex items-center gap-1.5 ${s === 'permitted' && !canAllow ? 'text-gray-400' : ''}`}>
            <input type="radio" name={`${idPrefix}-status`} value={s} checked={value.status === s}
              disabled={s === 'permitted' && !canAllow} onChange={() => set({ status: s })} />
            {ONLINE_SALE_LABELS[s]}
          </label>
        ))}
      </div>
      {!canAllow && statuses.includes('permitted') && <p className="text-xs text-gray-600">Only a Dawabag pharmacist can allow a product for online sale.</p>}
      {value.status === 'permitted' ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
          <div>
            <label htmlFor={`${idPrefix}-ref`} className="block text-xs font-medium text-gray-700">Notification / approval reference</label>
            <input id={`${idPrefix}-ref`} className="input" value={value.notification_ref ?? ''} maxLength={200}
              placeholder="e.g. rule or Gazette reference" onChange={(e) => set({ notification_ref: e.target.value })} />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-date`} className="block text-xs font-medium text-gray-700">Date of the notification</label>
            <input id={`${idPrefix}-date`} type="date" className="input" value={value.notification_date ?? ''} onChange={(e) => set({ notification_date: e.target.value })} />
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <div>
            <label htmlFor={`${idPrefix}-reason`} className="block text-xs font-medium text-gray-700">Why it is not allowed online</label>
            <input id={`${idPrefix}-reason`} className="input" value={value.reason ?? ''} maxLength={1000} onChange={(e) => set({ reason: e.target.value })} />
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
            <div>
              <label htmlFor={`${idPrefix}-ref`} className="block text-xs font-medium text-gray-700">Notification reference (if any)</label>
              <input id={`${idPrefix}-ref`} className="input" value={value.notification_ref ?? ''} maxLength={200} onChange={(e) => set({ notification_ref: e.target.value })} />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-date`} className="block text-xs font-medium text-gray-700">Its date (if any)</label>
              <input id={`${idPrefix}-date`} type="date" className="input" value={value.notification_date ?? ''} onChange={(e) => set({ notification_date: e.target.value })} />
            </div>
          </div>
        </div>
      )}
    </fieldset>
  );
}
