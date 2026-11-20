import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { documentTitleFor, pageTitleFor } from '../config/pageTitles';

/**
 * The current page's name (central map, config/pageTitles.ts) — and the
 * browser tab title kept in sync with it ("إنشاء شحنة | SHIPPEC").
 */
export function usePageTitle(): string {
  const { pathname } = useLocation();
  const title = pageTitleFor(pathname);
  useEffect(() => {
    document.title = documentTitleFor(pathname);
  }, [pathname]);
  return title;
}
