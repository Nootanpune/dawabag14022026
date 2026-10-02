/** The tagline in the logo's grey (#565655, 7.4:1 on white), for places the logo is shown without it. */
export default function BrandTagline({ className = '' }: { className?: string }) {
  return <p className={`text-ink italic ${className}`}>Your Life Saving Companion</p>;
}
