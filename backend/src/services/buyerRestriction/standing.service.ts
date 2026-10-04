// Where a buyer stands for restricted products (Sprint 47, rules.ts), worked out LIVE from
// the same records the rest of the system already trusts — no second rule:
//   practitioner — a doctor / institution account approved by Dawabag whose medical council
//                  registration is verified, in date and backed by the certificate copy
//                  (Sprint 44 registrationStanding; r.65(9)(b))
//   trade        — a retailer / wholesaler account approved by Dawabag whose checked drug
//                  licences are all in date and include the kind it needs (Sprint 30
//                  eligibility, as order placement; Sprint 32 live; C-14, C-33)
// Consumers and guests cost no query. One answer per request (memoised on the request).
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { partyEligibility } from '../licences/register.service';
import { practitionerState } from '../practitionerSales/registration.service';
import { BuyerKind, BuyerStanding, NO_STANDING, buyerKindOf } from './rules';

type Q = Pick<PoolClient, 'query'>;

export interface StandingUser { id: string; customer_type: string | null; kyc_status: string | null }

export interface Standing extends BuyerStanding { kind: BuyerKind }

/** The buyer's standing now (db: the caller's transaction, or null for the pool). */
export async function buyerStanding(db: Q | null, user: StandingUser | null | undefined): Promise<Standing> {
  const kind = buyerKindOf(user?.customer_type);
  if (!user || (kind !== 'practitioner' && kind !== 'trade') || user.kyc_status !== 'approved') return { ...NO_STANDING, kind };
  if (kind === 'practitioner') {
    const s = await practitionerState(db, user.id);
    return { practitioner: !!(s.applies && s.standing?.ok), trade: false, kind };
  }
  const party = user.customer_type === 'b2b_retailer' ? 'retailer' : 'wholesaler';
  const e = await partyEligibility({ userId: user.id }, party, db ?? undefined);
  return { practitioner: false, trade: e.ok, kind };
}

/** The standing of the request's signed-in buyer (guests: none), worked out once per request. */
const memo = new WeakMap<Request, Promise<Standing>>();
export function requestStanding(req: Request): Promise<Standing> {
  let p = memo.get(req);
  if (!p) {
    p = buyerStanding(null, req.user ? { id: req.user.id, customer_type: req.user.customer_type, kyc_status: req.user.kyc_status } : null);
    memo.set(req, p);
  }
  return p;
}

/** The standing of an account by id (jobs: refills). */
export async function standingOfUser(db: Q, userId: string): Promise<Standing> {
  const u = (await db.query(`SELECT id, customer_type, kyc_status FROM users WHERE id = $1`, [userId])).rows[0];
  return buyerStanding(db, u ?? null);
}
