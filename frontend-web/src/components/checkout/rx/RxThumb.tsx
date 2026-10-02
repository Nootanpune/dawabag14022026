'use client';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { fetchPrescriptionLink, type MyPrescription } from '@/lib/prescriptions/api';
import { isImage } from '@/lib/prescriptions/describe';

/** A small picture of the buyer's own prescription (signed short-lived link, C-41), or a file icon. */
export default function RxThumb({ rx }: { rx: MyPrescription }) {
  const image = isImage(rx);
  const { data } = useQuery({
    queryKey: ['prescriptions', 'thumb', rx.id],
    queryFn: () => fetchPrescriptionLink(rx.id),
    enabled: image,
    staleTime: 4 * 60_000,
    retry: false,
  });
  return (
    <span className="w-14 h-14 shrink-0 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed link to the object store, not a static asset */}
      {image && data?.url ? <img src={data.url} alt="" className="w-full h-full object-cover" />
        : <FileText className="w-6 h-6 text-brand-600" aria-hidden="true" />}
    </span>
  );
}
