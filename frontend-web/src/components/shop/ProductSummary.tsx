'use client';
import { Snowflake } from 'lucide-react';
import type { ProductDetail } from '@/lib/products/api';
import { formatPrice } from '@/lib/utils';
import { scheduleBadge } from '@/lib/drugSchedule';
import { useAuthStore } from '@/store/authStore';
import { hasRole } from '@/lib/admin/roles';
import { STAFF_ROLES } from '@/lib/layout/portalPaths';
import ProductImage from './ProductImage';
import ProductBuyBox from './ProductBuyBox';

/** Name, the buyer's own price and add-to-cart. Copy appears only once a pharmacist approved it (C-19). */
export default function ProductSummary({ p }: { p: ProductDetail }) {
  const badge = scheduleBadge(p.drug_schedule);
  // Unapproved copy is never shown (C-19); only staff see that it is pending review
  const role = useAuthStore((s) => s.user?.role);
  const isStaff = hasRole(role, STAFF_ROLES);
  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row gap-4">
        <ProductImage name={p.name} imageUrl={p.image_url} size="lg" />
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{p.name}</h1>
          {p.generic_name && <p className="text-sm text-gray-500">{p.generic_name}</p>}
          {p.composition && <p className="text-xs text-gray-500 mt-1">Composition: {p.composition}</p>}
          <div className="flex flex-wrap gap-1 mt-2">
            {badge && <span className="badge-schedule-h">{badge}</span>}
            {p.cold_chain && (
              <span className="badge-cold inline-flex items-center gap-1">
                <Snowflake className="w-3 h-3" /> Cold chain
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-2xl font-bold text-brand-700">{formatPrice(p.price_paise)}</span>
            {p.mrp_paise > p.price_paise && (
              <>
                <span className="text-sm text-gray-400 line-through">MRP {formatPrice(p.mrp_paise)}</span>
                <span className="text-sm text-green-700">{p.discount_pct}% off</span>
              </>
            )}
          </div>
          {/* Schedule H / H1 needs a prescription the pharmacist checks before dispatch (C-08) */}
          {p.requires_prescription && <p className="text-xs text-amber-800 mt-1">Needs a doctor’s prescription. Our pharmacist checks it before dispatch.</p>}
          {/* Quantity first, then Add; afterwards − qty + (Sprint 26) */}
          <ProductBuyBox p={p} />
        </div>
      </div>
      {p.description ? (
        <p className="text-sm text-gray-700 mt-4 whitespace-pre-line">{p.description}</p>
      ) : isStaff ? (
        <p className="text-xs text-gray-500 mt-4">Staff note: product information is awaiting pharmacist review.</p>
      ) : null}
    </div>
  );
}
