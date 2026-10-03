'use client';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileDown, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { downloadPartnerH1Csv, fetchPartnerH1, registerKeys, verifyPartnerH1 } from '@/lib/registers/api';
import { normaliseBlobError } from '@/lib/download';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { daysAgoIST, todayIST } from '@/lib/dates';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import H1RegisterTable from '@/components/staff/fulfilment/H1RegisterTable';
import ChainResultCard from '@/components/registers/ChainResultCard';

/**
 * The partner's Schedule H1 register (C-09): every H1 supply it dispatched through Dawabag,
 * numbered 1, 2, 3 … per licence, hash-chained. Downloadable for the drugs inspector,
 * and the partner can check the chain itself.
 */
export default function PartnerH1Register() {
  const [from, setFrom] = useState(daysAgoIST(30));
  const [to, setTo] = useState(todayIST());
  const [downloading, setDownloading] = useState(false);
  const valid = !!from && !!to && from <= to;
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: registerKeys.partner(from, to), queryFn: () => fetchPartnerH1(from, to), enabled: valid,
  });
  const verify = useMutation({ mutationFn: verifyPartnerH1, onError: (e) => toast.error(getApiErrorMessage(e, 'Could not check the register')) });

  const download = async () => {
    setDownloading(true);
    try { await downloadPartnerH1Csv(from, to); } catch (err) {
      toast.error(getApiErrorMessage(await normaliseBlobError(err), 'Could not download the register'));
    } finally { setDownloading(false); }
  };

  return (
    <div>
      <PageHeader title="Schedule H1 register" onRefresh={() => refetch()} refreshing={isFetching}
        subtitle="Your register as the licensee: each entry is written when you dispatch, numbered without gaps and sealed so it cannot be changed." />
      {!!data?.registers.length && (
        <ul className="text-xs text-gray-700 mb-3 space-y-0.5">
          {data.registers.map((r) => (
            <li key={r.register_key}>Licence {r.seller_licence_no ?? '—'}: {r.entries} entr{r.entries === 1 ? 'y' : 'ies'}, last no. {r.last_entry_no ?? '—'}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-sm">
          <span className="block text-xs font-medium text-gray-600 mb-1">From</span>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="input py-1.5" />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-gray-600 mb-1">To</span>
          <input type="date" value={to} min={from} max={todayIST()} onChange={(e) => setTo(e.target.value)} className="input py-1.5" />
        </label>
        <button onClick={download} disabled={!valid || downloading} className="btn-outline text-sm inline-flex items-center gap-1 disabled:opacity-50">
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Download CSV
        </button>
        <button onClick={() => verify.mutate()} disabled={verify.isPending} className="btn-outline text-sm inline-flex items-center gap-1 disabled:opacity-50">
          {verify.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Check the register
        </button>
      </div>
      {verify.data && (
        <div className="space-y-2 mb-4">
          {verify.data.registers.length === 0 && <p className="text-sm text-gray-600">No entries yet.</p>}
          {verify.data.registers.map((r) => <ChainResultCard key={r.register_key} title="Your H1 register" report={r} />)}
        </div>
      )}
      {!valid ? <p className="text-sm text-red-600">Choose a start date on or before the end date.</p> : (
        <>
          <QueryState isLoading={isLoading} error={error} isEmpty={!data?.entries.length} emptyText="No Schedule H1 supplies in this period" />
          {!!data?.entries.length && <H1RegisterTable entries={data.entries} />}
        </>
      )}
    </div>
  );
}
