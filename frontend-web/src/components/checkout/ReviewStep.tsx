'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ClipboardCheck, Loader2 } from 'lucide-react';
import { checkoutKeys, previewOrder, type OrderBody } from '@/lib/checkout';
import { POLICY_KEYS, type PolicyKey } from '@/lib/legal/policies';
import QueryState from '@/components/admin/QueryState';
import PolicyLinks from '@/components/legal/PolicyLinks';
import PreviewShipmentBlock from './PreviewShipmentBlock';
import ChargeBreakup from './ChargeBreakup';
import PractitionerDeclaration from './PractitionerDeclaration';
import RxAttachedLine, { type ChosenRx } from './rx/RxAttachedLine';
import RxPolicyNote from './rx/RxPolicyNote';

interface Props {
  body: OrderBody;
  /** doctors / hospitals must tick the own-patients declaration (C-15) */
  needsDeclaration: boolean;
  placing: boolean;
  /** the prescription chosen for the prescription medicines (C-08), with a way to change it */
  rx?: ChosenRx | null;
  onChangeRx?: () => void;
  /** e.g. "Prescription" or "Address": the step Back returns to */
  backLabel?: string;
  onBack: () => void;
  onPlace: (declaration: boolean) => void;
}

const RETURN_POLICIES: PolicyKey[] = ['refund', 'cancellation', 'shipping'];

/** Everything the buyer must see before paying (C-35): sellers, licences, lines, charges, returns and policies. */
export default function ReviewStep({ body, needsDeclaration, placing, rx, onChangeRx, backLabel = 'Back', onBack, onPlace }: Props) {
  const [declared, setDeclared] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: checkoutKeys.preview(body),
    queryFn: () => previewOrder(body),
    staleTime: 0,
    retry: false,
  });
  const policyKeys = data?.policies?.length
    ? data.policies.map((p) => p.doc_key).filter((k): k is PolicyKey => (POLICY_KEYS as readonly string[]).includes(k))
    : RETURN_POLICIES;

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <ClipboardCheck className="w-5 h-5 text-brand-600" /> Review your order
      </h2>
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {data && (
        <>
          <div className="space-y-3">
            {data.shipments.map((s, i) => (
              <PreviewShipmentBlock key={`${s.seller_type}-${s.seller_name}-${i}`} s={s} />
            ))}
          </div>
          {rx && (<><RxAttachedLine rx={rx} onChange={onChangeRx} /><RxPolicyNote /></>)}
          <ChargeBreakup charges={data.charges} paymentTerms={data.payment_terms} />
          <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 space-y-2">
            <p className="whitespace-pre-line">{data.returns_note}</p>
            <PolicyLinks keys={policyKeys} newTab />
          </div>
          {needsDeclaration && <PractitionerDeclaration checked={declared} onChange={setDeclared} />}
        </>
      )}
      <div className="flex gap-3">
        <button onClick={onBack} disabled={placing} className="btn-outline flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> {backLabel}
        </button>
        <button
          onClick={() => onPlace(declared)}
          disabled={placing || !data || (needsDeclaration && !declared)}
          className="btn-primary flex-1 py-3 flex items-center justify-center gap-2"
        >
          {placing && <Loader2 className="w-4 h-4 animate-spin" />}
          Place order and pay <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
