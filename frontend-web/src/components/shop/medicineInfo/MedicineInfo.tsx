'use client';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, BadgeCheck } from 'lucide-react';
import { fetchMedicineInfo, medicineInfoKeys } from '@/lib/medicineInfo/api';
import { presentSections, type PublicInfo } from '@/lib/medicineInfo/types';
import { formatDateIST } from '@/lib/dates';
import { useIsDesktop } from '@/components/legal/useIsDesktop';
import InfoSectionBody from './InfoSectionBody';

const anchor = (key: string) => `info-${key.replace(/_/g, '-')}`;

function ReviewedBy({ info }: { info: PublicInfo }) {
  return (
    <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-600 space-y-1" data-testid="info-reviewed">
      {info.reviewed && (
        <p className="flex items-start gap-1.5">
          <BadgeCheck className="w-4 h-4 text-brand-600 shrink-0" aria-hidden="true" />
          <span>Reviewed by {info.reviewed.name}, Reg. no. {info.reviewed.reg_no}, on {formatDateIST(info.reviewed.reviewed_at)}</span>
        </p>
      )}
      <p className="font-medium text-gray-700">{info.disclaimer}</p>
    </div>
  );
}

/**
 * Full medicine information, written by our pharmacist from the manufacturer's
 * package insert and shown only once approved (C-19). Sections the pharmacist
 * left empty are not sent by the server and so never shown. Desktop: sticky
 * section tabs; phones: one accordion per section.
 */
export default function MedicineInfo({ productId }: { productId: string }) {
  const { data } = useQuery({ queryKey: medicineInfoKeys.public(productId), queryFn: () => fetchMedicineInfo(productId) });
  const isDesktop = useIsDesktop();
  if (!data?.available || !data.sections) return null;
  const sections = presentSections(data.sections);
  if (!sections.length) return null;

  return (
    <section className="card text-sm text-gray-800" aria-labelledby="medicine-info-heading" data-testid="medicine-info">
      <h2 id="medicine-info-heading" className="font-semibold text-base mb-2">About this medicine</h2>
      {isDesktop ? (
        <>
          <nav aria-label="Medicine information sections"
            className="sticky top-16 z-10 -mx-4 px-4 py-2 bg-white/95 backdrop-blur border-b border-gray-100 flex flex-wrap gap-1.5">
            {sections.map(({ key, label }) => (
              <a key={key} href={`#${anchor(key)}`}
                className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 hover:bg-brand-50 hover:text-brand-700">
                {label}
              </a>
            ))}
          </nav>
          <div className="divide-y divide-gray-100">
            {sections.map(({ key, label }) => (
              <div key={key} id={anchor(key)} className="py-3 scroll-mt-32">
                <h3 className="font-semibold text-gray-900 mb-1.5">{label}</h3>
                <InfoSectionBody k={key} s={data.sections!} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="divide-y divide-gray-100 border-y border-gray-100">
          {sections.map(({ key, label }, i) => (
            <details key={key} id={anchor(key)} className="group py-1" open={i === 0}>
              <summary className="flex items-center justify-between gap-2 cursor-pointer list-none py-2 font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
                {label}
                <ChevronDown className="w-4 h-4 text-gray-500 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="pb-3">
                <InfoSectionBody k={key} s={data.sections!} />
              </div>
            </details>
          ))}
        </div>
      )}
      <ReviewedBy info={data} />
    </section>
  );
}
