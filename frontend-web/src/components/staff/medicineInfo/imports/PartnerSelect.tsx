'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchImportPartners, importKeys } from '@/lib/medicineInfo/imports';

/** The partner whose items the drafts are matched through (Sprint 45). */
export default function PartnerSelect({ id, value, onChange, allLabel }: { id: string; value: string; onChange: (v: string) => void; allLabel?: string }) {
  const { data, isLoading } = useQuery({ queryKey: importKeys.partners, queryFn: fetchImportPartners });
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={isLoading}>
      <option value="">{allLabel ?? (isLoading ? 'Loading partners…' : 'Choose the partner')}</option>
      {data?.map((p) => (
        <option key={p.id} value={p.id}>{p.name} ({p.linked_items} linked items)</option>
      ))}
    </select>
  );
}
