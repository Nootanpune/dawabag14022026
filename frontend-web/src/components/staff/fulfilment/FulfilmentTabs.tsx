'use client';
import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { hasRole } from '@/lib/admin/roles';
import { STAGE_ROLES } from '@/lib/fulfilment/roles';
import StatusTabs from '@/components/admin/StatusTabs';
import PharmacistCheckTab from './PharmacistCheckTab';
import ShipmentQueue from './ShipmentQueue';
import H1Register from './H1Register';
import RunSheet from '@/components/staff/delivery/RunSheet';

type Tab = 'check' | 'pack' | 'dispatch' | 'deliver' | 'h1';

// Sprint 35: one "Pharmacist check" tab for every order, prescription orders included (C-08)
const TABS: { value: Tab; label: string }[] = [
  { value: 'check', label: 'Pharmacist check' },
  { value: 'pack', label: 'Pack' },
  { value: 'dispatch', label: 'Dispatch' },
  { value: 'deliver', label: 'Deliver' },
  { value: 'h1', label: 'H1 register' },
];

/** Only the stages the signed-in role may work (server enforces the same, STAGE_ROLES). */
export default function FulfilmentTabs() {
  const role = useAuthStore((s) => s.user?.role);
  const tabs = TABS.filter((t) => hasRole(role, STAGE_ROLES[t.value]));
  const [picked, setPicked] = useState<Tab | null>(null);
  const tab = picked && tabs.some((t) => t.value === picked) ? picked : tabs[0]?.value;

  // Riders get their own run sheet (GET /fulfilment/my-run), not the queue (Sprint 13, C-41)
  if (role === 'delivery') return <RunSheet />;
  if (!tab) return <p className="text-sm text-gray-500">Your role has no fulfilment stages.</p>;
  return (
    <div>
      <StatusTabs tabs={tabs} value={tab} onChange={setPicked} />
      {tab === 'check' && <PharmacistCheckTab />}
      {(tab === 'pack' || tab === 'dispatch' || tab === 'deliver') && <ShipmentQueue key={tab} stage={tab} />}
      {tab === 'h1' && <H1Register />}
    </div>
  );
}
