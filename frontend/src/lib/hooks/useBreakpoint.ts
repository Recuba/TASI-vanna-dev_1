'use client';

import { useEffect, useState } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

const MOBILE_MAX = 640;
const TABLET_MAX = 1024;

function getBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w < MOBILE_MAX) return 'mobile';
  if (w < TABLET_MAX) return 'tablet';
  return 'desktop';
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>('desktop');

  useEffect(() => {
    setBp(getBreakpoint());

    const mobileQuery = window.matchMedia(`(max-width: ${MOBILE_MAX - 1}px)`);
    const tabletQuery = window.matchMedia(
      `(min-width: ${MOBILE_MAX}px) and (max-width: ${TABLET_MAX - 1}px)`,
    );

    const handler = () => setBp(getBreakpoint());

    mobileQuery.addEventListener('change', handler);
    tabletQuery.addEventListener('change', handler);

    return () => {
      mobileQuery.removeEventListener('change', handler);
      tabletQuery.removeEventListener('change', handler);
    };
  }, []);

  return bp;
}
