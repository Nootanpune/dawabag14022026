'use client';
import { Thermometer } from 'lucide-react';
import type { ColdChainValues } from '@/lib/fulfilment/handover';

/** Pack temperature + logger ID, required at dispatch for cold-chain shipments (C-25). */
export default function ColdChainFields({ value, onChange }: { value: ColdChainValues; onChange: (v: ColdChainValues) => void }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-3">
      <p className="text-xs text-blue-800 flex items-center gap-1">
        <Thermometer className="w-4 h-4" /> Cold-chain pack — it must leave at 2–8 °C with a temperature logger.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Pack temperature (°C)</span>
          <input
            value={value.temp}
            onChange={(e) => onChange({ ...value, temp: e.target.value })}
            inputMode="decimal"
            placeholder="2–8"
            className="input"
          />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Logger / pack ID</span>
          <input value={value.logger} onChange={(e) => onChange({ ...value, logger: e.target.value })} maxLength={60} className="input" />
        </label>
      </div>
    </div>
  );
}
