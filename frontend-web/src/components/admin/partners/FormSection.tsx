import type { ReactNode } from 'react';

/** One titled block of the partner form. */
export default function FormSection({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="card text-sm" aria-label={title}>
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
