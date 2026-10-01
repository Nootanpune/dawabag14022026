import { cn } from '@/lib/utils';
import { inferDosageForm, productInitial } from '@/lib/shop/dosageForm';

interface Props {
  name: string;
  /** a public image URL, when the API exposes one (today it returns only s3_image_key, no URL) */
  imageUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { box: 'w-16 h-16', letter: 'text-2xl', label: 'text-[10px]' },
  md: { box: 'w-full h-28', letter: 'text-4xl', label: 'text-xs' },
  lg: { box: 'w-full sm:w-40 h-40', letter: 'text-5xl', label: 'text-xs' },
};

/** Product photo, or a clean placeholder: the name's initial and the dosage form. */
export default function ProductImage({ name, imageUrl, size = 'md', className }: Props) {
  const s = SIZES[size];
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- object-store URLs, not optimised by next/image
      <img src={imageUrl} alt={name} className={cn(s.box, 'rounded-lg object-contain bg-white shrink-0', className)} />
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
