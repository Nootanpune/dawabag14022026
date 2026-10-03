'use client';
import { useParams } from 'next/navigation';
import InspectionDetail from '@/components/selfInspection/InspectionDetail';

/** Sprint 40: one recorded self-inspection (read-only, C-34). */
export default function InspectionPage() {
  const { id } = useParams<{ id: string }>();
  return <InspectionDetail id={id} />;
}
