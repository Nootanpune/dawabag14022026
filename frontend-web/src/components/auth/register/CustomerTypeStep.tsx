import { User, Store, Warehouse, Stethoscope, Clock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CUSTOMER_TYPE_OPTIONS, type CustomerType } from '@/lib/registration';

const ICONS: Record<CustomerType, typeof User> = {
  customer: User,
  b2b_retailer: Store,
  b2b_wholesaler: Warehouse,
  doc_hospital: Stethoscope,
};

interface Props {
  selected: CustomerType | null;
  onSelect: (type: CustomerType) => void;
}

export default function CustomerTypeStep({ selected, onSelect }: Props) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">How will you use Dawabag?</h2>
      <p className="text-sm text-gray-500 mb-4">Choose the account type that fits you.</p>
      <div className="space-y-3">
        {CUSTOMER_TYPE_OPTIONS.map((opt) => {
          const Icon = ICONS[opt.value];
          const isSelected = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              className={cn(
                'w-full text-left border rounded-xl p-4 flex items-start gap-3 transition-all hover:border-brand-400 hover:bg-brand-50',
                isSelected ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-gray-200 bg-white'
              )}
            >
              <span className="w-10 h-10 shrink-0 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center">
                <Icon className="w-5 h-5" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-gray-900">{opt.label}</span>
                <span className="block text-xs text-gray-500 mt-0.5">{opt.description}</span>
                <span className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-800 font-medium">
                    {opt.pricing}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    {opt.kycNote}
                  </span>
                </span>
              </span>
              <ChevronRight className="w-4 h-4 text-gray-400 self-center" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
