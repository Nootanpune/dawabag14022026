// Sprint 33 — trust pages kept on the server, numbers filled from the live settings,
// published by admins as new versions (audited, C-46).
import { call, check, q } from '../sprint5/lib.mjs';
import { ids, t } from './fixtures.mjs';

const setting = async (key, fallback) => {
  const r = await q(`SELECT value FROM app_settings WHERE key = $1`, [key]);
  return r.length ? Number(r[0].value) : fallback;
};

export async function runTrustPages() {
  console.log('\nTrust pages');
  let r = await call('GET', '/info-pages');
  const keys = (r.json.data ?? []).map((p) => p.page_key).sort();
  check('three pages are published', r.status === 200 && JSON.stringify(keys) === '["expired-damaged-recalled","genuine-medicines","pharmacist-checked"]', keys);
  r = await call('GET', '/info-pages/expired-damaged-recalled');
  const hours = await setting('returns.report_within_hours', 48);
  const shelf = await setting('purchasing.min_shelf_life_days', 180);
  check('numbers come from today’s settings; no placeholder left', r.status === 200 && !r.json.data.body.includes('{{')
    && r.json.data.body.includes(`within ${hours} hours`) && r.json.data.body.includes(`at least ${shelf} days`)
    && r.json.data.body.includes('expires within 30 days'), r.json.data?.body);
  r = await call('GET', '/info-pages/pharmacist-checked');
  // Sprint 35: every order is checked by a pharmacist now, so migration 30 replaced the seed text
  check('the pharmacist page says what the system does (every order checked before packing)', r.status === 200
    && /Every order is checked by a registered pharmacist before it is packed/.test(r.json.data.body), r.json.data?.title);
  r = await call('GET', '/info-pages/terms');
  check('an unknown page is 404', r.status === 404, r.status);

  r = await call('POST', '/info-pages/genuine-medicines', { token: t.buyer, body: { title: 'S33 x', summary: 'S33 summary text', body: 'x'.repeat(30) } });
  check('buyers cannot publish', r.status === 403, r.status);
  r = await call('POST', '/info-pages/genuine-medicines', { token: t.admin, body: { title: 'S33 Genuine medicines',
    summary: 'S33 summary of the page.', body: 'We offer a {{discount_pct}} discount on everything today.' } });
  check('an unknown placeholder is refused', r.status === 400 && /Unknown placeholder: \{\{discount_pct\}\}/.test(r.json.message), r.json);
  r = await call('POST', '/info-pages/genuine-medicines', { token: t.admin, body: { title: 'S33 Genuine medicines',
    summary: 'S33 summary of the page.', body: '## Who sells to you\nOnly licensed sellers. Returns within {{returns_report_hours}} hours.' } });
  check('admin publishes version 2', r.status === 201 && r.json.data?.version === 2, r.json);
  r = await call('GET', '/info-pages/genuine-medicines');
  check('the page now shows version 2, filled', r.json.data?.version === 2 && r.json.data.body.includes(`within ${hours} hours`), r.json.data);
  r = await call('GET', '/info-pages/genuine-medicines/history', { token: t.admin });
  check('history keeps version 1', (r.json.data ?? []).map((v) => v.version).join(',') === '2,1', r.json.data?.map((v) => v.version));
  const audit = await q(`SELECT 1 FROM audit_logs WHERE action = 'info_page_published' AND performed_by = $1`, [ids.admin]);
  check('publishing is audited (C-46)', audit.length === 1, audit);
  // put version 1 back as the live text for everyone else
  await q(`DELETE FROM info_pages WHERE page_key = 'genuine-medicines' AND version > 1 AND published_by = $1`, [ids.admin]);
}
