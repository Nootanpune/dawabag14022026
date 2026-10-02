import Link from 'next/link';
import { INFO_PAGES, infoPageHref } from '@/lib/infoPages/api';

/** The three trust pages, for the footer and the trust pages themselves. */
export default function TrustLinks({ className, linkClassName = 'hover:text-brand-600' }: { className?: string; linkClassName?: string }) {
  return (
    <span className={className}>
      {INFO_PAGES.map((p) => (
        <Link key={p.key} href={infoPageHref(p.key)} className={linkClassName}>{p.label}</Link>
      ))}
    </span>
  );
}
