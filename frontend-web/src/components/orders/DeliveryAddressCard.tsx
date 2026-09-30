import type { OrderDetail } from '@/lib/orders/api';

export default function DeliveryAddressCard({ order }: { order: OrderDetail }) {
  if (!order.address_line1) return null;
  return (
    <div className="card">
      <h3 className="font-semibold text-sm mb-2">Delivery address</h3>
      <p className="text-sm font-medium">{order.delivery_name}</p>
      <p className="text-sm text-gray-500">
        {order.address_line1}
        {order.address_line2 ? `, ${order.address_line2}` : ''}, {order.city} — {order.pincode}
      </p>
      <p className="text-sm text-gray-400">{order.delivery_mobile}</p>
    </div>
  );
}
