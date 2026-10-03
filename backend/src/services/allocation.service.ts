// src/services/allocation.service.ts
// Decides which seller fills each order line and reserves that stock, inside
// the order transaction (docs/DECISIONS.md: allocation rule, partners as
// seller of record). A line is filled by exactly one seller and one batch.
// Sprint 32: only sellers whose drug licence allows a sale to THIS buyer type —
// retail buyers from Form 20/21 holders, trade buyers from Form 20B/21B holders —
// for partners (party_licences, C-33) and for Dawabag's own stock (its licence
// register, C-07). Same SQL as the stock shown to the buyer (stock/sellingRights.ts).
// Sprint 34: and of the form the medicine needs — 21 / 21B for Schedule C / C1, else 20 / 20B.
import { PoolClient } from 'pg';
import { AppError } from '../utils/AppError';
import { distanceKm, LatLng, toLatLng } from '../utils/geo';
import { getSetting } from './settings.service';
import { chooseSeller, ownStockFirst, SellerCandidate } from './sellerSelection';
import { SaleKind, dawabagMaySupplySql, partnerMaySupplySql } from './stock/sellingRights';
import { PARTNER_SELLABLE } from './stock/partnerStock';   // Sprint 37: live-feed staleness

// Batches expiring within this many days are never dispatched (Rulebook C-27)
const MIN_SHELF_DAYS = 30;

export interface AllocationLine {
  product_id: string;
  product_name: string;
  quantity: number;
  cold_chain: boolean;
}

export interface Allocation {
  product_id: string;
  seller_type: 'dawabag' | 'partner';
  partner_id: string | null;
  batch_id: string | null;               // inventory_batches (Dawabag)
  partner_inventory_id: string | null;   // partner_inventory
  partner_product_id: string | null;
  note: string;
}

interface Candidate extends SellerCandidate {
  batchId: string | null;
  partnerInventoryId: string | null;
  partnerProductId: string | null;
  partnerName?: string;
}

export async function allocateAndReserve(
  client: PoolClient,
  params: { lines: AllocationLine[]; orderValuePaise: number; pincode: string; saleKind: SaleKind }
): Promise<Allocation[]> {
  const pin = (await client.query(
    `SELECT latitude, longitude, dawabag_delivery_hours, cold_chain_available
     FROM pincode_serviceability WHERE pincode = $1`, [params.pincode])).rows[0];
  const buyerAt = pin ? toLatLng(pin.latitude, pin.longitude) : null;

  const premises = await getSetting<{ latitude: number; longitude: number }>('dawabag.premises', null as any, client);
  const dawabagAt = premises ? toLatLng(premises.latitude, premises.longitude) : null;


  const ownFirst = ownStockFirst({
    orderValuePaise: params.orderValuePaise,
    minOrderValuePaise: Number(await getSetting('allocation.own_first_min_order_paise', 1000000, client)),
    dawabagDeliveryHours: pin?.dawabag_delivery_hours ?? null,
    maxDeliveryHours: Number(await getSetting('allocation.own_first_max_delivery_hours', 24, client)),
  });

  // Concurrent checkouts of the same medicine wait their turn for its batch row
  // instead of skipping it (SKIP LOCKED made them fail with "Insufficient stock"
  // while stock was plenty). Lines are locked in product order so two orders
  // can never wait on each other; a bounded wait turns congestion into a clear
  // retry message rather than a hung request.
  await client.query("SET LOCAL lock_timeout = '5s'");
  // Sprint 38: plain code-unit order of the lower-case id = PostgreSQL's uuid order, the
  // order a partner's live stock snapshot locks its batches in (liveApply.loadPlanInput),
  // so a checkout and a snapshot can never wait on each other.
  const key = (i: number) => params.lines[i].product_id.toLowerCase();
  const order = params.lines.map((_, i) => i).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const allocations: Allocation[] = new Array(params.lines.length);
  for (const i of order) {
    const line = params.lines[i];
    // Dawabag's own stock only when its register holds an in-date licence for this kind of
    // sale of THIS medicine — Form 21 / 21B for Schedule C / C1, else 20 / 20B (C-07, Sprint 34)
    const ownMaySell = (await client.query(`SELECT ${dawabagMaySupplySql(params.saleKind, '$1::uuid')} AS ok`, [line.product_id]))
      .rows[0]?.ok === true;
    const candidates = [
      ...(ownMaySell ? await ownCandidate(client, line, dawabagAt, buyerAt, !!pin?.cold_chain_available) : []),
      ...(await partnerCandidates(client, line, buyerAt, params.saleKind)),
    ];
    const chosen = chooseSeller(candidates, ownFirst) as Candidate | null;
    if (!chosen) throw new AppError(`Insufficient stock for ${line.product_name}`, 400);

    if (chosen.sellerType === 'dawabag') {
      await client.query(
        'UPDATE inventory_batches SET quantity_reserved = quantity_reserved + $1 WHERE id = $2',
        [line.quantity, chosen.batchId]
      );
    } else {
      await client.query(
        'UPDATE partner_inventory SET qty_reserved = qty_reserved + $1, last_updated_at = NOW() WHERE id = $2',
        [line.quantity, chosen.partnerInventoryId]
      );
    }

    allocations[i] = {
      product_id: line.product_id,
      seller_type: chosen.sellerType,
      partner_id: chosen.partnerId,
      batch_id: chosen.batchId,
      partner_inventory_id: chosen.partnerInventoryId,
      partner_product_id: chosen.partnerProductId,
      note: describe(chosen, ownFirst),
    };
  }
  return allocations;
}

async function ownCandidate(
  client: PoolClient, line: AllocationLine, dawabagAt: LatLng | null, buyerAt: LatLng | null, coldChainOk: boolean
): Promise<Candidate[]> {
  // Cold-chain lines only where Dawabag's delivery to this pincode is cold-chain capable (C-25)
  if (line.cold_chain && !coldChainOk) return [];
  const batch = (await client.query(
    `SELECT id, expiry_date FROM inventory_batches
     WHERE product_id = $1 AND is_recalled = FALSE AND gdp_status = 'ok'   -- Sprint 40: GDP hold (C-25)
       AND quantity_available - quantity_reserved >= $2
       AND expiry_date > CURRENT_DATE + ${MIN_SHELF_DAYS}
     ORDER BY expiry_date ASC LIMIT 1 FOR UPDATE`,
    [line.product_id, line.quantity])).rows[0];
  if (!batch) return [];
  return [{
    sellerType: 'dawabag', partnerId: null, rating: 5,
    distanceKm: distanceKm(dawabagAt, buyerAt),
    expiryDate: isoDate(batch.expiry_date),
    batchId: batch.id, partnerInventoryId: null, partnerProductId: null,
  }];
}

async function partnerCandidates(client: PoolClient, line: AllocationLine, buyerAt: LatLng | null, kind: SaleKind): Promise<Candidate[]> {
  // Earliest-expiring eligible batch per partner (FEFO within a partner)
  const rows = (await client.query(
    `SELECT DISTINCT ON (v.id)
            v.id AS partner_id, v.name AS partner_name, COALESCE(v.vendor_rating, 0) AS rating,
            COALESCE(v.latitude, ps.latitude) AS latitude, COALESCE(v.longitude, ps.longitude) AS longitude,
            pp.id AS partner_product_id, pi.id AS inventory_id, pi.expiry_date
     FROM vendors v
     JOIN partner_products pp ON pp.partner_id = v.id
       AND pp.product_id = $1 AND pp.approval_status = 'approved' AND pp.listing_status = 'live'
     JOIN partner_inventory pi ON pi.partner_product_id = pp.id
       AND ${PARTNER_SELLABLE} >= $2 AND pi.is_recalled = FALSE AND pi.gdp_status = 'ok'
       AND pi.expiry_date > CURRENT_DATE + ${MIN_SHELF_DAYS}
       AND ($3::boolean = FALSE OR pi.cold_chain_confirmed = TRUE)
     LEFT JOIN pincode_serviceability ps ON ps.pincode = v.pincode
     WHERE v.approval_status = 'approved' AND v.is_active = TRUE
       AND v.vendor_type IN ('marketplace_partner', 'both')
       AND (v.drug_license_expiry IS NULL OR v.drug_license_expiry >= CURRENT_DATE)
       AND ${partnerMaySupplySql('v', kind, '$1::uuid')}
     ORDER BY v.id, pi.expiry_date ASC`,
    [line.product_id, line.quantity, line.cold_chain])).rows;

  const candidates: Candidate[] = [];
  for (const r of rows) {
    // Lock the batch row (waiting for any order holding it) and re-check the quantity
    const locked = (await client.query(
      `SELECT id FROM partner_inventory WHERE id = $1 AND gdp_status = 'ok' AND dawabag_partner_sellable(partner_id, qty_available, qty_reserved) >= $2 FOR UPDATE`,
      [r.inventory_id, line.quantity])).rows[0];
    if (!locked) continue;
    candidates.push({
      sellerType: 'partner', partnerId: r.partner_id, partnerName: r.partner_name,
      rating: Number(r.rating), distanceKm: distanceKm(toLatLng(r.latitude, r.longitude), buyerAt),
      expiryDate: isoDate(r.expiry_date),
      batchId: null, partnerInventoryId: r.inventory_id, partnerProductId: r.partner_product_id,
    });
  }
  return candidates;
}

function describe(c: Candidate, ownFirst: boolean): string {
  const who = c.sellerType === 'dawabag' ? 'Dawabag' : `Partner ${c.partnerName}`;
  const why = ownFirst && c.sellerType === 'dawabag' ? 'own stock first (value > threshold, deliverable in time)' : 'nearest in-stock seller';
  const dist = c.distanceKm == null ? 'distance unknown' : `${c.distanceKm.toFixed(1)} km`;
  return `${who}: ${why}; ${dist}; rating ${c.rating}; batch expiry ${c.expiryDate}`;
}

function isoDate(d: Date | string): string {
  return (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
}
