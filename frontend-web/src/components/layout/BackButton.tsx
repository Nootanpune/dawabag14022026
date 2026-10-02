'use client';
import { ArrowLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { parentPath, showsBack } from '@/lib/layout/backTarget';
import { hasEarlierPage } from '@/lib/layout/navHistory';

/** The header's Back arrow (every page but home): the previous page, or a sensible parent. */
export default function BackButton() {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  if (!showsBack(pathname)) return null;
  const goBack = () => {
    // Only back within this site; the first page in the tab goes to its parent instead
    if (hasEarlierPage()) router.back();
    else router.push(parentPath(pathname));
  };
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Back"
      title="Back"
      className="-ml-2 mr-1 p-2 rounded-lg text-gray-700 hover:bg-gray-100 inline-flex items-center gap-1"
    >
      <ArrowLeft className="w-5 h-5" aria-hidden="true" />
      <span className="hidden md:inline text-sm font-medium">Back</span>
    </button>
  );
}
