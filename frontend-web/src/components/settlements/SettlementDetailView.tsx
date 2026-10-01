import type { SettlementDetail } from '@/lib/marketplace/settlement';
import SettlementBreakdown from './SettlementBreakdown';
import SettlementLinesTable from './SettlementLinesTable';
import SettlementAdjustments from './SettlementAdjustments';

export default function SettlementDetailView({ settlement }: { settlement: SettlementDetail }) {
  return (
    <div className="space-y-4">
      <SettlementBreakdown s={settlement} />
      {!!settlement.adjustments?.length && <SettlementAdjustments rows={settlement.adjustments} />}
      <div>
        <h3 className="font-semibold text-sm mb-2">Lines ({settlement.lines?.length ?? 0})</h3>
        <SettlementLinesTable lines={settlement.lines ?? []} />
      </div>
    </div>
  );
}
