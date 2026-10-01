'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, PackagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { approvePurchaseOrder, cancelPurchaseOrder, closePurchaseOrder } from '@/lib/purchasing/api';
import type { PurchaseOrder } from '@/lib/purchasing/types';
import { getApiErrorMessage } from '@/lib/apiErrors';
import ReasonDialog from '../ReasonDialog';

type Pending = 'cancel' | 'close' | null;

/** Approve (draft → sent), cancel, close short, or go to receiving — by PO status. */
export default function PoActions({ po }: { po: PurchaseOrder }) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<Pending>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['purchasing', 'orders'] });

  const approve = useMutation({
    mutationFn: () => approvePurchaseOrder(po.id),
    onSuccess: () => toast.success(`${po.po_number} approved and sent`),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not approve')),
    onSettled: refresh,
  });
  const finish = useMutation({
    mutationFn: ({ kind, reason }: { kind: 'cancel' | 'close'; reason: string }) =>
      kind === 'cancel' ? cancelPurchaseOrder(po.id, reason) : closePurchaseOrder(po.id, reason),
    onSuccess: (_d, v) => {
      toast.success(v.kind === 'cancel' ? 'Purchase order cancelled' : 'Purchase order closed short');
      setAsking(null);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not update the purchase order')),
    onSettled: refresh,
  });

  const receivable = po.status === 'sent' || po.status === 'partially_received';
  return (
    <div className="flex flex-wrap gap-2">
      {po.status === 'draft' && (
        <button onClick={() => approve.mutate()} disabled={approve.isPending} className="btn-primary text-sm inline-flex items-center gap-2">
          {approve.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Approve &amp; send
        </button>
      )}
      {receivable && (
        <Link href={`/staff/receive/new?po=${po.id}`} className="btn-primary text-sm inline-flex items-center gap-1">
          <PackagePlus className="w-4 h-4" /> Receive goods
        </Link>
      )}
      {(po.status === 'draft' || po.status === 'sent') && (
        <button onClick={() => setAsking('cancel')} className="btn-outline text-sm">
          Cancel PO
        </button>
      )}
      {po.status === 'partially_received' && (
        <button onClick={() => setAsking('close')} className="btn-outline text-sm">
          Close short
        </button>
      )}
      {asking && (
        <ReasonDialog
          title={asking === 'cancel' ? `Cancel ${po.po_number}` : `Close ${po.po_number} short`}
          label={asking === 'cancel' ? 'Why is it cancelled?' : 'Why will the rest not be received?'}
          confirmLabel={asking === 'cancel' ? 'Cancel PO' : 'Close PO'}
          minLength={3}
          pending={finish.isPending}
          onClose={() => setAsking(null)}
          onConfirm={(reason) => finish.mutate({ kind: asking, reason })}
        />
      )}
    </div>
  );
}
