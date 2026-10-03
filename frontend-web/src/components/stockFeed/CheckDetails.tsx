import { formatDateIST, formatDateTimeIST } from '@/lib/dates';
import { formatPrice } from '@/lib/utils';
import type { FeedCheck } from '@/lib/stockFeed';

const money = (p: unknown) => (typeof p === 'number' ? formatPrice(p) : '—');

/** The values from the partner's software behind one waiting item. */
export default function CheckDetails({ c }: { c: FeedCheck }) {
  const d = c.details ?? {};
  const facts: (string | null)[] = [];
  switch (c.kind) {
    case 'price_change':
      if (d.mrp) facts.push(`MRP ${money(d.mrp.from)} → ${money(d.mrp.to)}`);
      if (d.rate) facts.push(`Your rate ${money(d.rate.from)} → ${money(d.rate.to)}`);
      break;
    case 'expiry_change':
      facts.push(`Expiry ${formatDateIST(d.from)} → ${formatDateIST(d.to)}`);
      break;
    case 'cold_chain_batch':
      facts.push(`${d.quantity} pack(s)`, `expiry ${formatDateIST(d.expiry_date)}`, `MRP ${money(d.mrp_paise)}`);
      break;
    case 'new_listing':
      facts.push(`${d.quantity} pack(s) in ${d.batches?.length ?? 0} batch(es)`);
      break;
    case 'new_product':
      facts.push(d.pack, d.manufacturer, d.item_code ? `code ${d.item_code}` : null, `MRP ${money(d.mrp_paise)}`, `${d.quantity} pack(s)`,
        d.requested_at ? 'Requested from Dawabag' : null);
      break;
    case 'short_for_orders':
      facts.push(`Orders hold ${d.reserved} pack(s)`, `your software shows ${d.in_software}`);
      break;
  }
  return (
    <div className="min-w-0">
      <p className="font-medium break-words">
        {c.product_name ?? c.item_name ?? c.item_key}
        {c.batch_number && <span className="text-gray-500 font-normal"> · batch {c.batch_number}</span>}
      </p>
      {c.product_name && c.item_name && c.item_name !== c.product_name && <p className="text-xs text-gray-500">In your software: {c.item_name}</p>}
      <p className="text-xs text-gray-600">{facts.filter(Boolean).join(' · ')}</p>
      <p className="text-xs text-gray-500">Waiting since {formatDateTimeIST(c.first_seen_at, { zone: true })}</p>
    </div>
  );
}
