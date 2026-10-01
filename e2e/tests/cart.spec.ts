import { expect, test } from '@playwright/test';
import { expectNoBrowserStorage, signIn } from '../support/helpers';

test('the cart is kept by the server: added on the product page, still there in a new browser', async ({ page, browser }) => {
  await signIn(page, 'buyer');
  await page.goto(`/shop/${process.env.E2E_PRODUCT_ID}`);
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await page.goto('/cart');
  await expect(page.getByText('E2E Paracetamol 500').first()).toBeVisible();
  await expectNoBrowserStorage(page);

  // A fresh browser (no shared state) signs in and finds the same cart
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await signIn(page2, 'buyer');
  await page2.goto('/cart');
  await expect(page2.getByText('E2E Paracetamol 500').first()).toBeVisible();
  await other.close();
});
