'use client';
import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchDoctors, teleKeys } from '@/lib/telemedicine/api';
import Header from '@/components/layout/Header';
import QueryState from '@/components/admin/QueryState';
import DoctorCard from '@/components/telemedicine/patient/DoctorCard';

const PAGE_SIZE = 20;

// Doctor directory: only doctors whose council registration Dawabag has checked (C-22)
export default function ConsultPage() {
  const [text, setText] = useState('');
  const [speciality, setSpeciality] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setSpeciality(text.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [text]);
  const { data, isLoading, error } = useQuery({
    queryKey: teleKeys.doctors(speciality, page),
    queryFn: () => fetchDoctors(speciality, page),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Consult a doctor online</h1>
          <p className="text-xs text-gray-500">
            Every doctor here is registered with the National Medical Commission or a State Medical Council; Dawabag has checked the
            registration. Consultations follow the Telemedicine Practice Guidelines, 2020.
          </p>
        </div>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Speciality (exact), e.g. General Physician"
          className="input max-w-md"
        />
        <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No doctors available right now." />
        <div className="space-y-3">{data?.map((d) => <DoctorCard key={d.id} d={d} />)}</div>
        {(page > 1 || (data?.length ?? 0) >= PAGE_SIZE) && (
          <div className="flex justify-end gap-2 text-sm">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-outline text-xs py-1 px-3 disabled:opacity-40">
              Previous
            </button>
            <button
              disabled={(data?.length ?? 0) < PAGE_SIZE}
              onClick={() => setPage(page + 1)}
              className="btn-outline text-xs py-1 px-3 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
