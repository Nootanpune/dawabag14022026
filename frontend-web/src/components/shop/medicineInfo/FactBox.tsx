import type { InfoContent } from '@/lib/medicineInfo/types';

/** Therapeutic, chemical and action class, and whether it is habit forming. */
export default function FactBox({ facts }: { facts: Partial<InfoContent['facts']> }) {
  const rows: [string, string | null | undefined][] = [
    ['Therapeutic class', facts.therapeutic_class],
    ['Chemical class', facts.chemical_class],
    ['Action class', facts.action_class],
    ['Habit forming', facts.habit_forming == null ? null : facts.habit_forming ? 'Yes' : 'No'],
  ];
  return (
    <dl className="rounded-lg border border-gray-200 divide-y divide-gray-100" data-testid="fact-box">
      {rows.filter(([, v]) => !!v).map(([label, value]) => (
        <div key={label} className="flex gap-3 px-3 py-2">
          <dt className="w-36 shrink-0 text-gray-500">{label}</dt>
          <dd className="text-gray-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
