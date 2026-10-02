'use client';
import Link from 'next/link';
import { Loader2, Tags } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import type { CheaperOption } from '@/lib/shop/cartSuggestions';

interface Props {
  option: CheaperOption;
  busy: boolean;
  /** the buyer chose to switch (never done automatically) */
  onSwitch: () => void;
}

/**
 * "Same medicine, lower price" under a cart line. The server matches it carefully
 * (same generic name, strength, form and pack); it is only a suggestion, and the
 * pharmacist checks prescription medicines before dispatch (C-08).
 */
export default function CheaperOptionNote({ option, busy, onSwitch }: Props) {
  const p = option.product;
  return (
    <div className="mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900" data-testid="cheaper-option">
      <p className="flex items-center gap-1.5 font-semibold">
        <Tags className="w-3.5 h-3.5" aria-hidden="true" /> Cheaper option: save {formatPrice(option.saving_paise)} each
      </p>
      <p className="mt-0.5">
        <Link href={`/shop/${p.id}`} className="font-medium underline underline-offset-2">{p.name}</Link>
        {' '}— {formatPrice(p.display_price_paise)} each
      </p>
      <p className="mt-0.5 text-green-800">Same medicine (generic name), lower price — ask your pharmacist if unsure.</p>
      <button type="button" onClick={onSwitch} disabled={busy}
        className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-green-700 px-2 py-0.5 font-semibold text-green-800 hover:bg-green-100 disabled:opacity-50">
        {busy && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />} Switch to this
      </button>
    </div>
  );
}
