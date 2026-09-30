'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ADDRESSES_QUERY_KEY, deleteAddress, fetchAddresses, setDefaultAddress, type Address } from '@/lib/addresses';
import { getApiErrorMessage } from '@/lib/apiErrors';
import QueryState from '@/components/admin/QueryState';
import AddressSummary from './AddressSummary';
import AddressFormDialog from './AddressFormDialog';

/** List / add / edit / delete / set default — all on the server. */
export default function AddressManager() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ADDRESSES_QUERY_KEY, queryFn: fetchAddresses });
  const [editing, setEditing] = useState<Address | null | 'new'>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ADDRESSES_QUERY_KEY });

  const remove = useMutation({
    mutationFn: (a: Address) => deleteAddress(a.id),
    onSuccess: () => toast.success('Address removed'),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not remove the address')),
    onSettled: refresh,
  });
  const makeDefault = useMutation({
    mutationFn: (a: Address) => setDefaultAddress(a.id),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not set the default')),
    onSettled: refresh,
  });

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setEditing('new')} className="btn-primary text-sm inline-flex items-center gap-1">
          <Plus className="w-4 h-4" /> Add address
        </button>
      </div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No saved addresses yet." />
      <div className="space-y-3">
        {data?.map((a) => (
          <div key={a.id} className="card flex flex-wrap items-start justify-between gap-3">
            <AddressSummary a={a} />
            <div className="flex flex-wrap gap-2 text-xs">
              {!a.is_default && (
                <button onClick={() => makeDefault.mutate(a)} className="btn-outline text-xs py-1 px-2">
                  Set default
                </button>
              )}
              <button onClick={() => setEditing(a)} className="btn-outline text-xs py-1 px-2">
                Edit
              </button>
              <button
                onClick={() => window.confirm('Remove this address?') && remove.mutate(a)}
                className="btn-outline text-xs py-1 px-2 text-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      {editing && <AddressFormDialog address={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
