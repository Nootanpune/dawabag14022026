'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { fetchKycApplication, kycKeys } from '@/lib/admin/kyc';
import { hasRole, MANAGER_ROLES } from '@/lib/admin/roles';
import { useAuthStore } from '@/store/authStore';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import ApplicantDetails from '@/components/admin/kyc/ApplicantDetails';
import KycWarnings from '@/components/admin/kyc/KycWarnings';
import KycChecksList from '@/components/admin/kyc/KycChecksList';
import KycDocumentsList from '@/components/admin/kyc/KycDocumentsList';
import PortalLinks from '@/components/admin/kyc/PortalLinks';
import KycHistory from '@/components/admin/kyc/KycHistory';
import DecisionPanel from '@/components/admin/kyc/DecisionPanel';
import CreditLimitEditor from '@/components/admin/credit/CreditLimitEditor';

const CREDIT_TYPES = ['b2b_retailer', 'b2b_wholesaler'];

export default function KycApplicationPage() {
  const { userId } = useParams<{ userId: string }>();
  const role = useAuthStore((s) => s.user?.role);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: kycKeys.application(userId),
    queryFn: () => fetchKycApplication(userId),
  });

  const user = data?.user;
  const showCredit =
    !!user && user.kyc_status === 'approved' && CREDIT_TYPES.includes(user.customer_type) && hasRole(role, MANAGER_ROLES);

  return (
    <div>
      <Link href="/admin/kyc" className="text-sm text-gray-500 hover:text-brand-600 inline-flex items-center gap-1 mb-3">
        <ArrowLeft className="w-4 h-4" /> KYC queue
      </Link>
      <PageHeader
        title={user ? user.business_name || user.full_name : 'Application'}
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data} emptyText="Application not found" />
      {data && user && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 space-y-4">
            <KycWarnings licenceExpired={data.licence_expired} missing={data.missing_documents} />
            <DecisionPanel application={data} />
            {showCredit && (
              <CreditLimitEditor
                key={user.credit_limit_paise}
                userId={user.id}
                creditLimitPaise={user.credit_limit_paise}
                creditUsedPaise={user.credit_used_paise}
              />
            )}
            <KycDocumentsList documents={data.documents} />
          </div>
          <div className="lg:col-span-2 space-y-4">
            <ApplicantDetails user={user} />
            <KycChecksList checks={data.checks} />
            <PortalLinks links={data.portal_links} />
            <KycHistory history={data.history} />
          </div>
        </div>
      )}
    </div>
  );
}
