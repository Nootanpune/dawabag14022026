'use client';
import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { hasRole } from '@/lib/admin/roles';
import { STAGE_ROLES } from '@/lib/fulfilment/roles';
import StatusTabs from '@/components/admin/StatusTabs';
import RxQueue from './RxQueue';
import ShipmentQueue from './ShipmentQueue';
import H1Register from './H1Register';

type Tab = 'rx' | 'pack' | 'dispatch' | 'deliver' | 'h1';

const TABS: { value: Tab; label: string }[] = [
  { value: 'rx', label: 'Rx verify' },
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

  if (!tab) return <p className="text-sm text-gray-500">Your role has no fulfilment stages.</p>;
  return (
    <div>
      <StatusTabs tabs={tabs} value={tab} onChange={setPicked} />
      {tab === 'rx' && <RxQueue />}
      {(tab === 'pack' || tab === 'dispatch' || tab === 'deliver') && <ShipmentQueue key={tab} stage={tab} />}
      {tab === 'h1' && <H1Register />}
    </div>
  );
}
