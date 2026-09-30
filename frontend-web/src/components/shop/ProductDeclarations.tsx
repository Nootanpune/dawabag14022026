import type { ProductDetail } from '@/lib/products/api';
import { formatPrice } from '@/lib/utils';

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <dt className="w-40 shrink-0 text-gray-500">{label}</dt>
      <dd className="text-gray-800">{value && String(value).trim() ? value : '—'}</dd>
    </div>
  );
}

/** Pre-packed goods declarations (Legal Metrology, C-17), from the server. */
export default function ProductDeclarations({ p }: { p: ProductDetail }) {
  return (
    <div className="card text-sm">
      <h2 className="font-semibold mb-2">Product declarations</h2>
      <dl>
        <Row label="MRP (incl. all taxes)" value={formatPrice(p.mrp_paise)} />
        <Row label="Net quantity" value={p.net_quantity} />
        <Row label="Manufacturer" value={p.manufacturer_name} />
        <Row label="Manufacturer address" value={p.manufacturer_address} />
        <Row label="Marketed by" value={p.marketed_by} />
        <Row label="Country of origin" value={p.country_of_origin} />
        <Row label="Expiry of supplied batch" value={p.supplied_batch_expiry ? `${p.supplied_batch_expiry} or later` : null} />
        <Row label="Storage" value={p.storage_instructions} />
      </dl>
    </div>
  );
}
