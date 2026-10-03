// Sprint 37 — what one live snapshot does to the partner's own stock ledger
// (partner_inventory), and what waits for a person. Pure: unit-tested in plan.test.ts.
//
// Owner decisions 2026-10-03 (docs/DECISIONS.md):
//   • Quantities of products already linked AND listed by the partner apply
//     automatically — the snapshot is MediVision's shelf count (the master).
//   • Waits for a person (partner_feed_checks): a new product (not linked), a linked
//     product the partner does not list yet (listing declarations), a NEW batch of a
//     refrigerated product (cold storage, C-25), an MRP / rate different from the
//     batch's accepted one (C-16), a later expiry than recorded (C-27).
//   • A new batch with a valid expiry of a listed, non-refrigerated product applies
//     automatically; an earlier expiry is adopted automatically (the safer direction).
//   • Expired / short-dated / recalled / MRP-below-price lines are problems
//     (evaluateImport): that batch sells nothing.
//   • Full snapshot: every ledger batch the snapshot does not set — absent, or on a
//     line with a problem — goes to 0 sellable (qty_available = qty_reserved).
//
// No drift with open orders (developer's proposal, DECISIONS.md): a partner bills a
// shipment in its software no later than when it presses Dispatch on Dawabag
// (+ billing_grace_minutes). So at the snapshot time T the software still counts
//   • units reserved for Dawabag shipments not yet dispatched (qty_reserved), and
//   • units dispatched after T − grace.
// Shelf on Dawabag = snapshot − dispatched after (T − grace); qty_available = shelf,
// never below qty_reserved; sellable = qty_available − qty_reserved. When the shelf is
// below what orders hold, the shortfall is raised for a person (short_for_orders).
import { batchKey } from '../recallAlerts/batchKey';
import type { ParsedRow } from '../partnerStockImport/rows';
import type { RowStatus } from '../partnerStockImport/evaluate';

export interface PlanRow {
  status: RowStatus;
  product_id: string | null;
  item_key: string | null;
  match_method: string | null;
  parsed: ParsedRow;
  problems: string[];
  warnings: string[];
}

export interface Listing { ppId: string; productId: string; name: string; coldChain: boolean }

export interface LedgerBatch {
  id: string;
  ppId: string;
  productId: string;
  batch_number: string;
  qty_available: number;
  qty_reserved: number;
  expiry_date: string;          // YYYY-MM-DD
  mrp_paise: number | null;
  sale_rate_paise: number | null;
}

export interface BatchWrite {
  inventoryId: string | null;   // null = new batch
  ppId: string;
  productId: string;
  batch_number: string;
  qty_available: number;
  feed_quantity: number;
  expiry_date: string;
  mrp_paise: number | null;
  sale_rate_paise: number | null;
  purchase_price_paise: number | null;
}

export type CheckKind = 'new_product' | 'new_listing' | 'cold_chain_batch' | 'price_change' | 'expiry_change' | 'short_for_orders';

export interface PlannedCheck {
  kind: CheckKind;
  item_key: string;
  batch_key: string;
  product_id: string | null;
  inventory_id: string | null;
  item_name: string | null;
  batch_number: string | null;
  details: Record<string, unknown>;
}

export interface SnapshotPlan {
  writes: BatchWrite[];
  /** Ledger batches the snapshot does not set: 0 sellable (qty_available = qty_reserved) */
  zero: string[];
  checks: PlannedCheck[];
  /** Matched lines of listed products used for the quantities */
  lines_applied: number;
  /** Item keys matched by name / listing that become remembered links */
  learnt_links: { item_key: string; product_id: string; label: string | null }[];
  held_for_orders: number;
  dispatched_after_snapshot: number;
}

export interface PlanInput {
  rows: PlanRow[];
  listings: Map<string, Listing>;               // by product id
  ledger: LedgerBatch[];
  dispatchedSince: Map<string, number>;         // by partner_inventory id
  dismissed: Set<string>;                       // new items the partner set aside ("not sold on Dawabag")
}

const month = (iso: string) => iso.slice(0, 7);

interface Group { listing: Listing; batch_number: string; key: string; rows: PlanRow[] }

export function planSnapshot(input: PlanInput): SnapshotPlan {
  const plan: SnapshotPlan = { writes: [], zero: [], checks: [], lines_applied: 0, learnt_links: [], held_for_orders: 0, dispatched_after_snapshot: 0 };
  const groups = new Map<string, Group>();
  const newListing = new Map<string, PlanRow[]>();
  const newProduct = new Map<string, PlanRow[]>();

  for (const r of input.rows) {
    if (r.status === 'skipped' || !r.parsed) continue;
    if (r.product_id) {
      const listing = input.listings.get(r.product_id);
      if (!listing) {
        // Linked but not listed: the partner makes the listing declarations (C-16, C-19, C-25)
        if (r.status === 'matched' && r.item_key) newListing.set(r.item_key, [...(newListing.get(r.item_key) ?? []), r]);
        continue;
      }
      if (!r.parsed.batch_number) continue;
      const key = `${listing.ppId}|${batchKey(r.parsed.batch_number)}`;
      const g = groups.get(key) ?? { listing, batch_number: r.parsed.batch_number, key: batchKey(r.parsed.batch_number), rows: [] };
      g.rows.push(r);
      groups.set(key, g);
    } else if (r.status === 'needs_review' && r.item_key && !input.dismissed.has(r.item_key)) {
      newProduct.set(r.item_key, [...(newProduct.get(r.item_key) ?? []), r]);
    }
  }

  const ledgerBy = new Map(input.ledger.map((b) => [`${b.ppId}|${batchKey(b.batch_number)}`, b]));
  const written = new Set<string>();

  for (const [k, g] of groups) {
    // A problem on any line of the batch (expired, short-dated, recalled, MRP below price,
    // unreadable values, two expiries): the batch sells nothing
    if (g.rows.some((r) => r.status !== 'matched')) continue;
    const first = g.rows[0];
    const feedQty = g.rows.reduce((a, r) => a + Math.max(0, r.parsed.total_quantity ?? 0), 0);
    const expiry = g.rows.map((r) => r.parsed.expiry_date!).sort()[0];
    const mrp = first.parsed.mrp_paise;
    const rate = first.parsed.sale_rate_paise ?? null;
    const purchase = first.parsed.purchase_rate_paise ?? null;
    const itemKey = first.item_key ?? `product:${g.listing.productId}`;
    const existing = ledgerBy.get(k);
    const base = { item_key: itemKey, batch_key: g.key, product_id: g.listing.productId, item_name: first.parsed.item_name, batch_number: g.batch_number };

    if (!existing) {
      if (g.listing.coldChain) {
        plan.checks.push({ ...base, kind: 'cold_chain_batch', inventory_id: null,
          details: { product_name: g.listing.name, quantity: feedQty, expiry_date: expiry, mrp_paise: mrp, sale_rate_paise: rate, purchase_price_paise: purchase } });
        continue;
      }
      plan.writes.push({ inventoryId: null, ppId: g.listing.ppId, productId: g.listing.productId, batch_number: g.batch_number,
        qty_available: feedQty, feed_quantity: feedQty, expiry_date: expiry, mrp_paise: mrp, sale_rate_paise: rate, purchase_price_paise: purchase });
    } else {
      const dispatched = input.dispatchedSince.get(existing.id) ?? 0;
      const shelf = Math.max(0, feedQty - dispatched);
      const reserved = Number(existing.qty_reserved);
      plan.held_for_orders += Math.min(reserved, shelf);
      plan.dispatched_after_snapshot += Math.min(dispatched, feedQty);
      if (shelf < reserved) {
        plan.checks.push({ ...base, kind: 'short_for_orders', inventory_id: existing.id,
          details: { product_name: g.listing.name, reserved, in_software: feedQty, dispatched_since: dispatched, shelf } });
      }
      // Expiry: an earlier month is adopted (safer); a later month waits for a person
      let keepExpiry = existing.expiry_date;
      if (month(expiry) < month(existing.expiry_date)) keepExpiry = expiry;
      else if (month(expiry) > month(existing.expiry_date)) {
        plan.checks.push({ ...base, kind: 'expiry_change', inventory_id: existing.id,
          details: { product_name: g.listing.name, from: existing.expiry_date, to: expiry } });
      }
      // Price: the first value seen is adopted; a different one waits for a person
      const mrpChanged = existing.mrp_paise !== null && mrp !== null && mrp !== existing.mrp_paise;
      const rateChanged = existing.sale_rate_paise !== null && rate !== null && rate !== existing.sale_rate_paise;
      if (mrpChanged || rateChanged) {
        plan.checks.push({ ...base, kind: 'price_change', inventory_id: existing.id,
          details: { product_name: g.listing.name,
            mrp: mrpChanged ? { from: existing.mrp_paise, to: mrp } : null,
            rate: rateChanged ? { from: existing.sale_rate_paise, to: rate } : null } });
      }
      plan.writes.push({ inventoryId: existing.id, ppId: g.listing.ppId, productId: g.listing.productId, batch_number: existing.batch_number,
        qty_available: Math.max(shelf, reserved), feed_quantity: feedQty, expiry_date: keepExpiry,
        mrp_paise: existing.mrp_paise ?? mrp, sale_rate_paise: existing.sale_rate_paise ?? rate, purchase_price_paise: purchase });
      written.add(existing.id);
    }
    plan.lines_applied += g.rows.length;
    for (const r of g.rows) {
      if (r.item_key && r.match_method && r.match_method !== 'item_link' && !plan.learnt_links.some((l) => l.item_key === r.item_key)) {
        plan.learnt_links.push({ item_key: r.item_key, product_id: g.listing.productId, label: r.parsed.item_name });
      }
    }
  }

  // Full snapshot: everything else in the ledger goes to 0 sellable
  for (const b of input.ledger) {
    if (written.has(b.id)) continue;
    plan.zero.push(b.id);
    if (Number(b.qty_reserved) > 0) {
      plan.checks.push({ kind: 'short_for_orders', item_key: `product:${b.productId}`, batch_key: batchKey(b.batch_number), product_id: b.productId,
        inventory_id: b.id, item_name: input.listings.get(b.productId)?.name ?? null, batch_number: b.batch_number,
        details: { product_name: input.listings.get(b.productId)?.name ?? null, reserved: Number(b.qty_reserved), in_software: 0, shelf: 0,
          reason: 'Not in the latest snapshot, or the line has a problem' } });
    }
  }

  for (const [itemKey, rows] of newListing) {
    const r0 = rows[0];
    plan.checks.push({ kind: 'new_listing', item_key: itemKey, batch_key: '', product_id: r0.product_id, inventory_id: null,
      item_name: r0.parsed.item_name, batch_number: null,
      details: { item_code: r0.parsed.item_code, quantity: rows.reduce((a, r) => a + Math.max(0, r.parsed.total_quantity ?? 0), 0),
        batches: rows.map((r) => ({ batch_number: r.parsed.batch_number, expiry_date: r.parsed.expiry_date, quantity: r.parsed.total_quantity,
          mrp_paise: r.parsed.mrp_paise, sale_rate_paise: r.parsed.sale_rate_paise, purchase_price_paise: r.parsed.purchase_rate_paise })) } });
  }
  for (const [itemKey, rows] of newProduct) {
    const p = rows[0].parsed;
    plan.checks.push({ kind: 'new_product', item_key: itemKey, batch_key: '', product_id: null, inventory_id: null,
      item_name: p.item_name, batch_number: null,
      details: { item_code: p.item_code, pack: p.pack, manufacturer: p.manufacturer, hsn: p.hsn, gst_rate: p.gst_rate,
        mrp_paise: p.mrp_paise, ptr_paise: p.ptr_paise, quantity: rows.reduce((a, r) => a + Math.max(0, r.parsed.total_quantity ?? 0), 0),
        batches: rows.length, note: rows[0].warnings[0] ?? null } });
  }
  return plan;
}

/** The identity of a check across snapshots (one open item per thing). */
export const checkIdentity = (c: { kind: string; item_key: string; batch_key: string }) => `${c.kind}|${c.item_key}|${c.batch_key}`;
