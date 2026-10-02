// Where the header's Back arrow goes when there is no earlier page in this tab
// (a link opened in a new tab, a page refreshed after sign-in): a sensible parent.
export function parentPath(pathname: string): string {
  if (pathname.startsWith('/checkout')) return '/cart';
  if (pathname.startsWith('/shop/')) return '/search';
  if (pathname.startsWith('/orders/')) return '/orders';
  if (pathname.startsWith('/account/')) {
    const parts = pathname.split('/').filter(Boolean);       // account/returns/<id> → /account/returns
    return parts.length > 2 ? `/${parts.slice(0, 2).join('/')}` : '/account';
  }
  if (pathname.startsWith('/policies/')) return '/policies';
  // Sprint 33: /medicine/<id>/substitutes → that medicine's page
  const sub = pathname.match(/^\/medicine\/([^/]+)\/substitutes/);
  if (sub) return `/shop/${sub[1]}`;
  return '/';
}

/** The header shows Back on every page except home. */
export const showsBack = (pathname: string) => pathname !== '/' && pathname !== '';
