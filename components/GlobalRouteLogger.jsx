'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export default function GlobalRouteLogger() {
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    console.debug(
      '[RouteLogger] route change →',
      pathname + (params?.toString() ? `?${params}` : '')
    );
    const entries = performance.getEntriesByType('navigation');
    const last = entries[entries.length - 1];
    if (last) {
      console.debug('[RouteLogger] nav type:', last.type);
    }
  }, [pathname, params]);

  useEffect(() => {
    const onVis = () =>
      console.debug('[RouteLogger] visibilitychange:', document.visibilityState);
    const onBF = (ev) =>
      console.debug('[RouteLogger] pageshow (persisted):', ev.persisted);
    window.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onBF);
    return () => {
      window.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onBF);
    };
  }, []);

  return null;
}