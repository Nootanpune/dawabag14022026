'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { useLegalInfo } from './useLegalInfo';
import { useIsDesktop } from './useIsDesktop';
import LegalBlocks from './LegalBlocks';
import FooterLicenceSummary from './FooterLicenceSummary';
import PolicyLinks from './PolicyLinks';
import { POLICY_KEYS } from '@/lib/legal/policies';
import { currentYearIST } from '@/lib/dates';
import { isPortalPath } from '@/lib/layout/portalPaths';

/**
 * Site-wide footer with licence, pharmacist and grievance-officer details from the
 * server (C-03, C-04, C-36) on every public page. Phones get a one-line summary and
 * the full details one tap away; from md up they are always open. Staff, admin,
 * partner and doctor portals have their own shell and no public footer.
 */
export default function SiteFooter() {
  const pathname = usePathname();
  const { data, isError } = useLegalInfo();
  const isDesktop = useIsDesktop();

  if (isPortalPath(pathname)) return null;

  return (
    <footer className="bg-white border-t border-gray-200 mt-10">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8">
        {data &&
          (isDesktop ? (
            <LegalBlocks info={data} />
          ) : (
            <>
              <FooterLicenceSummary info={data} />
              <details className="group mt-1">
                <summary className="flex items-center gap-1 cursor-pointer list-none text-sm font-medium text-brand-700 py-2 [&::-webkit-details-marker]:hidden">
                  Licences, pharmacist &amp; grievance officer
                  <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="pt-2">
                  <LegalBlocks info={data} />
                </div>
              </details>
            </>
          ))}
        {isError && <p className="text-xs text-gray-500">Legal details are temporarily unavailable.</p>}
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 md:mt-6 pt-4 border-t border-gray-100 text-xs text-gray-500">
          <span>© {currentYearIST()} {data?.entity?.name || 'Dawabag'}</span>
          <Link href="/legal" className="hover:text-brand-600">
            Licences &amp; grievance redressal
          </Link>
          <Link href="/account/complaints" className="hover:text-brand-600">
            Raise a complaint
          </Link>
          <Link href="/account/privacy" className="hover:text-brand-600">
            Privacy &amp; your data
          </Link>
          {/* Published policies (C-39) */}
          <PolicyLinks keys={POLICY_KEYS} className="contents" />
        </div>
      </div>
    </footer>
  );
}
