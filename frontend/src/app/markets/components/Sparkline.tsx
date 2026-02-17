import React, { useId } from 'react';
import { C } from './constants';

// ---------------------------------------------------------------------------
// Sparkline SVG
// ---------------------------------------------------------------------------

export interface SparklineProps {
  data: number[] | undefined;
  positive: boolean;
  width?: number;
  height?: number;
}

function SparklineInner({
  data,
  positive,
  width = 64,
  height = 24,
}: SparklineProps) {
  const gid = useId();
  const safeData = data && data.length >= 2 ? data : [0, 0];
  const color = positive ? C.green : C.red;
  const min = Math.min(...safeData);
  const max = Math.max(...safeData);
  const range = max - min || 1;
  const pts = safeData.map((v, i) => [
    (i / (safeData.length - 1)) * width,
    height - ((v - min) / range) * height * 0.85 - height * 0.075,
  ]);
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  const areaD = `${pathD} L${width},${height} L0,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gid})`} />
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={pts[pts.length - 1][0]}
        cy={pts[pts.length - 1][1]}
        r="2"
        fill={color}
      />
    </svg>
  );
}

export const Sparkline = React.memo(SparklineInner);
