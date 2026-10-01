'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { accountsKeys, downloadReportCsv, fetchReport, fetchReportNames, lastMonth, periodError, REPORT_LABELS, REPORT_PERIOD_HINTS } from '@/lib/admin/accounts';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { normaliseBlobError } from '@/lib/download';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import ReportFilters from '@/components/admin/accounts/ReportFilters';
import ReportTable from '@/components/admin/accounts/ReportTable';

// GST registers and marketplace TCS/TDS for the accountant (C-30, C-32, C-34). Each run is audited server-side.
export default function AccountsReportsPage() {
  const [period, setPeriod] = useState(lastMonth);
  const [picked, setPicked] = useState('');
  const [downloading, setDownloading] = useState(false);
  const names = useQuery({ queryKey: accountsKeys.names, queryFn: fetchReportNames });
  const name = picked || names.data?.[0] || '';
  const invalid = periodError(period.from, period.to);
  const report = useQuery({
    queryKey: accountsKeys.report(name, period.from, period.to),
    queryFn: () => fetchReport(name, period.from, period.to),
    enabled: !!name && !invalid,
  });

  const download = async () => {
    if (invalid) return toast.error(invalid);
    setDownloading(true);
    try {
      await downloadReportCsv(name, period.from, period.to);
    } catch (err) {
      toast.error(getApiErrorMessage(await normaliseBlobError(err), 'Could not download the report'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Accounts reports"
        subtitle="GST registers, marketplace TCS / TDS and Razorpay reconciliation for the accountant (up to 13 months at a time)"
        onRefresh={() => report.refetch()}
        refreshing={report.isFetching}
      />
      <QueryState isLoading={names.isLoading} error={names.error} isEmpty={false} emptyText="" />
      {!!names.data?.length && (
        <ReportFilters
          names={names.data}
          name={name}
          from={period.from}
          to={period.to}
          onChange={(v) => {
            if (v.name) setPicked(v.name);
            setPeriod((p) => ({ from: v.from ?? p.from, to: v.to ?? p.to }));
          }}
          onDownload={download}
          downloading={downloading}
        />
      )}
      {REPORT_PERIOD_HINTS[name] && <p className="text-xs text-gray-500 -mt-2 mb-3">{REPORT_PERIOD_HINTS[name]}</p>}
      {invalid ? (
        <p className="text-sm text-red-600">{invalid}</p>
      ) : (
        <>
          <QueryState
            isLoading={report.isLoading}
            error={report.error}
            isEmpty={!!report.data && !report.data.rows.length}
            emptyText={`No rows in ${REPORT_LABELS[name] ?? name} for this period`}
          />
          {!!report.data?.rows.length && (
            <>
              <p className="text-xs text-gray-500 mb-2">{report.data.rows.length} row(s)</p>
              <ReportTable report={name} rows={report.data.rows} />
            </>
          )}
        </>
      )}
    </div>
  );
}
