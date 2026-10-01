import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600 mb-3">
      <ArrowLeft className="w-4 h-4" /> {label}
    </Link>
  );
}
