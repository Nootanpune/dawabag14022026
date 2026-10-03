'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { commitImport, importFileError, previewImport, type ImportSummary } from '@/lib/admin/catalogueImport';
import { getApiErrorMessage } from '@/lib/apiErrors';
import PageHeader from '@/components/admin/PageHeader';
import StatusTabs from '@/components/admin/StatusTabs';
import ImportFilePicker from '@/components/admin/catalogue/ImportFilePicker';
import ImportSummaryTiles from '@/components/admin/catalogue/ImportSummaryTiles';
import ImportRowsTable from '@/components/admin/catalogue/ImportRowsTable';
import ImportCommitBar from '@/components/admin/catalogue/ImportCommitBar';

const TABS = [
  { value: 'products', label: 'Products' },
  { value: 'batches', label: 'Opening stock' },
] as const;

// Catalogue import: preview, then commit in one transaction (C-19 copy review, C-27 expiry, C-46 audit — server side).
export default function CatalogueImportPage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [tab, setTab] = useState<'products' | 'batches'>('products');
  const [error, setError] = useState('');
  const [done, setDone] = useState<ImportSummary | null>(null);

  const preview = useMutation({ mutationFn: previewImport, onError: (e) => setError(getApiErrorMessage(e, 'Could not read the file')) });
  const commit = useMutation({
    mutationFn: (skip: boolean) => commitImport(file!, skip),
    onSuccess: (r) => {
      toast.success('Catalogue imported');
      setDone(r.summary);
      setFile(null);
      preview.reset();
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onError: (e) => setError(getApiErrorMessage(e, 'Import failed; nothing was changed')),
  });

  const chooseFile = (f: File | null) => {
    setFile(f);
    setDone(null);
    preview.reset();
    setError(f ? importFileError(f) : '');
  };

  const runPreview = () => {
    const e = importFileError(file);
    if (e) return setError(e);
    setError('');
    preview.mutate(file!);
  };

  const data = preview.data;
  return (
    <div className="space-y-4">
      <PageHeader title="Catalogue import" subtitle="Add or update products and opening stock from the Excel template" />
      {/* Sprint 40 (D6): optional columns; blank keeps what is set (a new product: drug, not a new drug) */}
      <p className="text-xs text-gray-600 mb-3">Optional columns: <strong>Product class</strong> (drug, device, cosmetic, ayush, general) and <strong>New drug</strong> (yes / no).
        A medical device or a new drug is never allowed for online sale by an import — a pharmacist decides in Online-sale status.</p>
      <ImportFilePicker file={file} onFile={chooseFile} onPreview={runPreview} pending={preview.isPending} />
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
      {done && (
        <div className="space-y-2">
          <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">
            Import complete. New or changed product copy is waiting for pharmacist approval (C-19).
          </p>
          <ImportSummaryTiles summary={done} />
        </div>
      )}
      {data && file && (
        <>
          <ImportSummaryTiles summary={data.summary} />
          <StatusTabs tabs={TABS} value={tab} onChange={setTab} />
          <ImportRowsTable key={tab} rows={tab === 'products' ? data.products : data.batches} kind={tab} />
          <ImportCommitBar summary={data.summary} pending={commit.isPending} onCommit={(skip) => commit.mutate(skip)} />
        </>
      )}
    </div>
  );
}
