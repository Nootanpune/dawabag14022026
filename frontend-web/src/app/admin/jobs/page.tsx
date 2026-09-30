'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchJobs, jobKeys } from '@/lib/admin/jobs';
import { useAuthStore } from '@/store/authStore';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import JobCard from '@/components/admin/jobs/JobCard';

export default function JobsPage() {
  const canRun = useAuthStore((s) => s.user?.role === 'super_admin');
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: jobKeys.list, queryFn: fetchJobs });

  return (
    <div>
      <PageHeader
        title="Scheduled jobs"
        subtitle={`Schedules shown in ${data?.timezone === 'Asia/Kolkata' || !data ? 'IST' : data.timezone}${canRun ? '' : ' · only super admins can run jobs manually'}`}
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.jobs.length} emptyText="No scheduled jobs" />
      <div className="space-y-3">
        {data?.jobs.map((job) => (
          <JobCard key={job.name} job={job} canRun={canRun} />
        ))}
      </div>
    </div>
  );
}
