import type { ReadinessItem, ReadinessSection } from '@/lib/admin/launchReadiness';
import { readyText } from '@/lib/admin/launchReadiness';
import ReadinessItemCard from './ReadinessItemCard';

/** One group of the checklist (legal, payments, SMS …) with its own "X of Y ready". */
export default function ReadinessSectionCard({ section, items, onEdit }: {
  section: ReadinessSection; items: ReadinessItem[]; onEdit: (item: ReadinessItem) => void;
}) {
  const id = `readiness-section-${section.section}`;
  return (
    <section aria-labelledby={id} className="mb-5" data-testid={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h2 id={id} className="text-sm font-semibold text-gray-800">{section.section}. {section.title}</h2>
        <span className="text-xs text-gray-500">{readyText(section.summary)}</span>
      </div>
      {items.length ? (
        <ul className="card p-0 divide-y divide-gray-100">
          {items.map((i) => <ReadinessItemCard key={i.key} item={i} onEdit={onEdit} />)}
        </ul>
      ) : (
        <p className="text-xs text-gray-400 card">Everything here is done or not applicable.</p>
      )}
    </section>
  );
}
