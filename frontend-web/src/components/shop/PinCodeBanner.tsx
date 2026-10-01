'use client';
import { useState } from 'react';
import { MapPin, Check, X } from 'lucide-react';

interface Props {
  pincode: string;
  onPincodeChange: (p: string) => void;
  pincodeInfo?: { is_serviceable: boolean; estimated_days: number; shipping_charge_paise: number } | null;
}

export default function PinCodeBanner({ pincode, onPincodeChange, pincodeInfo }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(pincode);

  const handleSave = () => {
    if (/^\d{6}$/.test(draft)) {
      onPincodeChange(draft);
      setEditing(false);
    }
  };

  if (!pincode && !editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="w-full mb-4 flex items-center gap-2 p-3 rounded-xl border border-dashed
                   border-brand-400 bg-brand-50 text-brand-700 text-sm hover:bg-brand-100"
      >
        <MapPin className="w-4 h-4" />
        Enter your pin code to check delivery availability
      </button>
    );
  }

  if (editing) {
    return (
      <div className="mb-4 flex items-center gap-2 p-3 rounded-xl border border-brand-400 bg-brand-50">
        <MapPin className="w-4 h-4 text-brand-600 flex-shrink-0" />
        <input
          autoFocus
          type="text"
          maxLength={6}
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="Enter 6-digit pin code"
          className="flex-1 bg-transparent text-sm outline-none text-brand-800 placeholder-brand-400"
        />
        <button onClick={handleSave} className="p-1 rounded-md hover:bg-brand-200 text-brand-700">
          <Check className="w-4 h-4" />
        </button>
        <button onClick={() => setEditing(false)} className="p-1 rounded-md hover:bg-brand-200 text-brand-700">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-center gap-2 p-3 rounded-xl border border-brand-200 bg-brand-50">
      <MapPin className="w-4 h-4 text-brand-600 flex-shrink-0" />
      <span className="text-sm text-brand-800 flex-1">
        Delivering to <strong>{pincode}</strong>
        {pincodeInfo?.is_serviceable && (
          <> · {pincodeInfo.estimated_days}–{pincodeInfo.estimated_days + 2} working days</>
        )}
        {pincodeInfo && !pincodeInfo.is_serviceable && (
          <span className="text-red-600 ml-2">Not serviceable</span>
        )}
      </span>
      <button onClick={() => { setDraft(pincode); setEditing(true); }}
        className="text-xs text-brand-600 hover:underline font-medium">
        Change
      </button>
    </div>
  );
}
