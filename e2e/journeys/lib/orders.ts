// Looks up the orders the journeys placed, by the order number shown on screen
import { Page } from '@playwright/test';
import { db } from '../../support/data';

/** First row of a query against the test database */
export async function dbRow<T = any>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const c = db(); await c.connect();
  try { return (await c.query(sql, params)).rows[0]; } finally { await c.end(); }
}

export async function shipmentsOf(orderNumber: string): Promise<string[]> {
  const c = db(); await c.connect();
  try {
    return (await c.query(`SELECT s.id FROM order_shipments s JOIN orders o ON o.id = s.order_id WHERE o.order_number = $1`, [orderNumber])).rows.map((r) => r.id as string);
  } finally { await c.end(); }
}

export const orderIdOf = async (orderNumber: string) =>
  (await dbRow<{ id: string }>(`SELECT id FROM orders WHERE order_number = $1`, [orderNumber]))!.id;

export const orderNumberOnScreen = async (page: Page) =>
  (await page.locator('body').innerText()).match(/DWB-[A-Z0-9-]+/)?.[0] ?? '';
