// Sprint 40 — self-inspection register (O15, C-34): checklists kept by admins, inspections
// recorded by a pharmacist (append-only), corrective actions with a status history, and an
// overdue action alerting admins once.
import { call, check, q } from '../sprint5/lib.mjs';
import { ids, inDays, noted, plainClient, t } from './fixtures.mjs';

export async function runSelfInspection() {
  console.log('\nH. Self-inspection register (O15, C-34)');
  let r = await call('GET', '/self-inspections/templates', { token: t.pharmacist });
  check('the starting monthly checklist is there', r.status === 200 && r.json.data.templates.some((x) => x.name === 'Monthly pharmacy self-inspection'
    && x.items.some((i) => i.key === 'cold_chain_equipment')), r.json.data?.templates?.map((x) => x.name));
  const body = { name: 'S40 Weekly cold-chain check', frequency: 'weekly', items: [
    { label: 'Fridge temperature log complete', guidance: 'Twice daily' }, { label: 'Data logger calibrated' }, { label: 'Pest control record' }] };
  r = await call('POST', '/self-inspections/templates', { token: t.pharmacist, body });
  check('only admins define checklists', r.status === 403);
  r = await call('POST', '/self-inspections/templates', { token: t.opsAdmin, body });
  check('an admin defines a weekly checklist', r.status === 201, r.json);
  const tpl = r.json.data.id;
  const items = (await call('GET', '/self-inspections/templates', { token: t.opsAdmin })).json.data.templates.find((x) => x.id === tpl);
  check('… due a week after it was set up, not overdue yet', items?.next_due_on === inDays(7) && items.overdue === false, items);
  const [fridge, logger, pests] = items.items.map((i) => i.key);

  const results = (action) => [{ item_key: fridge, result: 'ok' }, { item_key: logger, result: 'observation', note: 'Calibration due next month' },
    { item_key: pests, result: 'non_conformity', note: 'No pest control for 2 months', action }];
  r = await call('POST', '/self-inspections', { token: t.pharmacist, body: { template_id: tpl, results: results(undefined) } });
  check('a non-conformity without a corrective action is refused', r.status === 400 && /corrective action/.test(r.json.message), r.json);
  r = await call('POST', '/self-inspections', { token: t.packer, body: { template_id: tpl, results: results({ description: 'Book pest control', owner_user_id: ids.packer, due_date: inDays(2) }) } });
  check('a packer cannot record an inspection', r.status === 403);
  r = await call('POST', '/self-inspections', { token: t.pharmacist, body: { template_id: tpl, summary: 'S40 weekly check',
    results: results({ description: 'Book the pest-control service and file the certificate', owner_user_id: ids.packer, due_date: inDays(2) }) } });
  check('the pharmacist records the inspection with a corrective action (owner, due date)', r.status === 201 && r.json.data.corrective_actions.length === 1, r.json);
  const insp = r.json.data.id;
  const actionId = r.json.data.corrective_actions[0]?.id;
  r = await call('GET', `/self-inspections/${insp}`, { token: t.opsAdmin });
  check('… results and counts kept', r.status === 200 && r.json.data.ok_count === 1 && r.json.data.observation_count === 1 && r.json.data.non_conformity_count === 1
    && r.json.data.actions[0]?.history?.[0]?.to_status === 'open', r.json.data);

  const plain = await plainClient();
  const err = (sql, p) => plain.query(sql, p).then(() => null, (e) => e.message);
  check('results are append-only (database)', /append-only/.test(await err(`UPDATE self_inspection_results SET result = 'ok' WHERE inspection_id = $1`, [insp]) ?? ''));
  check('an inspection cannot be deleted', /append-only/.test(await err(`DELETE FROM self_inspections WHERE id = $1`, [insp]) ?? ''));
  check('a corrective action\'s description cannot be rewritten', /Only the status/.test(await err(`UPDATE corrective_actions SET description = 'x' WHERE id = $1`, [actionId]) ?? ''));

  r = await call('POST', `/self-inspections/actions/${actionId}/status`, { token: t.buyer, body: { status: 'closed', note: 'done' } });
  check('buyers have no access', r.status === 403);
  r = await call('POST', `/self-inspections/actions/${actionId}/status`, { token: t.packer, body: { status: 'in_progress', note: 'Called the pest-control firm' } });
  check('the owner moves it to in progress', r.status === 200, r.json);
  // Time passes: the due date is now in the past (test database, maintenance session)
  await q(`UPDATE corrective_actions SET due_date = CURRENT_DATE - 1 WHERE id = $1`, [actionId]);
  r = await call('POST', '/admin/jobs/self_inspection_watch/run', { token: t.admin });
  check('the watch job runs', r.status === 200 && r.json.data?.status === 'succeeded', r.json);
  check('admins are alerted about the overdue action', (await noted(ids.opsAdmin, 'self_inspection_overdue')).some((n) => /CAPA-/.test(n.body)));
  check('… and the owner too', (await noted(ids.packer, 'self_inspection_overdue')).length >= 1);
  await call('POST', '/admin/jobs/self_inspection_watch/run', { token: t.admin });
  await new Promise((res) => setTimeout(res, 800));
  const n = (await q(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND type = 'self_inspection_overdue' AND body LIKE '%CAPA-%'`, [ids.opsAdmin]))[0].n;
  check('… only once', n === 1, n);
  r = await call('GET', '/self-inspections/actions?status=overdue', { token: t.opsAdmin });
  check('the overdue list shows it', r.json.data?.actions?.some((a) => a.id === actionId && a.overdue), r.json.data);
  r = await call('POST', `/self-inspections/actions/${actionId}/status`, { token: t.packer, body: { status: 'closed' } });
  check('closing needs a close-out note', r.status === 400, r.json);
  r = await call('POST', `/self-inspections/actions/${actionId}/status`, { token: t.packer, body: { status: 'closed', note: 'Service done, certificate filed' } });
  check('the owner closes it with a note', r.status === 200, r.json);
  r = await call('POST', `/self-inspections/actions/${actionId}/status`, { token: t.opsAdmin, body: { status: 'open', note: 'reopen' } });
  check('a closed action is final', r.status === 409, r.json);
  const hist = await q(`SELECT from_status, to_status, note FROM corrective_action_events WHERE action_id = $1 ORDER BY changed_at`, [actionId]);
  check('the status history keeps every step with its note', hist.map((h) => h.to_status).join(',') === 'open,in_progress,closed'
    && hist[1].note === 'Called the pest-control firm' && hist[2].note === 'Service done, certificate filed', hist);
  check('the history is append-only', /append-only/.test(await err(`DELETE FROM corrective_action_events WHERE action_id = $1`, [actionId]) ?? ''));
  await plain.end();
}
