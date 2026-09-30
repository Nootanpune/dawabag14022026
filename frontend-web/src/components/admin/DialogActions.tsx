'use client';
import { Loader2 } from 'lucide-react';

interface Props {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  pending?: boolean;
  danger?: boolean;
  error?: string;
}

/** Error line + Cancel / Confirm buttons used at the foot of dialogs. */
export default function DialogActions({ onCancel, onConfirm, confirmLabel, pending, danger, error }: Props) {
  return (
    <>
      {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onCancel} className="btn-outline text-sm">
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className={
            danger
              ? 'bg-red-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2'
              : 'btn-primary text-sm inline-flex items-center gap-2'
          }
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />} {confirmLabel}
        </button>
      </div>
    </>
  );
}
