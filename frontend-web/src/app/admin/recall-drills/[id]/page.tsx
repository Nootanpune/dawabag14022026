'use client';
import { useParams } from 'next/navigation';
import DrillReport from '@/components/admin/recallDrills/DrillReport';

/** Sprint 40: one drill's report — printable, PDF on demand (C-28). */
export default function RecallDrillPage() {
  const { id } = useParams<{ id: string }>();
  return <DrillReport id={id} />;
}
