// Partner pharmacy, part 1: a nearby licensed pharmacy joins the marketplace.
// Its application (licence, GSTIN, address) is on file as Dawabag received it —
// the website has no self-service application yet. The admin approves the licence
// and its own invoice series, links the owner's login and agrees the commission;
// the partner lists a catalogue product with stock; the admin approves the
// listing and puts it live (marketplace rules in docs/DECISIONS.md; C-05, C-13).
import { Browser } from '@playwright/test';
import { shooter } from '../lib/recorder';
import { apiAs, staff } from '../lib/people';
import { dialog, field, newSession, onScreenOr, signIn } from '../lib/steps';
import { dbRow } from '../lib/orders';
import { todayIST } from '../lib/time';
import { PIN } from '../../support/data';

export const PART = 'Partner pharmacy';
// Name starts 'E2E ' so the clean-up removes it; it sits at the buyer's PIN code,
// nearer than Dawabag's own premises, so the buyer's small order goes to it
export const PARTNER = { name: 'E2E Lake Road Pharmacy', prefix: 'LRP', licence: 'E2E-MH-NSK-20-11873' };
export const ORS = { name: 'E2E ORS Electrolyte Sachet', sku: 'E2E-ORS' };
const later = (days: number) => todayIST(new Date(Date.now() + days * 86400e3));
const vendorId = async () => (await dbRow(`SELECT id FROM vendors WHERE name = $1`, [PARTNER.name]))!.id as string;
const listingId = async () => (await dbRow(`SELECT pp.id FROM partner_products pp JOIN products p ON p.id = pp.product_id WHERE p.sku = $1`, [ORS.sku]))!.id as string;

/** The product the partner will list (already in Dawabag's catalogue) and the partner's application on file */
async function partnerSetup() {
  await apiAs('admin', 'POST', '/products', {
    name: ORS.name, sku: ORS.sku, category: 'Hydration', drug_schedule: 'OTC', gst_rate: 12, hsn_code: '30049099',
    mrp_paise: 2500, offer_price_paise: 2200, max_qty_per_order: 10, net_quantity: '21.8 g sachet',
    manufacturer_name: 'E2E Pharma Ltd', manufacturer_address: 'Plot 19, MIDC Satpur, Nashik 422007', country_of_origin: 'India',
  });
  // Sprint 39 (C-10): a new product starts "not allowed online" until a pharmacist allows it (dated reference)
  const ors = (await dbRow(`SELECT id FROM products WHERE sku = $1`, [ORS.sku]))!.id;
  await apiAs('pharmacist', 'POST', '/online-sale/products/bulk', { product_ids: [ors], status: 'permitted',
    notification_ref: 'Journey test approval', notification_date: todayIST() });
  // No Dawabag stock: only the partner holds it, and partner stock counts (owner decision 1 Oct 2026)
  await dbRow(`INSERT INTO vendors (name, drug_license_no, gst_number, contact_name, contact_mobile, address_line1, city, state, pincode,
                 latitude, longitude, vendor_type, approval_status)
               VALUES ($1, $2, '27AAJFL1234K1Z3', 'Journey Partner Owner', $3, '21 Lake Road', 'Nashik', 'Maharashtra', $4,
                 20.01, 73.79, 'marketplace_partner', 'pending')`, [PARTNER.name, PARTNER.licence, staff.partner.mobile, PIN]);
}

export async function partnerOnboarding(browser: Browser) {
  await partnerSetup();
  const admin = await newSession(browser, 'laptop');
  const adminShot = shooter(admin.page, PART, 'Admin', 'laptop');
  await signIn(admin.page, 'admin');
  await admin.page.goto('/admin/vendors');
  const row = admin.page.locator('tr', { hasText: PARTNER.name });
  await row.first().waitFor();
  await adminShot('Partner application', 'A nearby pharmacy has applied to sell on Dawabag. The admin checks its drug licence on the state portal linked here and its GSTIN.');
  let note = await onScreenOr(async () => {
    await row.getByRole('button', { name: 'Approve' }).click();
    const d = dialog(admin.page);
    // Sprint 30: a partner whose licences are already on file is not asked for them again
    if (await d.getByLabel('Drug licence form').count()) {
      await d.getByLabel('Drug licence form').selectOption('dl20');
      await d.getByLabel('Licence valid till').fill(later(3 * 365));
    }
    await d.getByLabel('Vendor type').selectOption('marketplace_partner');
    await d.getByLabel('Invoice prefix').fill(PARTNER.prefix);
    await adminShot('Approve the licence', 'Approval records the licence type and expiry; the partner gets its own invoice series, because the partner, not Dawabag, is the seller of record (C-05, C-13).');
    await d.getByRole('button', { name: 'Approve' }).click();
    await d.waitFor({ state: 'detached' });
  }, async () => {
    await apiAs('admin', 'POST', `/vendors/${await vendorId()}/approve`, { drug_license_type: 'dl20', drug_license_expiry: later(3 * 365), vendor_type: 'marketplace_partner', invoice_prefix: PARTNER.prefix });
    await admin.page.reload();
  }, admin.page);
  const partnerRow = admin.page.locator('tr', { hasText: PARTNER.name });
  note = (await onScreenOr(async () => {
    await partnerRow.getByRole('button', { name: /Link partner login/ }).click();
    await dialog(admin.page).locator('input').fill(staff.partner.mobile);
    await dialog(admin.page).getByRole('button', { name: 'Link login' }).click();
    await dialog(admin.page).waitFor({ state: 'detached' });
    await partnerRow.getByRole('button', { name: 'Commission' }).click();
    await field(dialog(admin.page), 'Commission').fill('10');
    await field(dialog(admin.page), 'Finding fee').fill('20');
    await adminShot('Agree the commission', 'The owner\'s own Dawabag account becomes the partner\'s login, and the agreed commission and per-order finding fee are recorded for the settlements.');
    await dialog(admin.page).getByRole('button', { name: 'Save' }).click();
    await dialog(admin.page).waitFor({ state: 'detached' });
  }, async () => {
    const v = await vendorId();
    await apiAs('admin', 'POST', `/admin/partners/${v}/users`, { mobile: staff.partner.mobile }).catch(() => {});
    await apiAs('admin', 'PUT', `/admin/partners/${v}/commission`, { commission_pct: 10, finding_fee_paise: 2000 });
  }, admin.page)) ?? note;
  await adminShot('Partner approved', 'The pharmacy is now an approved marketplace partner with a portal login.', { note });

  // ── The partner lists a product and its stock ──
  const part = await newSession(browser, 'laptop');
  const partShot = shooter(part.page, PART, 'Partner', 'laptop');
  await signIn(part.page, 'partner');
  await part.page.goto('/partner');
  await partShot('Partner portal', 'The partner\'s home: live listings, listings waiting for review, shipments to send and unpaid settlements, with the licence and invoice series on file.', { fullPage: true });
  await part.page.goto('/partner/catalogue');
  note = await onScreenOr(async () => {
    await part.page.getByPlaceholder('Search by name, generic or SKU').fill('E2E ORS');
    await part.page.locator('tr', { hasText: ORS.name }).getByRole('button', { name: 'List this product' }).click();
    await dialog(part.page).getByRole('checkbox').check();
    await partShot('List a catalogue product', 'Partners sell only products from Dawabag\'s catalogue, at Dawabag\'s price; they agree to that before listing. Schedule X is never offered.');
    await dialog(part.page).getByRole('button', { name: 'Submit for review' }).click();
    await dialog(part.page).waitFor({ state: 'detached' });
  }, async () => {
    const p = await dbRow(`SELECT id FROM products WHERE sku = $1`, [ORS.sku]);
    await apiAs('partner', 'POST', '/partner/products', { product_id: p.id, catalogue_price_accepted: true });
  }, part.page);
  await part.page.goto('/partner/listings');
  note = (await onScreenOr(async () => {
    await part.page.locator('tr', { hasText: ORS.name }).getByRole('button', { name: 'Edit stock' }).click();
    const d = dialog(part.page);
    await d.getByLabel('Batch number').fill('LRP-ORS-0925');
    await d.getByLabel('Quantity').fill('60');
    await d.getByLabel('Expiry date').fill(later(540));
    await partShot('Add stock', 'The partner enters stock by batch with its expiry, so the batch and expiry go on the buyer\'s invoice and short-dated stock is never sent (C-27).');
    await d.getByRole('button', { name: 'Save stock' }).click();
    await d.getByText('Batches on file').waitFor();
    await part.page.keyboard.press('Escape');
  }, async () => apiAs('partner', 'PUT', `/partner/products/${await listingId()}/inventory`, { batches: [{ batch_number: 'LRP-ORS-0925', qty_available: 60, expiry_date: later(540) }] }),
  part.page)) ?? note;
  await part.page.reload();
  await partShot('Waiting for review', 'Listed with 60 in stock; Dawabag reviews every listing before buyers can be sent to it.', { note });

  // ── Dawabag reviews the listing ──
  await admin.page.goto('/admin/listings');
  const listing = admin.page.locator('tr', { hasText: ORS.name });
  await listing.first().waitFor();
  await adminShot('Listing review', 'Each new listing is checked by Dawabag before it goes live.');
  note = await onScreenOr(async () => {
    await listing.getByRole('button', { name: 'Approve' }).click();
    await listing.getByRole('button', { name: 'Post live' }).click();
    await listing.waitFor({ state: 'detached' });
  }, async () => {
    const id = await listingId();
    await apiAs('admin', 'POST', `/vendors/partner-products/${id}/approve`);
    await apiAs('admin', 'POST', `/vendors/partner-products/${id}/post-live`);
  }, admin.page);
  await part.page.goto('/partner/listings');
  await partShot('Listing live', 'Approved and live: buyers near the pharmacy can now be served from its stock.', { note });
  await admin.ctx.close();
  await part.ctx.close();
}
