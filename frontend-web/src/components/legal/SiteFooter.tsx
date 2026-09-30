'use client';
import Link from 'next/link';
import { useLegalInfo } from './useLegalInfo';
import LegalBlocks from './LegalBlocks';

/** Site-wide footer with licence and grievance-officer details from the server (C-04, C-36). */
export default function SiteFooter() {
  const { data, isError } = useLegalInfo();
  return (
    <footer className="bg-white border-t border-gray-200 mt-10">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {data && <LegalBlocks info={data} />}
        {isError && <p className="text-xs text-gray-400">Legal details are temporarily unavailable.</p>}
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-6 pt-4 border-t border-gray-100 text-xs text-gray-500">
          <span>© {new Date().getFullYear()} {data?.entity?.name || 'Dawabag'}</span>
          <Link href="/legal" className="hover:text-brand-600">
            Licences &amp; grievance redressal
          </Link>
          <Link href="/account/complaints" className="hover:text-brand-600">
            Raise a complaint
          </Link>
          <Link href="/account/privacy" className="hover:text-brand-600">
            Privacy &amp; your data
          </Link>
        </div>
      </div>
    </footer>
  );
}
