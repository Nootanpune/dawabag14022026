'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Keyboard, Upload } from 'lucide-react';
import { fetchAlerts, recallAlertKeys } from '@/lib/recallAlerts/api';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusTabs from '@/components/admin/StatusTabs';
import AlertTable from '@/components/admin/recallAlerts/AlertTable';
import UploadAlertDialog from '@/components/admin/recallAlerts/UploadAlertDialog';
import TypeInAlertDialog from '@/components/admin/recallAlerts/TypeInAlertDialog';

const TABS = [
  { value: 'open', label: 'Open' },
  { value: 'all', label: 'All' },
] as const;

// Regulator recall / NSQ alerts — recall or clear every match within 4 hours (C-28)
export default function AdminRecallAlertsPage() {
  const [tab, setTab] = useState<'open' | 'all'>('open');
  const [dialog, setDialog] = useState<'upload' | 'type' | null>(null);
  const open = tab === 'open';
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: recallAlertKeys.list(open),
    queryFn: () => fetchAlerts(open),
    refetchInterval: 60000,
  });

  return (
    <div>
      <PageHeader
        title="Recall alerts"
        subtitle="CDSCO, FDA and manufacturer alert lists matched against our batches"
        onRefresh={() => refetch()}
        refreshing={isFetching}
        actions={
          <>
            <button onClick={() => setDialog('upload')} className="btn-primary text-sm inline-flex items-center gap-1">
              <Upload className="w-4 h-4" /> Upload list
            </button>
            <button onClick={() => setDialog('type')} className="btn-outline text-sm inline-flex items-center gap-1">
              <Keyboard className="w-4 h-4" /> Type in alert
            </button>
          </>
        }
      />
      <StatusTabs tabs={TABS} value={tab} onChange={setTab} />
      <QueryState
        isLoading={isLoading}
        error={error}
        isEmpty={!data?.length}
        emptyText={open ? 'No alerts waiting for a decision' : 'No alerts entered yet'}
      />
      {!!data?.length && <AlertTable rows={data} />}
      {dialog === 'upload' && <UploadAlertDialog onClose={() => setDialog(null)} />}
      {dialog === 'type' && <TypeInAlertDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
