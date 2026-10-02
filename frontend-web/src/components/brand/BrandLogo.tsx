import Image from 'next/image';

/**
 * The DAWA BAG logo (owner decision 2026-10-02) from /public/brand — vector files
 * rendered from the owner's original PDF (public/brand/README.md).
 *  - wordmark: DAWA | BAG without the tagline (headers, portals)
 *  - full: with "Your Life Saving Companion" (home hero, sign-in pages)
 *  - mark: the icon-only bag (small spaces)
 * Sizes are set by height; the width follows the logo's proportions.
 */
const FILES = {
  wordmark: { src: '/brand/dawabag-wordmark.svg', w: 239.344, h: 111, alt: 'DAWA BAG' },
  full: { src: '/brand/dawabag-logo.svg', w: 239.344, h: 137.0391, alt: 'DAWA BAG — Your Life Saving Companion' },
  mark: { src: '/brand/dawabag-mark.svg', w: 112, h: 112, alt: 'DAWA BAG' },
} as const;

interface Props {
  variant?: keyof typeof FILES;
  /** rendered height in px */
  height?: number;
  className?: string;
  /** decorative when the link or heading around it already names DAWA BAG */
  decorative?: boolean;
  priority?: boolean;
}

export default function BrandLogo({ variant = 'wordmark', height = 36, className, decorative, priority }: Props) {
  const f = FILES[variant];
  const width = Math.round((height * f.w) / f.h);
  return (
    <Image
      src={f.src}
      width={width}
      height={height}
      alt={decorative ? '' : f.alt}
      className={className}
      priority={priority}
      unoptimized
    />
  );
}
