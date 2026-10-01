// A sample handwritten-style prescription, drawn in the browser and kept in
// memory only, for the buyer's upload step
import { Browser } from '@playwright/test';
import { todayIST } from './time';

export async function samplePrescription(browser: Browser): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: 620, height: 820 } });
  await page.setContent(`<body style="margin:0;font-family:Georgia,serif;background:#fffdf7;color:#1f2a44">
    <div style="padding:36px 40px;border-bottom:3px double #1f2a44">
      <div style="font-size:26px;font-weight:bold">Dr. Asha Kulkarni, MBBS, MD</div>
      <div style="font-size:15px;margin-top:4px">Reg. No. MMC-2011-4455 · Kulkarni Clinic, College Road, Nashik 422005</div>
    </div>
    <div style="padding:28px 40px;font-size:18px;line-height:1.7">
      <div>Date: ${todayIST()}</div>
      <div>Patient: E2E Buyer · 34 y · M</div>
      <div style="font-size:44px;margin:18px 0 6px">℞</div>
      <div style="font-family:'Comic Sans MS',cursive;font-size:22px">Tab/Cap Amoxicillin 500 mg — 1 BD × 5 days</div>
      <div style="font-family:'Comic Sans MS',cursive;font-size:22px">Qty: 10</div>
      <div style="margin-top:120px;text-align:right;font-family:'Comic Sans MS',cursive">A. Kulkarni</div>
    </div></body>`);
  const png = await page.screenshot();
  await page.close();
  return png;
}
