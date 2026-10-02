'use client';
import { useEffect, useRef, type ReactNode } from 'react';

/** A step's heading; takes focus when the step opens so screen readers announce it. */
export default function StepHeading({ children, focus }: { children: ReactNode; focus: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (focus) ref.current?.focus(); }, [focus]);
  return <h3 ref={ref} tabIndex={-1} className="text-base font-semibold text-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded">{children}</h3>;
}
