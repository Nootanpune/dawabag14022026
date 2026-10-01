// Sample pack photos for the recording: drawn in the browser, kept in memory,
// uploaded by the admin to the object store and approved by the pharmacist
// (C-19), so the shop shows real-looking pack shots instead of placeholders.
import { Browser } from '@playwright/test';
import { API } from '../../support/data';
import { apiAs, token } from './people';

async function packShot(browser: Browser, name: string, strength: string, tint: string): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: 480, height: 480 } });
  await page.setContent(`<body style="margin:0;display:grid;place-items:center;height:480px;background:#f3f5f4;font-family:Arial,sans-serif">
    <div style="width:330px;height:210px;border-radius:14px;background:#fff;box-shadow:0 18px 40px rgba(0,0,0,.18);overflow:hidden;transform:rotate(-6deg)">
      <div style="height:62px;background:${tint}"></div>
      <div style="padding:18px 22px"><div style="font-size:30px;font-weight:700;color:#1d2a24">${name}</div>
      <div style="font-size:18px;color:#56645b;margin-top:6px">${strength}</div></div></div></body>`);
  const png = await page.screenshot();
  await page.close();
  return png;
}

async function upload(productId: string, png: Buffer) {
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'pack.png');
  const res = await fetch(`${API}/products/${productId}/image`, { method: 'PUT', body: form, headers: { Authorization: `Bearer ${await token('admin')}` } });
  if (res.status >= 300) throw new Error(`Photo upload ${res.status}: ${await res.text()}`);
}

export async function addPackPhotos(browser: Browser, products: { id: string; name: string; strength: string; tint: string }[]) {
  for (const p of products) {
    await upload(p.id, await packShot(browser, p.name, p.strength, p.tint));
    await apiAs('pharmacist', 'POST', `/products/${p.id}/content-review`, { approve: true, notes: 'Photo shows this exact pack' });
  }
}
