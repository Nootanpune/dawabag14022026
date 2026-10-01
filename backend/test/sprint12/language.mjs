// The privacy notice in Marathi and Hindi; consent cites what was shown (DPDP s.5(3), C-40)
import { call, check, q } from '../sprint5/lib.mjs';
import { MARATHI_BUYER, login, signUp } from './fixtures.mjs';

const body = (s) => `${s} `.repeat(20).trim();

export async function runLanguage({ t }) {
  const today = new Date().toISOString().slice(0, 10);
  console.log('Policies in English, Marathi and Hindi');
  let r = await call('POST', '/legal/policies', { token: t.admin, body: { doc_key: 'privacy', title: 'S12 Privacy notice', body: body('We collect your mobile number to deliver medicines.'), effective_from: today, lawyer_reviewed: true } });
  const v = r.json.data?.version;
  check('English privacy notice published', r.status === 201 && v >= 1, r.json);
  const mr = { version: v, language: 'mr', title: 'S12 गोपनीयता सूचना', body: body('औषधे पोहोचवण्यासाठी आम्ही तुमचा मोबाईल क्रमांक घेतो.'), lawyer_reviewed: true };
  r = await call('POST', '/legal/policies/privacy/translations', { token: t.buyer, body: mr });
  check('buyers cannot publish translations', r.status === 403, r.status);
  r = await call('POST', '/legal/policies/privacy/translations', { token: t.admin, body: { ...mr, version: v + 50 } });
  check('a translation needs its English version first', r.status === 404, r.json);
  r = await call('POST', '/legal/policies/privacy/translations', { token: t.admin, body: mr });
  check('Marathi translation of the same version published', r.status === 201 && r.json.data.language === 'mr' && r.json.data.version === v, r.json);
  r = await call('POST', '/legal/policies/privacy/translations', { token: t.admin, body: mr });
  check('a published translation is never overwritten', r.status === 409, r.json);
  r = await call('GET', '/legal/policies/privacy?lang=mr');
  check('reader asking for Marathi gets the Marathi text', r.json.data?.language === 'mr' && r.json.data.translation_available === true && r.json.data.version === v, r.json.data);
  r = await call('GET', '/legal/policies/privacy?lang=hi');
  check('no Hindi yet: English shown, flagged as a fallback', r.json.data?.language === 'en' && r.json.data.translation_available === false, r.json.data);
  r = await call('GET', '/legal/policies/privacy?lang=fr');
  check('only English, Marathi and Hindi', r.status === 422, r.status);
  r = await call('GET', '/legal/policies');
  check('policy list shows which languages the current version has', r.json.data?.policies?.find((p) => p.doc_key === 'privacy')?.languages?.join() === 'en,mr', r.json.data);

  console.log('Consent records the notice and language actually shown');
  const reg = await signUp(MARATHI_BUYER);
  const consents = await q(`SELECT purpose, policy_version, notice_language FROM consent_records WHERE user_id = $1`, [reg.user_id]);
  check('sign-up consent cites the published notice version, in Marathi', consents.length >= 3
    && consents.every((c) => c.policy_version === `privacy-v${v}` && c.notice_language === 'mr'), consents);
  const pref = (await q(`SELECT preferred_language FROM users WHERE id = $1`, [reg.user_id]))[0].preferred_language;
  check('the chosen language is remembered for later notices', pref === 'mr', pref);
  const tok = await login(MARATHI_BUYER);
  r = await call('PUT', '/privacy/consents/marketing', { token: tok, body: { granted: true } });
  const last = (await q(`SELECT policy_version, notice_language FROM consent_records WHERE user_id = $1 AND purpose = 'marketing' ORDER BY recorded_at DESC LIMIT 1`, [reg.user_id]))[0];
  check('a later marketing choice cites the same notice and language', last?.policy_version === `privacy-v${v}` && last.notice_language === 'mr', { status: r.status, last });
}
