// Prescriptions whose Schedule H1 lines are waiting to be dispatched but lack a detail
// the register needs (checked before Sprint 38: no prescriber address). The pharmacist
// completes them (rxVerification.completePrescriberDetails) so dispatch can go ahead (C-09).
import { query } from '../../config/database';

export function h1IncompletePrescriptions() {
  return query<any>(
    `SELECT rx.id AS prescription_id, o.id AS order_id, o.order_number, rx.patient_name, rx.prescriber_name,
            rx.prescriber_reg_no, rx.prescriber_address, string_agg(DISTINCT oi.product_name, ', ') AS products,
            string_agg(DISTINCT COALESCE(v.name, 'Dawabag'), ', ') AS sellers
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id AND p.drug_schedule = 'Schedule H1'
     JOIN prescriptions rx ON rx.id = oi.prescription_id AND rx.status = 'verified'
     JOIN order_shipments s ON s.id = oi.shipment_id AND s.status IN ('pending', 'packed')
     JOIN orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
     LEFT JOIN vendors v ON v.id = s.partner_id
     WHERE btrim(COALESCE(rx.prescriber_address, '')) = ''
       AND NOT EXISTS (SELECT 1 FROM h1_register h WHERE h.order_item_id = oi.id)
     GROUP BY rx.id, o.id ORDER BY o.created_at LIMIT 200`);
}
