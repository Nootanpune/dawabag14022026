'use client';
import type { ReceiptHeaderDraft } from '@/lib/purchasing/receiptForm';
import { todayIST } from '@/lib/fulfilment/roles';
import SupplierSelect from '@/components/admin/purchasing/SupplierSelect';

interface Props {
  value: ReceiptHeaderDraft;
  onChange: (patch: Partial<ReceiptHeaderDraft>) => void;
  /** set when receiving against a PO: the supplier is the PO's */
  supplierName?: string;
}

/** Supplier and the supplier's tax invoice (the purchase register entry for GST input credit). */
export default function ReceiptHeaderFields({ value, onChange, supplierName }: Props) {
  return (
    <div className="grid sm:grid-cols-3 gap-3 text-sm">
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">Supplier *</span>
        {supplierName ? (
          <p className="input bg-gray-50">{supplierName}</p>
        ) : (
          <SupplierSelect value={value.vendor_id} onChange={(vendor_id) => onChange({ vendor_id })} />
        )}
      </label>
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">Supplier invoice no. *</span>
        <input
          value={value.supplier_invoice_no}
          onChange={(e) => onChange({ supplier_invoice_no: e.target.value })}
          maxLength={60}
          className="input"
        />
      </label>
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">Invoice date *</span>
        <input
          type="date"
          max={todayIST()}
          value={value.supplier_invoice_date}
          onChange={(e) => onChange({ supplier_invoice_date: e.target.value })}
          className="input"
        />
      </label>
      <label className="block sm:col-span-3">
        <span className="block font-medium text-gray-700 mb-1">Notes</span>
        <input value={value.notes} onChange={(e) => onChange({ notes: e.target.value })} maxLength={1000} className="input" />
      </label>
    </div>
  );
}
