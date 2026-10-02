'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { blankPartnerForm, buildCreateBody, createPartner, partnerKeys, type PartnerFormValues } from '@/lib/admin/partnerOnboarding';
import { getApiErrorMessage } from '@/lib/apiErrors';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import PartnerForm from '@/components/admin/partners/PartnerForm';
import TemporaryPasswords, { type IssuedLogin } from '@/components/admin/partners/TemporaryPasswords';

/** Add partner — business, GST, licences, pharmacists, address and logins in one step. */
export default function NewPartnerPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ vendorId: string; name: string; logins: IssuedLogin[] } | null>(null);

  const create = useMutation({
    mutationFn: (v: PartnerFormValues) => createPartner(buildCreateBody(v)),
    onSuccess: (r, v) => {
      // Passwords stay in this page's memory only, to be shown once
      const byMobile = new Map(v.logins.map((l) => [l.mobile.trim(), l]));
      setDone({
        vendorId: r.vendor_id, name: v.legal_name.trim(),
        logins: r.logins.map((l) => ({ mobile: l.mobile, name: byMobile.get(l.mobile)?.full_name.trim() ?? '',
          password: l.temporary_password_set ? byMobile.get(l.mobile)?.temporary_password ?? null : null })),
      });
      toast.success('Partner added');
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'vendors'] });
      window.scrollTo({ top: 0 });
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not add the partner')),
  });

  if (done) {
    return (
      <div className="space-y-4">
        <BackLink href="/admin/partners" label="Partners" />
        <PageHeader title={`${done.name} added`} subtitle="Approved and ready to sell. Its logins can now upload stock." />
        <TemporaryPasswords logins={done.logins} />
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/partners/${done.vendorId}`} className="btn-primary text-sm py-2 px-4">Open the partner</Link>
          <Link href="/admin/partners" className="btn-outline text-sm py-2 px-4">All partners</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <BackLink href="/admin/partners" label="Partners" />
      <PageHeader title="Add partner" subtitle="The partner is approved as soon as you save. Check the GST certificate and every licence first." />
      <PartnerForm
        initial={blankPartnerForm()}
        mode="create"
        pending={create.isPending}
        error={error}
        submitLabel="Add partner"
        onSubmit={(v) => {
          setError('');
          create.mutate(v);
        }}
      />
    </div>
  );
}
