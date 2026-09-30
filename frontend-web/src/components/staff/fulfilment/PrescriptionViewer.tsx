'use client';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2 } from 'lucide-react';
import { fetchPrescriptionUrl, fulfilmentKeys } from '@/lib/fulfilment/api';
import { getApiErrorMessage } from '@/lib/apiErrors';

/**
 * Shows the uploaded prescription from a short-lived signed URL. Every URL
 * request is audited server-side (C-41), so it is fetched once per open and
 * not retried or refetched in the background.
 */
export default function PrescriptionViewer({ prescriptionId, fileType }: { prescriptionId: string; fileType: string | null }) {
  const { data: url, isLoading, error, refetch } = useQuery({
    queryKey: fulfilmentKeys.rxUrl(prescriptionId),
    queryFn: () => fetchPrescriptionUrl(prescriptionId),
    staleTime: 4 * 60 * 1000, // signed URL lives 5 minutes
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="h-96 flex items-center justify-center bg-gray-50 rounded-lg">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }
  if (error || !url) {
    return (
      <div className="h-40 flex flex-col items-center justify-center gap-2 bg-red-50 rounded-lg text-sm text-red-700">
        {getApiErrorMessage(error, 'Could not open the prescription')}
        <button onClick={() => refetch()} className="btn-outline text-xs py-1 px-3">
          Try again
        </button>
      </div>
    );
  }

  const isPdf = (fileType ?? '').toLowerCase().includes('pdf');
  return (
    <div>
      {isPdf ? (
        <iframe src={url} title="Prescription" className="w-full h-[60vh] rounded-lg border border-gray-200" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- signed S3 URL, not a static asset
        <img src={url} alt="Uploaded prescription" className="w-full max-h-[60vh] object-contain rounded-lg border border-gray-200 bg-gray-50" />
      )}
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1 mt-1">
        Open full size <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}
