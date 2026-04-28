'use client';

import { useState, useEffect, useRef } from 'react';

export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;

    const tick = (t: number) => {
      if (!startRef.current) startRef.current = t;
      const progress = Math.min(1, (t - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(fromRef.current + (target - fromRef.current) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}
