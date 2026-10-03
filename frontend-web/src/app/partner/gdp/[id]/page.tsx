'use client';
import { useParams } from 'next/navigation';
import GdpBatchLog from '@/components/gdp/GdpBatchLog';

/** Sprint 40: one of the partner's batches — its GDP log and the form to record (C-25). */
export default function PartnerGdpBatchPage() {
  const { id } = useParams<{ id: string }>();
  return <GdpBatchLog portal kind="partner" id={id} canRecord />;
}
