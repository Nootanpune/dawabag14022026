import Link from 'next/link';

export default function StatTile({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const body = (
    <div className="card h-full hover:border-brand-300 transition-colors">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
