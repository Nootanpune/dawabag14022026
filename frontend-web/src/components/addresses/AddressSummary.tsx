import { deliveryEstimate, type Address } from '@/lib/addresses';

/** Address text plus the server's serviceability / delivery estimate. */
export default function AddressSummary({ a }: { a: Address }) {
  const estimate = deliveryEstimate(a);
  return (
    <div>
      <p className="font-medium text-sm">
        {a.label} — {a.full_name}
        {a.is_default && <span className="ml-2 text-xs text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">Default</span>}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">
        {a.address_line1}
        {a.address_line2 ? `, ${a.address_line2}` : ''}, {a.city} — {a.pincode}, {a.state}
      </p>
      <p className="text-xs text-gray-400 mt-0.5">Mob: {a.mobile}</p>
      {estimate && (
        <p className={`text-xs mt-0.5 ${a.is_serviceable === false ? 'text-red-600' : 'text-green-700'}`}>{estimate}</p>
      )}
    </div>
  );
}
