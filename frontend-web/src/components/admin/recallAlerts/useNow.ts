'use client';
import { useEffect, useState } from 'react';

/** The clock, re-read every `everyMs` so countdowns stay live (held only in memory). */
export function useNow(everyMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
