'use client';
// The pages this tab has shown since the site loaded — in memory only (never stored),
// so Back can tell "there is a page of ours to go back to" from "this is the first page".
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const stack: string[] = [];

/** Mounted once (providers): follows page changes inside the site. */
export function useTrackPages() {
  const pathname = usePathname() ?? '';
  useEffect(() => {
    if (stack[stack.length - 1] === pathname) return;
    if (stack[stack.length - 2] === pathname) stack.pop();      // went back
    else stack.push(pathname);
  }, [pathname]);
}

/** True when Back can return to an earlier page of this site in this tab. */
export const hasEarlierPage = () => stack.length > 1;
