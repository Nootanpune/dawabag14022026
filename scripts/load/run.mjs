// Runs each scenario with autocannon at two concurrency levels and prints a
// table of throughput and latency. See scripts/load-test.sh.
import { execFileSync } from 'child_process';
import { API, PIN, seed, teardown } from './seed.mjs';

const DURATION = Number(process.env.LOAD_SECONDS || 15);
const LEVELS = (process.env.LOAD_CONNECTIONS || '10,50').split(',').map(Number);

function hit(name, url, connections, { method = 'GET', body, token } = {}) {
  const args = ['--yes', 'autocannon', '--json', '-c', String(connections), '-d', String(DURATION), '-m', method];
  if (token) args.push('-H', `Authorization=Bearer ${token}`);
  if (body) args.push('-H', 'Content-Type=application/json', '-b', JSON.stringify(body));
  args.push(url);
  const out = JSON.parse(execFileSync('npx', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }));
  return { name, connections, rps: Math.round(out.requests.average), p50: out.latency.p50, p95: out.latency.p97_5 ?? out.latency.p95, p99: out.latency.p99,
           ok: out['2xx'], errors: out.non2xx + out.errors + out.timeouts };
}

const data = await seed();
const product = data.productIds[123];
const scenarios = [
  ['Search "para" (signed out)', `${API}/products/search?q=para&pincode=${PIN}&limit=20`, {}],
  ['Browse a category', `${API}/products/search?category=Load%20test&limit=20`, {}],
  ['Product page', `${API}/products/${product}`, {}],
  ['Cart (signed in)', `${API}/cart`, { token: data.token }],
  ['Checkout preview (signed in)', `${API}/orders/preview`, { method: 'POST', token: data.token,
    body: { address_id: data.address, pincode: PIN, items: [{ product_id: product, quantity: 2 }, { product_id: data.productIds[7], quantity: 1 }] } }],
];
const rows = [];
try {
  for (const [name, url, opts] of scenarios) for (const c of LEVELS) { rows.push(hit(name, url, c, opts)); process.stderr.write('.'); }
} finally { await teardown(); }
process.stderr.write('\n');
console.log(JSON.stringify({ duration_s: DURATION, catalogue: data.productIds.length, rows }, null, 2));
