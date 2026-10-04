// Sprint 49 — Admin → Launch readiness: the live launch checklist. The dashboard card shows
// "X of Y ready" and opens the page; computed items show their evidence and a link to the
// screen where the job is done; an admin updates a manual item (status + note, audited by the
// server); pharmacists do not get the page. Nothing is kept in the browser (standing rule).
// The edited item is put back as it was afterwards.
import { expect, test } from '@playwright/test';
import { db } from '../support/data';
import { expectNoBrowserStorage, signIn } from '../support/helpers';

const KEY = '1.3';
let saved: { status: string; note: string | null; updated_by: string | null; updated_at: string | null } | null = null;

test.beforeAll(async () => {
  const c = db();
  await c.connect();
  try { saved = (await c.query('SELECT status, note, updated_by, updated_at FROM launch_checklist_items WHERE item_key = $1', [KEY])).rows[0] ?? null; }
  finally { await c.end(); }
});

test.afterAll(async () => {
  if (!saved) return;
  const c = db();
  await c.connect();
  try {
    await c.query("SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'");
    await c.query('UPDATE launch_checklist_items SET status = $2, note = $3, updated_by = $4, updated_at = $5 WHERE item_key = $1',
      [KEY, saved.status, saved.note, saved.updated_by, saved.updated_at]);
  } finally { await c.end(); }
});

test('the dashboard card opens the live checklist with computed evidence and links', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin');
  const card = page.getByTestId('launch-readiness-card');
  await expect(card).toContainText(/Launch readiness: \d+ of \d+ ready/);
  await card.click();
  await expect(page).toHaveURL(/\/admin\/launch-readiness$/);
  await expect(page.getByRole('heading', { name: 'Launch readiness' })).toBeVisible();
  await expect(page.getByTestId('readiness-summary')).toContainText(/\d+ of \d+ ready/);
  for (const title of ['1. Legal and licences', '4. Server and secrets', '6. Staff set-up', '8. Testing']) {
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  }
  const twoFactor = page.getByTestId('readiness-item-two_factor');
  await expect(twoFactor).toContainText('Checked by the server');
  await expect(twoFactor).toContainText(/Staff and partner logins using it: \d+ of \d+/);
  await expect(twoFactor.getByRole('link', { name: /Two-step sign-in/ })).toHaveAttribute('href', '/admin/two-factor');
  // Secrets only as "set" / "not set"
  await expect(page.getByTestId('readiness-item-encryption_keys')).toContainText(/HEALTH_ENC_KEY (set|not set)/);
  await expect(page.getByTestId('readiness-item-db_login')).toContainText('Connected as');
  // Only what is still to do
  await page.getByLabel('Show only what is still to do').check();
  await expect(page.locator('[data-testid^="readiness-item-"] [data-status="done"]')).toHaveCount(0);
  await expectNoBrowserStorage(page);
});

test('an admin updates a manual item; the note and who changed it show', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/launch-readiness');
  const item = page.getByTestId(`readiness-item-${KEY}`);
  await expect(item).toContainText('Recorded by an admin');
  await item.getByRole('button', { name: `Update ${KEY}` }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Status').selectOption('in_progress');
  await dialog.getByLabel('Note (optional)').fill('E2E: lawyer reviewing the Schedule C / C1 reading (demo note)');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(item.locator('[data-status]')).toHaveText('In progress');
  await expect(item).toContainText('E2E: lawyer reviewing the Schedule C / C1 reading (demo note)');
  await expect(item).toContainText('E2E Admin');
  // From the server after a reload (nothing kept in the browser)
  await page.reload();
  await expect(page.getByTestId(`readiness-item-${KEY}`)).toContainText('E2E: lawyer reviewing');
  await expectNoBrowserStorage(page);
});

test('a pharmacist has no Launch readiness entry', async ({ page }) => {
  await signIn(page, 'pharmacist');
  await page.goto('/admin/kyc');
  await expect(page.getByRole('link', { name: 'Launch readiness' })).toHaveCount(0);
});
