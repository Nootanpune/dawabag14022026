// src/services/address.service.ts — buyer delivery addresses
// Addresses on past orders are never changed (invoices and the H1 register
// print them), so edits to a used address create a new row and retire the old.
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';

export interface AddressInput {
  label: string; full_name: string; mobile: string; address_line1: string; address_line2?: string | null;
  city: string; state: string; pincode: string; is_default?: boolean;
}

const COLS = ['label', 'full_name', 'mobile', 'address_line1', 'address_line2', 'city', 'state', 'pincode'] as const;

export async function listAddresses(userId: string) {
  return query(
    `SELECT a.*, ps.is_serviceable, ps.estimated_days, ps.dawabag_delivery_hours
     FROM addresses a LEFT JOIN pincode_serviceability ps ON ps.pincode = a.pincode
     WHERE a.user_id = $1 AND a.deleted_at IS NULL ORDER BY a.is_default DESC, a.created_at DESC`, [userId]);
}

export async function createAddress(userId: string, input: AddressInput) {
  return withTransaction(async (client) => {
    const count = Number((await client.query(
      'SELECT COUNT(*) FROM addresses WHERE user_id = $1 AND deleted_at IS NULL', [userId])).rows[0].count);
    if (count >= 20) throw new AppError('You can save up to 20 addresses', 400);
    const makeDefault = input.is_default || count === 0;
    if (makeDefault) await client.query('UPDATE addresses SET is_default = FALSE WHERE user_id = $1', [userId]);
    return (await client.query(
      `INSERT INTO addresses (user_id, ${COLS.join(', ')}, is_default)
       VALUES ($1, ${COLS.map((_, i) => `$${i + 2}`).join(', ')}, $${COLS.length + 2}) RETURNING *`,
      [userId, ...COLS.map((c) => (input as any)[c] ?? null), makeDefault])).rows[0];
  });
}

export async function updateAddress(userId: string, id: string, input: AddressInput) {
  return withTransaction(async (client) => {
    const a = (await client.query(
      'SELECT id, is_default FROM addresses WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE', [id, userId])).rows[0];
    if (!a) throw new AppError('Address not found', 404);
    const used = (await client.query('SELECT 1 FROM orders WHERE address_id = $1 LIMIT 1', [id])).rows[0];
    const makeDefault = input.is_default ?? a.is_default;
    if (makeDefault) await client.query('UPDATE addresses SET is_default = FALSE WHERE user_id = $1', [userId]);
    if (used) {
      await client.query('UPDATE addresses SET deleted_at = NOW(), is_default = FALSE WHERE id = $1', [id]);
      return (await client.query(
        `INSERT INTO addresses (user_id, ${COLS.join(', ')}, is_default)
         VALUES ($1, ${COLS.map((_, i) => `$${i + 2}`).join(', ')}, $${COLS.length + 2}) RETURNING *`,
        [userId, ...COLS.map((c) => (input as any)[c] ?? null), makeDefault])).rows[0];
    }
    return (await client.query(
      `UPDATE addresses SET ${COLS.map((c, i) => `${c} = $${i + 2}`).join(', ')}, is_default = $${COLS.length + 2}
       WHERE id = $1 RETURNING *`, [id, ...COLS.map((c) => (input as any)[c] ?? null), makeDefault])).rows[0];
  });
}

export async function deleteAddress(userId: string, id: string) {
  return withTransaction(async (client) => {
    const a = (await client.query(
      'UPDATE addresses SET deleted_at = NOW(), is_default = FALSE WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING is_default',
      [id, userId])).rows[0];
    if (!a) throw new AppError('Address not found', 404);
    // Keep one default if any address is left
    await client.query(
      `UPDATE addresses SET is_default = TRUE WHERE id = (
         SELECT id FROM addresses WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1)
       AND NOT EXISTS (SELECT 1 FROM addresses WHERE user_id = $1 AND deleted_at IS NULL AND is_default)`, [userId]);
    return { id, deleted: true };
  });
}

export async function setDefaultAddress(userId: string, id: string) {
  const a = await queryOne('SELECT id FROM addresses WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [id, userId]);
  if (!a) throw new AppError('Address not found', 404);
  await query('UPDATE addresses SET is_default = (id = $2) WHERE user_id = $1 AND deleted_at IS NULL', [userId, id]);
  return { id, is_default: true };
}
