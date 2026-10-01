'use client';
import { useRef, useState } from 'react';
import { FileText, Upload, X, Loader2, ArrowLeft, ArrowRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ACCEPT_ATTR,
  DOCUMENT_LABELS,
  formatFileSize,
  validateKycFile,
  type DocumentType,
} from '@/lib/registration';

export type HeldFiles = Partial<Record<DocumentType, File>>;

// ─── Single document picker row (also reused by the upload screen) ───────────
export function DocumentPicker({
  docType,
  file,
  optional,
  error,
  disabled,
  onPick,
  onClear,
}: {
  docType: DocumentType;
  file?: File;
  optional?: boolean;
  error?: string;
  disabled?: boolean;
  onPick: (file: File) => void;
  onClear?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div
        className={cn(
          'border rounded-lg p-3 flex items-center gap-3',
          error ? 'border-red-300 bg-red-50' : file ? 'border-brand-200 bg-brand-50' : 'border-dashed border-gray-300'
        )}
      >
        <FileText className={cn('w-5 h-5 shrink-0', file ? 'text-brand-600' : 'text-gray-400')} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800">
            {DOCUMENT_LABELS[docType]} {optional && <span className="text-gray-400 font-normal">(optional)</span>}
          </p>
          {file ? (
            <p className="text-xs text-gray-500 truncate">
              {file.name} · {formatFileSize(file.size)}
            </p>
          ) : (
            <p className="text-xs text-gray-400">PDF, JPG or PNG · max 5 MB</p>
          )}
        </div>
        {file && onClear && !disabled && (
          <button
            type="button"
            onClick={onClear}
            className="p-1 text-gray-400 hover:text-red-500"
            aria-label={`Remove ${DOCUMENT_LABELS[docType]}`}
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="text-xs font-medium text-brand-600 border border-brand-600 rounded-lg px-2.5 py-1.5 hover:bg-brand-50 inline-flex items-center gap-1 disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" />
          {file ? 'Change' : 'Choose'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ''; // allow re-selecting the same file
            if (f) onPick(f);
          }}
        />
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ─── Step 3 ──────────────────────────────────────────────────────────────────
interface Props {
  requiredDocs: DocumentType[];
  optionalDocs: DocumentType[];
  files: HeldFiles;
  onChange: (docType: DocumentType, file: File | null) => void;
  /** hidden once the account has been registered (details can no longer change) */
  onBack?: () => void;
  onContinue: () => void | Promise<void>;
  isSubmitting: boolean;
}

export default function DocumentsStep({
  requiredDocs,
  optionalDocs,
  files,
  onChange,
  onBack,
  onContinue,
  isSubmitting,
}: Props) {
  const [errors, setErrors] = useState<Partial<Record<DocumentType, string>>>({});

  const pick = (docType: DocumentType, file: File) => {
    const err = validateKycFile(file);
    setErrors((prev) => ({ ...prev, [docType]: err ?? undefined }));
    if (!err) onChange(docType, file);
  };

  const handleContinue = () => {
    const missing: Partial<Record<DocumentType, string>> = {};
    for (const d of requiredDocs) if (!files[d]) missing[d] = 'This document is required';
    if (Object.keys(missing).length) {
      setErrors((prev) => ({ ...prev, ...missing }));
      return;
    }
    onContinue();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">KYC documents</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Upload clear scans or photos. They are submitted securely after you verify your mobile number.
        </p>
      </div>

      <div className="space-y-3">
        {requiredDocs.map((d) => (
          <DocumentPicker
            key={d}
            docType={d}
            file={files[d]}
            error={errors[d]}
            disabled={isSubmitting}
            onPick={(f) => pick(d, f)}
            onClear={() => onChange(d, null)}
          />
        ))}
        {optionalDocs.map((d) => (
          <DocumentPicker
            key={d}
            docType={d}
            file={files[d]}
            optional
            error={errors[d]}
            disabled={isSubmitting}
            onPick={(f) => pick(d, f)}
            onClear={() => onChange(d, null)}
          />
        ))}
      </div>

      <p className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5">
        <Info className="w-4 h-4 shrink-0 text-gray-400" />
        Documents must be valid and legible. Names and numbers should match the details you entered.
      </p>

      <div className="flex gap-3 pt-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="btn-outline flex items-center justify-center gap-1.5 py-2.5"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        )}
        <button
          type="button"
          onClick={handleContinue}
          disabled={isSubmitting}
          className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          Continue
        </button>
      </div>
    </div>
  );
}
