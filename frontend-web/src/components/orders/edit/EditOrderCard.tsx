'use client';
import { useState } from 'react';
import type { OrderDetail } from '@/lib/orders/api';
import EditOrderDialog from './EditOrderDialog';

/** "Change this order" until packing starts (Sprint 43, URS-074). */
export default function EditOrderCard({ order }: { order: OrderDetail }) {
  const [open, setOpen] = useState(false);
  if (!order.can_edit) return null;
  return (
    <div className="card mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="font-semibold text-sm">Need less?</h3>
        <p className="text-xs text-gray-500">Until we start packing you can lower a quantity or remove a medicine.</p>
      </div>
      <button onClick={() => setOpen(true)} className="btn-outline text-sm">Change order</button>
      {open && <EditOrderDialog order={order} onClose={() => setOpen(false)} />}
    </div>
  );
}
