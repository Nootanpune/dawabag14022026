import { formatPrice } from '@/lib/utils';

/** "Pay ₹X" on a method step: moves to the approve screen (no payment yet). */
export default function PayButton({ amountPaise, onClick, disabled }: { amountPaise: number; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="btn-primary w-full py-3 text-base">
      Pay {formatPrice(amountPaise)}
    </button>
  );
}
