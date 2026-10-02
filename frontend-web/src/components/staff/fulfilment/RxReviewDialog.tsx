'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchStaffOrder, fulfilmentKeys } from '@/lib/fulfilment/api';
import type { QueuePrescription, RxQueueItem } from '@/lib/fulfilment/types';
import { CUSTOMER_TYPE_SHORT } from '@/lib/admin/format';
import Modal from '@/components/admin/Modal';
import QueryState from '@/components/admin/QueryState';
import PrescriptionViewer from './PrescriptionViewer';
import RxVerifyForm from './RxVerifyForm';
import BuyerHealthNote from './BuyerHealthNote';
import OrderCheckSignals from './OrderCheckSignals';

interface Props {
  item: RxQueueItem;
  prescription: QueuePrescription;
  onClose: () => void;
}

/** Side-by-side: the uploaded prescription and the pharmacist's verification form. */
export default function RxReviewDialog({ item, prescription, onClose }: Props) {
  const order = useQuery({ queryKey: fulfilmentKeys.order(item.order_id), queryFn: () => fetchStaffOrder(item.order_id) });

  return (
    <Modal title={`Review prescription — ${item.order_number}`} onClose={onClose} size="xl">
      <p className="text-xs text-gray-500 mb-3">
        {item.buyer_name ?? 'Buyer'} · {CUSTOMER_TYPE_SHORT[item.customer_type] ?? item.customer_type}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <PrescriptionViewer prescriptionId={prescription.prescription_id} fileType={prescription.file_type} />
        <div>
          {/* Sprint 33: allergies / conditions from the buyer's health profile (with consent, C-41) */}
          <BuyerHealthNote orderId={item.order_id} />
          {/* Sprint 35: verifying is also the order's pharmacist check — signals for every line */}
          <OrderCheckSignals orderId={item.order_id} />
          <QueryState isLoading={order.isLoading} error={order.error} isEmpty={false} emptyText="" />
          {order.data && <RxVerifyForm order={order.data} prescriptionId={prescription.prescription_id} onDone={onClose} />}
        </div>
      </div>
    </Modal>
  );
}
