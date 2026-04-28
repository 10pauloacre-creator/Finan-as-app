'use client';

import { useMemo } from 'react';

interface SparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

export default function Sparkline({ data, color, width = 80, height = 28 }: SparklineProps) {
  const { d, area, last, gradId } = useMemo(() => {
    if (!data || data.length < 2) return { d: '', area: '', last: [0, 0] as [number, number], gradId: '' };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const pts: [number, number][] = data.map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return [x, y];
    });

    const linePath = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
    const areaPath = linePath + ` L${width},${height} L0,${height} Z`;
    const safeId = color.replace(/[^a-z0-9]/gi, '-');
    const gradId = `spark-grad-${safeId}`;

    return { d: linePath, area: areaPath, last: pts[pts.length - 1], gradId };
  }, [data, color, width, height]);

  if (!data || data.length < 2) return null;

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2" fill={color} />
      <circle cx={last[0]} cy={last[1]} r="4" fill={color} fillOpacity="0.25" />
    </svg>
  );
}
