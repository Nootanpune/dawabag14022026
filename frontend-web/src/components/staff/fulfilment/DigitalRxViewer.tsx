'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileCheck2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadFromApi, fetchApiBlob, normaliseBlobError } from '@/lib/download';
import { getApiErrorMessage } from '@/lib/apiErrors';

/**
 * A Dawabag e-prescription from a teleconsultation (C-24). There is no uploaded
 * file: the PDF is fetched through the authenticated client and shown in memory.
 * The pharmacist still verifies it like any prescription (C-08).
 */
export default function DigitalRxViewer({ eprescriptionId, pdfPath }: { eprescriptionId: string; pdfPath: string }) {
  const { data: blob, isLoading, error, refetch } = useQuery({
    queryKey: ['fulfilment', 'eprescription-pdf', eprescriptionId],
    queryFn: async () => {
      try {
        return await fetchApiBlob(pdfPath);
      } catch (err) {
        throw await normaliseBlobError(err);
      }
    },
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  const download = async () => {
    try {
      await downloadFromApi(pdfPath, `e-prescription-${eprescriptionId.slice(0, 8)}.pdf`);
    } catch (err) {
      toast.error(getApiErrorMessage(await normaliseBlobError(err), 'Could not download the e-prescription'));
    }
  };

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs text-brand-700 bg-brand-50 rounded-lg px-2 py-1.5">
        <FileCheck2 className="w-4 h-4" /> Dawabag e-prescription from a teleconsultation — check the doctor&apos;s registration and code on the PDF.
      </p>
      {isLoading || (blob && !url) ? (
        <div className="h-96 flex items-center justify-center bg-gray-50 rounded-lg">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : error || !url ? (
        <div className="h-40 flex flex-col items-center justify-center gap-2 bg-red-50 rounded-lg text-sm text-red-700">
          {getApiErrorMessage(error, 'Could not open the e-prescription')}
          <button onClick={() => refetch()} className="btn-outline text-xs py-1 px-3">
            Try again
          </button>
        </div>
      ) : (
        <iframe src={url} title="E-prescription" className="w-full h-[60vh] rounded-lg border border-gray-200" />
      )}
      <button onClick={download} className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1">
        <Download className="w-3 h-3" /> Download PDF
      </button>
    </div>
  );
}
