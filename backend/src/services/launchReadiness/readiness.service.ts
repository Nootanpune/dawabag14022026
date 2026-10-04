// Admin → Launch readiness (Sprint 49): the live docs/LAUNCH_CHECKLIST.md. Computed items
// (computed.ts, from facts read now) and the admin-kept manual items (manual.service.ts),
// grouped by the checklist's sections, with "X of Y ready".
import { computeItems, manualEvidence, statusLabel, summarise } from './computed';
import { readinessFacts } from './facts.service';
import { manualItems, ManualRow } from './manual.service';
import { ReadinessFacts, ReadinessItem, SECTIONS } from './types';

export function manualItem(row: ManualRow, facts: ReadinessFacts): ReadinessItem {
  return {
    key: row.item_key, ref: row.item_key.split('-')[0], section: row.section, kind: 'manual', title: row.title, who: row.who,
    status: row.status, status_label: statusLabel(row.status, 'manual', facts.app_env), evidence: manualEvidence(row.item_key, facts),
    link: row.link_href ? { href: row.link_href, label: row.link_label ?? 'Open' } : null,
    note: row.note, updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null, updated_by_name: row.updated_by_name,
  };
}

const refOrder = (ref: string) => ref.split('.').map(Number);

export async function launchReadiness() {
  const facts = await readinessFacts();
  const items = [...computeItems(facts), ...(await manualItems()).map((r) => manualItem(r, facts))]
    .sort((a, b) => {
      const [as, an] = refOrder(a.ref), [bs, bn] = refOrder(b.ref);
      return as - bs || an - bn || (a.kind === b.kind ? 0 : a.kind === 'computed' ? -1 : 1);
    });
  return {
    checked_at: facts.now,
    app_env: facts.app_env,
    summary: summarise(items),
    // The counts behind the items (no secret values: presence flags and provider names only)
    facts,
    sections: Object.entries(SECTIONS).map(([n, title]) => {
      const inSection = items.filter((i) => i.section === Number(n));
      return { section: Number(n), title, summary: summarise(inSection), items: inSection };
    }),
  };
}
