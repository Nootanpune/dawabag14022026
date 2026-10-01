'use client';
import { useLegalInfo } from './useLegalInfo';

/**
 * On the owner's trial server only (the API reports `trial: true` when it runs with
 * APP_ENV=trial): a strip on every page saying this is a demonstration with demo
 * medicines and placeholder licence details, so nobody mistakes it for a pharmacy
 * that sells (C-04). Rendered from the server's answer; nothing is stored here.
 */
export default function TrialBanner() {
  const { data } = useLegalInfo();
  if (!data?.trial) return null;
  return (
    <div role="note" className="bg-amber-100 border-b border-amber-300 text-amber-900 text-xs sm:text-sm text-center px-4 py-1.5">
      <strong>Trial / demo site.</strong> Medicines, prices, licences and accounts are demo data. Nothing is sold or delivered.
    </div>
  );
}
