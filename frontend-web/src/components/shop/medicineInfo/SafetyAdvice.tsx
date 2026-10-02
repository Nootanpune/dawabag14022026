import type { PublicSafety, SafetyLevel } from '@/lib/medicineInfo/types';

const LEVEL_STYLE: Record<SafetyLevel, string> = {
  safe: 'bg-green-100 text-green-800',
  caution: 'bg-amber-100 text-amber-900',
  unsafe: 'bg-red-100 text-red-800',
  consult_doctor: 'bg-blue-100 text-blue-800',
  not_known: 'bg-gray-100 text-gray-700',
};

/** Alcohol, pregnancy, breast-feeding, driving, kidney, liver — only the topics the pharmacist set. */
export default function SafetyAdvice({ items }: { items: PublicSafety[] }) {
  return (
    <ul className="divide-y divide-gray-100" data-testid="safety-advice">
      {items.map((s) => (
        <li key={s.topic} className="py-2 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
          <span className="w-32 shrink-0 font-medium text-gray-900">{s.label}</span>
          <span className={`self-start text-xs font-semibold px-2 py-0.5 rounded-full ${LEVEL_STYLE[s.level]}`}>{s.level_label}</span>
          {s.note && <span className="text-gray-700">{s.note}</span>}
        </li>
      ))}
    </ul>
  );
}
