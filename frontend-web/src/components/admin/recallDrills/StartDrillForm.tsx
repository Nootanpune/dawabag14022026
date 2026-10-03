'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { drillKeys, fetchDrillableBatches, seconds, startDrill, type DrillableBatch } from '@/lib/recallDrills/api';

/** Choose a batch and a scenario; the server traces it at once (nobody is contacted). */
export default function StartDrillForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<DrillableBatch | null>(null);
  const [scenario, setScenario] = useState('');
  const dq = useDebouncedValue(q, 300);
  const batches = useQuery({ queryKey: drillKeys.batches(dq), queryFn: () => fetchDrillableBatches(dq), enabled: dq.trim().length >= 2 });
  const start = useMutation({
    mutationFn: () => startDrill({ product_id: chosen!.product_id, batch_number: chosen!.batch_number, scenario: scenario.trim() }),
    onSuccess: (d) => {
      toast.success(`${d.drill_no}: traced in ${seconds(d.time_to_trace_ms)}`);
      queryClient.invalidateQueries({ queryKey: drillKeys.all });
      router.push(`/admin/recall-drills/${d.id}`);
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'The drill could not run')),
  });
  return (
    <section className="card mb-6 text-sm" aria-labelledby="new-drill">
      <h2 id="new-drill" className="font-semibold mb-1">Run a drill</h2>
      <p className="text-xs text-gray-600 mb-3">The trace is the same one a real recall uses — orders, shipments, buyers, partners, H1 entries, stock by location —
        but no buyer, partner or regulator is contacted and nothing is blocked.</p>
      <label htmlFor="drill-q" className="block font-medium text-gray-700 mb-1">Batch</label>
      <input id="drill-q" type="search" className="input max-w-md" placeholder="Product, SKU or batch number (2+ letters)" value={q}
        onChange={(e) => { setQ(e.target.value); setChosen(null); }} />
      {batches.data && !chosen && (
        <ul className="mt-2 max-w-md border rounded-lg divide-y" aria-label="Batches found">
          {batches.data.length === 0 && <li className="p-2 text-gray-500">No batch found.</li>}
          {batches.data.map((b) => (
            <li key={`${b.product_id}-${b.batch_number}`}>
              <button type="button" className="w-full text-left p-2 hover:bg-gray-50" onClick={() => setChosen(b)}>
                <span className="font-medium">{b.product_name}</span> <span className="font-mono text-xs">{b.batch_number}</span>
                <span className="block text-xs text-gray-500">{[b.at_dawabag ? 'Dawabag' : null, b.partner_batches ? `${b.partner_batches} partner batch(es)` : null].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {chosen && <p className="mt-2 text-sm">Chosen: <strong>{chosen.product_name}</strong> batch <span className="font-mono">{chosen.batch_number}</span>
        <button type="button" className="ml-2 text-xs underline" onClick={() => setChosen(null)}>Change</button></p>}
      <label htmlFor="drill-scenario" className="block font-medium text-gray-700 mt-3 mb-1">Scenario</label>
      <textarea id="drill-scenario" className="input max-w-2xl" rows={2} value={scenario} onChange={(e) => setScenario(e.target.value)}
        placeholder="e.g. Maker reports a labelling error on this batch" />
      <div className="mt-3">
        <button type="button" className="btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-50" disabled={!chosen || scenario.trim().length < 5 || start.isPending}
          onClick={() => start.mutate()}>
          {start.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Start drill
        </button>
      </div>
    </section>
  );
}
