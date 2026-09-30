'use client';
import { useParams } from 'next/navigation';
import ReturnStaffDetail from '@/components/admin/returns/ReturnStaffDetail';

export default function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ReturnStaffDetail id={id} basePath="/staff/returns" />;
}
