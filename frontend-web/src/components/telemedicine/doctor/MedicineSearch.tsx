'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { doctorKeys, searchMedicines } from '@/lib/telemedicine/doctorApi';
import { teleListShort } from '@/lib/telemedicine/labels';
import type { MedicineHit } from '@/lib/telemedicine/types';

/** Catalogue search for one prescription row; shows each medicine's TPG list (C-23). */
export default function MedicineSearch({ onPick }: { onPick: (m: MedicineHit) => void }) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const { data, isFetching } = useQuery({
    queryKey: doctorKeys.medicines(q),
    queryFn: () => searchMedicines(q),
    enabled: q.length >= 2,
  });
  return (
    <div className="relative">
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search medicine" className="input pl-8" />
        {isFetching && <Loader2 className="w-4 h-4 animate-spin text-gray-300 absolute right-2.5 top-1/2 -translate-y-1/2" />}
      </div>
      {q.length >= 2 && !!data && (
        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow max-h-64 overflow-y-auto text-sm">
          {!data.length && <li className="px-3 py-2 text-gray-400">No match</li>}
          {data.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(m);
                  setText('');
                  setQ('');
                }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50"
              >
                <span className="font-medium">{m.name}</span>
                {m.generic_name && <span className="text-gray-500"> · {m.generic_name}</span>}
                <span className="block text-xs text-gray-400">
                  {m.drug_schedule ?? 'OTC'}
                   · {teleListShort(m.telemedicine_list)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
