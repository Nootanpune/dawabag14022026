// Sprint 15 smoke test — request ids for support (access log, error reply, header).
//   API_URL=http://localhost:4000 node test/sprint15.smoke.mjs
const ORIGIN = process.env.API_URL || 'http://localhost:4000';
let failures = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`); if (!ok) failures++; };

async function main() {
  console.log('Request ids');
  let r = await fetch(`${ORIGIN}/health`);
  const id = r.headers.get('x-request-id');
  check('every reply carries an X-Request-Id', /^[0-9a-f-]{36}$/.test(id || ''), id);
  r = await fetch(`${ORIGIN}/health`, { headers: { 'X-Request-Id': 'lb-trace-12345678' } });
  check("the load balancer's id is kept", r.headers.get('x-request-id') === 'lb-trace-12345678');
  r = await fetch(`${ORIGIN}/health`, { headers: { 'X-Request-Id': 'bad id <script>' } });
  check('an unsafe id is replaced', /^[0-9a-f-]{36}$/.test(r.headers.get('x-request-id') || ''), r.headers.get('x-request-id'));
  r = await fetch(`${ORIGIN}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const body = await r.json();
  check('an error reply names the same id for support', r.status >= 400 && body.request_id === r.headers.get('x-request-id'), body);
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll Sprint 15 checks passed');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
