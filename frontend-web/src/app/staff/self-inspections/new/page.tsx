'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import RecordInspectionForm from '@/components/selfInspection/RecordInspectionForm';

function NewInspection() {
  const template = useSearchParams().get('template') ?? '';
  return <RecordInspectionForm templateId={template} />;
}

/** Sprint 40: record a self-inspection against a checklist (C-34). */
export default function NewInspectionPage() {
  return <Suspense><NewInspection /></Suspense>;
}
