'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Modal from '@/components/admin/Modal';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { DISPOSITION_LABELS, decideExcursion, dispositionProblem, gdpKeys, type Disposition, type PendingExcursion } from '@/lib/gdp/api';
import { fetchPartnerPharmacists, partnerKeys } from '@/lib/partner/api';

const CHOICES: Disposition[] = ['release', 'quarantine', 'destroy'];

/**
 * A pharmacist's decision on a cold-chain excursion (Sprint 40, C-25). Staff: the signed-in
 * Dawabag pharmacist (registration checked by the server). Partner portal: the partner names
 * one of its registered pharmacists, as for the shipment check.
 */
export default function DispositionDialog({ portal, excursion, onClose }: { portal: boolean; excursion: PendingExcursion; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [d, setD] = useState<Disposition>('release');
  const [justification, setJustification] = useState('');
  const [pharmacist, setPharmacist] = useState('');
  const pharmacists = useQuery({ queryKey: [...partnerKeys.all, 'pharmacists'], queryFn: fetchPartnerPharmacists, enabled: portal });
  const problem = dispositionProblem(d, justification) ?? (portal && !pharmacist ? 'Choose the pharmacist who decides.' : null);
  const save = useMutation({
    mutationFn: () => decideExcursion(portal, excursion.id, { disposition: d, justification: justification.trim(), ...(portal ? { vendor_pharmacist_id: pharmacist } : {}) }),
    onSuccess: (r) => { toast.success(r.message); queryClient.invalidateQueries({ queryKey: gdpKeys.all }); onClose(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not record the decision')),
  });
  return (
    <Modal title={`Excursion: ${excursion.product_name} batch ${excursion.batch_number}`} onClose={onClose} size="lg">
      <p className="text-sm text-gray-700 mb-3">{excursion.notes}{excursion.temperature_c !== null ? ` (${excursion.temperature_c} °C)` : ''}</p>
      <fieldset className="mb-3">
        <legend className="text-sm font-medium text-gray-700 mb-1">Decision</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {CHOICES.map((c) => (
            <label key={c} className="flex items-center gap-1.5"><input type="radio" name="disposition" checked={d === c} onChange={() => setD(c)} /> {DISPOSITION_LABELS[c]}</label>
          ))}
        </div>
      </fieldset>
      {portal && (
        <label className="block text-sm mb-3"><span className="block font-medium text-gray-700 mb-1">Pharmacist</span>
          <select className="input" value={pharmacist} onChange={(e) => setPharmacist(e.target.value)}>
            <option value="">Choose…</option>
            {(pharmacists.data ?? []).map((p) => (
              <option key={p.id} value={p.id} disabled={p.registration ? !p.registration.ok : false}>
                {p.full_name} ({p.registration_no}){p.registration && !p.registration.ok ? ` — ${p.registration.state}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-sm"><span className="block font-medium text-gray-700 mb-1">
        {d === 'release' ? 'Why is it still fit to sell? (data logger, maker\'s stability data)' : 'Reason'}</span>
        <textarea className="input" rows={3} value={justification} onChange={(e) => setJustification(e.target.value)} />
      </label>
      {d === 'destroy' && <p className="text-xs text-gray-600 mt-2">{portal ? 'The batch is never supplied through Dawabag again; destroy it under your licence and keep the record.'
        : 'The batch is never supplied again; its free stock is raised as a write-off that a second person approves, then the destruction register is completed.'}</p>}
      {problem && <p className="text-xs text-amber-800 mt-2" role="status">{problem}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onClose} className="btn-outline text-sm">Cancel</button>
        <button type="button" disabled={!!problem || save.isPending} onClick={() => save.mutate()} className="btn-primary text-sm disabled:opacity-50">Record decision</button>
      </div>
    </Modal>
  );
}
