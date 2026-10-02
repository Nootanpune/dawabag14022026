'use client';
import { useEffect, useState } from 'react';

/** Whether the element with this id is on screen (true until it is found). */
export function useInView(elementId: string, active = true): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    if (!active) return;
    const el = document.getElementById(elementId);
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // The sticky header covers the top 64px: a box under it counts as off screen
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: '-72px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [elementId, active]);
  return inView;
}
