'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Header from '@/components/layout/Header';
import BackLink from '@/components/admin/BackLink';
import QueryState from '@/components/admin/QueryState';
import HealthListsForm from '@/components/healthProfile/HealthListsForm';
import FamilyMembers from '@/components/healthProfile/FamilyMembers';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatDateTimeIST } from '@/lib/dates';
import { deleteHealthProfile, fetchHealthProfile, healthKeys } from '@/lib/healthProfile/api';

// Health profile (Sprint 33): held on the server only with consent (C-41); our
// pharmacists see it when they check your order (C-08); delete it any time (C-43, C-44).
export default function HealthProfilePage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: healthKeys.mine, queryFn: fetchHealthProfile, gcTime: 0 });
  const remove = useMutation({
    mutationFn: deleteHealthProfile,
    onSuccess: (p) => { queryClient.setQueryData(healthKeys.mine, p); toast.success('Health profile deleted'); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not delete')),
  });
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <BackLink href="/account" label="My account" />
        <h1 className="text-lg font-semibold">Health profile</h1>
        <p className="text-sm text-gray-600">
          Optional. Our pharmacists see it when they check your prescriptions and orders, so they can spot an allergy or a clash with another medicine.
        </p>
        <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
        {data && (
          <>
            {/* key: refill the form when the server's data changes (e.g. after delete) */}
            <HealthListsForm key={`${data.consent.given}-${data.updated_at ?? ''}`} profile={data} />
            <FamilyMembers profile={data} />
            {data.consent.given && (
              <section className="card text-sm space-y-2" aria-labelledby="hp-delete">
                <h2 id="hp-delete" className="font-semibold">Your consent</h2>
                <p className="text-gray-600">
                  Given{data.consent.recorded_at ? ` on ${formatDateTimeIST(data.consent.recorded_at)}` : ''}. Deleting removes your allergies, conditions,
                  medicines and family members’ health details, and withdraws your consent. Records the law requires us to keep (such as an order
                  that names a family member) keep only the name.
                </p>
                <button type="button" className="btn-outline text-sm text-red-700 border-red-300"
                  onClick={() => { if (window.confirm('Delete your health profile?')) remove.mutate(); }} disabled={remove.isPending}>
                  Delete my health profile
                </button>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
