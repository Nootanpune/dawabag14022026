import { STANDING_LABELS, type Standing } from '@/lib/pharmacistRegistrations/api';

/** Where a registration stands: green when it may be used, amber with a warning, red when blocked. */
export default function StandingBadge({ standing }: { standing: Standing }) {
  const tone = !standing.ok ? 'bg-red-50 text-red-800 border-red-200'
    : standing.message ? 'bg-amber-50 text-amber-900 border-amber-300' : 'bg-green-50 text-green-800 border-green-200';
  return (
    <span className={`inline-block text-[11px] font-medium border rounded-full px-2 py-0.5 ${tone}`} title={standing.message ?? undefined} data-testid="registration-standing">
      {STANDING_LABELS[standing.state]}{standing.ok ? '' : ' — blocked'}
    </span>
  );
}
