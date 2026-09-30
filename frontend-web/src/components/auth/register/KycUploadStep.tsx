'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2, RotateCw, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage, uploadKycDocument } from '@/lib/api';
import {
  DOCUMENT_LABELS,
  validateKycFile,
  type DocumentType,
  type KycUploadResponseData,
} from '@/lib/registration';
import { DocumentPicker, type HeldFiles } from './DocumentsStep';

type Status = 'queued' | 'uploading' | 'done' | 'error' | 'missing';

interface Item {
  docType: DocumentType;
  required: boolean;
  file?: File;
  status: Status;
  progress: number;
  error?: string;
}

interface Props {
  /** documents the server says are required (from the register response) */
  requiredDocs: DocumentType[];
  files: HeldFiles;
  accessToken: string;
  /** all required documents uploaded; `kycStatus` is the latest status from the server */
  onComplete: (kycStatus?: string) => void;
  /** user gives up for now with some documents outstanding */
  onSkip: () => void;
}

export default function KycUploadStep({ requiredDocs, files, accessToken, onComplete, onSkip }: Props) {
  const [items, setItems] = useState<Item[]>(() => {
    const docs = Array.from(new Set<DocumentType>([...requiredDocs, ...(Object.keys(files) as DocumentType[])]));
    return docs
      .filter((d) => requiredDocs.includes(d) || files[d])
      .map((d) => ({
        docType: d,
        required: requiredDocs.includes(d),
        file: files[d],
        status: files[d] ? 'queued' : 'missing',
        progress: 0,
      }));
  });
  const [kycStatus, setKycStatus] = useState<string | undefined>();
  const [serverMissing, setServerMissing] = useState<DocumentType[] | null>(null);
  const started = useRef(false);

  const patch = (docType: DocumentType, p: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.docType === docType ? { ...it, ...p } : it)));

  const uploadOne = useCallback(
    async (docType: DocumentType, file: File) => {
      patch(docType, { status: 'uploading', progress: 0, error: undefined });
      try {
        const res = await uploadKycDocument(docType, file, accessToken, (progress) => patch(docType, { progress }));
        const data = res?.data as KycUploadResponseData | undefined;
        patch(docType, { status: 'done', progress: 100 });
        if (data?.kyc_status) setKycStatus(data.kyc_status);
        if (Array.isArray(data?.missing_documents)) setServerMissing(data!.missing_documents);
      } catch (err: any) {
        patch(docType, { status: 'error', error: getApiErrorMessage(err, 'Upload failed') });
      }
    },
    [accessToken]
  );

  // Upload everything held from Step 3, one file at a time.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      for (const it of items) {
        if (it.file) await uploadOne(it.docType, it.file);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requiredItems = items.filter((i) => i.required);
  const allRequiredDone =
    requiredItems.every((i) => i.status === 'done') && (serverMissing === null || serverMissing.length === 0);
  const busy = items.some((i) => i.status === 'uploading' || i.status === 'queued');
  const failed = items.filter((i) => i.status === 'error' && i.file);

  // Move on automatically once every required document is accepted.
  const completed = useRef(false);
  useEffect(() => {
    if (!busy && allRequiredDone && !completed.current) {
      completed.current = true;
      onComplete(kycStatus);
    }
  }, [busy, allRequiredDone, kycStatus, onComplete]);

  const retryAll = async () => {
    for (const it of failed) await uploadOne(it.docType, it.file!);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Uploading your documents</h2>
        <p className="text-sm text-gray-500 mt-0.5">Mobile verified. Please keep this page open.</p>
      </div>

      <ul className="space-y-3">
        {items.map((it) =>
          it.status === 'missing' ? (
            <li key={it.docType}>
              <DocumentPicker
                docType={it.docType}
                error={it.error ?? 'Required — please choose a file'}
                onPick={(f) => {
                  const err = validateKycFile(f);
                  if (err) return patch(it.docType, { error: err });
                  patch(it.docType, { file: f, error: undefined });
                  uploadOne(it.docType, f);
                }}
              />
            </li>
          ) : (
            <li
              key={it.docType}
              className={cn(
                'border rounded-lg p-3',
                it.status === 'error' ? 'border-red-300 bg-red-50' : 'border-gray-200'
              )}
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 shrink-0 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{DOCUMENT_LABELS[it.docType]}</p>
                  <p className="text-xs text-gray-500 truncate">{it.file?.name}</p>
                </div>
                {it.status === 'queued' && <span className="text-xs text-gray-400">Waiting…</span>}
                {it.status === 'uploading' && (
                  <span className="text-xs text-brand-700 inline-flex items-center gap-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> {it.progress}%
                  </span>
                )}
                {it.status === 'done' && <CheckCircle2 className="w-5 h-5 text-brand-600" />}
                {it.status === 'error' && (
                  <button
                    type="button"
                    onClick={() => uploadOne(it.docType, it.file!)}
                    className="text-xs font-medium text-brand-600 border border-brand-600 rounded-lg px-2.5 py-1.5 hover:bg-brand-50 inline-flex items-center gap-1"
                  >
                    <RotateCw className="w-3.5 h-3.5" /> Retry
                  </button>
                )}
              </div>
              {(it.status === 'uploading' || it.status === 'done') && (
                <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full bg-brand-500 transition-all"
                    style={{ width: `${it.status === 'done' ? 100 : it.progress}%` }}
                  />
                </div>
              )}
              {it.status === 'error' && (
                <p className="text-xs text-red-600 mt-1.5 flex items-start gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {it.error}
                </p>
              )}
            </li>
          )
        )}
      </ul>

      {!busy && serverMissing && serverMissing.length > 0 && requiredItems.every((i) => i.status === 'done') && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5">
          Still required: {serverMissing.map((d) => DOCUMENT_LABELS[d] ?? d).join(', ')}.
        </p>
      )}

      {!busy && !allRequiredDone && (
        <div className="flex gap-3">
          <button type="button" onClick={onSkip} className="btn-outline py-2.5 text-sm">
            Finish later
          </button>
          {failed.length > 0 && (
            <button
              type="button"
              onClick={retryAll}
              className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2"
            >
              <RotateCw className="w-4 h-4" /> Retry {failed.length > 1 ? `all (${failed.length})` : 'upload'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
