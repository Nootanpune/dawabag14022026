'use client';
import RxQueue from './RxQueue';
import CheckQueue from './CheckQueue';
import H1IncompleteList from './H1IncompleteList';

/**
 * One place for the pharmacist's check of every order (Sprint 35, C-08). Orders with
 * prescription medicines are checked through the prescription review — verifying it
 * also releases Dawabag's part of the order, so there is no second step. Every other
 * order (paid, or on credit) is checked and released here before packing.
 */
export default function PharmacistCheckTab() {
  return (
    <div className="space-y-6">
      {/* Sprint 38: H1 parcels waiting for a detail the register needs (C-09) */}
      <H1IncompleteList />
      <section aria-labelledby="rx-orders">
        <h2 id="rx-orders" className="text-sm font-semibold text-gray-800 mb-2">Prescription orders</h2>
        <p className="text-xs text-gray-600 mb-2">Verifying the prescription is the check: Dawabag&apos;s part of the order is released for packing at the same time.</p>
        <RxQueue />
      </section>
      <section aria-labelledby="check-orders">
        <h2 id="check-orders" className="text-sm font-semibold text-gray-800 mb-2">Orders to check before packing</h2>
        <CheckQueue />
      </section>
    </div>
  );
}
