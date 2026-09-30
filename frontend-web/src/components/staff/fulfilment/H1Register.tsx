'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadH1Csv, fetchH1Register, fulfilmentKeys } from '@/lib/fulfilment/api';
import { daysAgoIST, todayIST } from '@/lib/fulfilment/roles';
import { normaliseBlobError } from '@/lib/download';
import { getApiErrorMessage } from '@/lib/apiErrors';
import QueryState from '@/components/admin/QueryState';
import H1RegisterTable from './H1RegisterTable';

/** Schedule H1 register for a date range, viewable and downloadable as CSV (C-09). */
export default function H1Register() {
  const [from, setFrom] = useState(daysAgoIST(30));
  const [to, setTo] = useState(todayIST());
  const [downloading, setDownloading] = useState(false);
  const valid = !!from && !!to && from <= to;

  const { data, isLoading, error } = useQuery({
    queryKey: fulfilmentKeys.h1(from, to),
    queryFn: () => fetchH1Register(from, to),
    enabled: valid,
  });

  const download = async () => {
    setDownloading(true);
    try {
      await downloadH1Csv(from, to);
    } catch (err) {
      toast.error(getApiErrorMessage(await normaliseBlobError(err), 'Could not download the register'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-sm">
          <span className="block text-xs font-medium text-gray-600 mb-1">From</span>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="input py-1.5" />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-gray-600 mb-1">To</span>
          <input type="date" value={to} min={from} max={todayIST()} onChange={(e) => setTo(e.target.value)} className="input py-1.5" />
        </label>
        <button
          onClick={download}
          disabled={!valid || downloading}
          className="btn-outline text-sm inline-flex items-center gap-1 disabled:opacity-50"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Download CSV
        </button>
      </div>
      {!valid ? (
        <p className="text-sm text-red-600">Choose a start date on or before the end date.</p>
      ) : (
        <>
          <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No Schedule H1 sales in this period" />
          {!!data?.length && <H1RegisterTable entries={data} />}
        </>
      )}
    </div>
  );
}
