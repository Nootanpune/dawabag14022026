'use client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { inferDosageForm, productInitial } from '@/lib/shop/dosageForm';

interface Props {
  name: string;
  /** short-lived signed link to the pack photo from the API (`image_url`); null when there is none */
  imageUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { box: 'w-16 h-16', letter: 'text-2xl', label: 'text-[10px]', px: 64 },
  md: { box: 'w-full h-28', letter: 'text-4xl', label: 'text-xs', px: 224 },
  lg: { box: 'w-full sm:w-40 h-40', letter: 'text-5xl', label: 'text-xs', px: 160 },
};

/**
 * Product pack photo, or a clean placeholder (the name's initial and the dosage
 * form) when there is none or it fails to load. The photo comes straight from the
 * server object store through the API's signed link — nothing is kept in the browser.
 */
export default function ProductImage({ name, imageUrl, size = 'md', className }: Props) {
  const s = SIZES[size];
  // Remembers which link failed, so a new link (replaced photo, refreshed signature) is tried again
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (imageUrl && imageUrl !== failedUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed object-store links expire; next/image would re-host them
      <img
        src={imageUrl}
        alt={name}
        width={s.px}
        height={s.px}
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(imageUrl)}
        className={cn(s.box, 'rounded-lg object-contain bg-white border border-gray-100 shrink-0', className)}
      />
    );
  }
  const form = inferDosageForm(name);
  return (
    <div
      className={cn(
        s.box,
        'rounded-lg bg-brand-50 border border-brand-100 flex flex-col items-center justify-center gap-1 shrink-0',
        className
      )}
      aria-hidden="true"
    >
      <span className={cn(s.letter, 'font-semibold text-brand-700 leading-none')}>{productInitial(name)}</span>
      {form !== 'Other' && (
        <span className={cn(s.label, 'uppercase tracking-wide font-medium text-brand-800')}>{form}</span>
      )}
    </div>
  );
}
