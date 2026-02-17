import React, { useMemo } from 'react';
import { C } from './constants';
import { CentralHub } from './CentralHub';
import { InstrumentNode } from './InstrumentNode';
import { EdgeTooltip } from './EdgeTooltip';
import {
  CANVAS_W,
  CANVAS_H,
  CX,
  CY,
  toPosMap,
} from '@/lib/market-graph';
import type {
  Instrument,
  EdgeLabel,
  NodePosition,
  PortfolioStats,
} from '@/lib/market-graph';

// ---------------------------------------------------------------------------
// ConstellationCanvas - desktop SVG constellation + nodes + tooltips
// ---------------------------------------------------------------------------

export interface ConstellationCanvasProps {
  instruments: Instrument[];
  labels: EdgeLabel[];
  layout: NodePosition[];
  stats: PortfolioStats;
  hoveredKey: string | null;
  hoveredEdge: EdgeLabel | null;
  flashKeys: Set<string>;
  loaded: boolean;
  isRTL: boolean;
  language: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  onHoverKey: (key: string | null) => void;
  onHoverEdge: (edge: EdgeLabel | null) => void;
}

function ConstellationCanvasInner({
  instruments,
  labels,
  layout,
  stats,
  hoveredKey,
  hoveredEdge,
  flashKeys,
  loaded,
  isRTL,
  language,
  t,
  onHoverKey,
  onHoverEdge,
}: ConstellationCanvasProps) {
  const posMap = useMemo(() => toPosMap(layout), [layout]);

  const isNodeInEdge = (key: string) =>
    hoveredEdge !== null && (hoveredEdge.from === key || hoveredEdge.to === key);

  const dimNode = (key: string) =>
    (hoveredKey !== null && hoveredKey !== key && !isNodeInEdge(key)) ||
    (hoveredEdge !== null && !isNodeInEdge(key));

  return (
    <div className="hidden lg:block mt-2">
      <div
        className="relative mx-auto"
        style={{ width: CANVAS_W, height: CANVAS_H }}
      >
        {/* SVG layer: orbit rings, correlation lines, radial lines */}
        <svg
          width={CANVAS_W}
          height={CANVAS_H}
          className="absolute inset-0 pointer-events-none z-[1]"
          role="img"
          aria-label={t(
            '\u0631\u0633\u0645 \u0628\u064A\u0627\u0646\u064A \u0644\u0627\u0631\u062A\u0628\u0627\u0637\u0627\u062A \u0627\u0644\u0623\u0633\u0648\u0627\u0642 \u0627\u0644\u0639\u0627\u0644\u0645\u064A\u0629',
            'Cross-asset correlation constellation showing global market relationships',
          )}
        >
          {/* Orbit rings */}
          {[0.5, 0.72, 0.92].map((r, i) => (
            <circle
              key={i}
              cx={CX}
              cy={CY}
              r={Math.min(CX, CY) * 0.78 * r}
              fill="none"
              stroke={C.border}
              strokeWidth="0.4"
              strokeDasharray="3 8"
              opacity={0.22}
              style={{ animation: `orbitDash ${22 + i * 6}s linear infinite` }}
            />
          ))}

          {/* Correlation edge lines */}
          {labels.map((edge, i) => {
            const pa = posMap[edge.from];
            const pb = posMap[edge.to];
            if (!pa || !pb) return null;
            const isHL =
              hoveredEdge === edge ||
              hoveredKey === edge.from ||
              hoveredKey === edge.to;
            const isDim = (hoveredKey !== null || hoveredEdge !== null) && !isHL;
            const lc = edge.rho > 0 ? C.gold : C.cyan;
            const thick = 0.5 + Math.abs(edge.rho) * 2.2;
            return (
              <g key={i}>
                {/* Invisible wide hit area */}
                <line
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke="transparent"
                  strokeWidth={16}
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${edge.from} \u2194 ${edge.to}: ${edge.rho > 0 ? '+' : '\u2212'}${edge.pct}% correlation`}
                  onMouseEnter={() => onHoverEdge(edge)}
                  onMouseLeave={() => onHoverEdge(null)}
                  onFocus={() => onHoverEdge(edge)}
                  onBlur={() => onHoverEdge(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onHoverEdge(hoveredEdge === edge ? null : edge);
                    }
                  }}
                />
                {/* Visible line */}
                <line
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke={lc}
                  strokeWidth={isHL ? thick * 1.4 : thick}
                  strokeDasharray={
                    isHL
                      ? 'none'
                      : `${2 + Math.abs(edge.rho) * 5} ${5 + (1 - Math.abs(edge.rho)) * 5}`
                  }
                  opacity={isDim ? 0.04 : isHL ? 0.7 : 0.2}
                  strokeLinecap="round"
                  className="transition-all duration-300 ease-linear pointer-events-none"
                />
              </g>
            );
          })}

          {/* Radial lines from center to each node */}
          {layout.map((p) => {
            const inst = instruments.find((i) => i.key === p.key);
            if (!inst) return null;
            const isConn = hoveredKey === p.key || isNodeInEdge(p.key);
            const color = (inst.change ?? 0) >= 0 ? C.green : C.red;
            return (
              <line
                key={p.key}
                x1={CX}
                y1={CY}
                x2={p.x}
                y2={p.y}
                stroke={isConn ? color : C.textMuted}
                strokeWidth={isConn ? 0.7 : 0.2}
                strokeDasharray="2 7"
                opacity={dimNode(p.key) ? 0.02 : isConn ? 0.25 : 0.05}
                className="transition-all duration-300 ease-linear"
              />
            );
          })}
        </svg>

        {/* Correlation % badges (HTML for crisp rendering) */}
        {labels.map((edge, i) => {
          const lc = edge.rho > 0 ? C.gold : C.cyan;
          const isHL =
            hoveredEdge === edge ||
            hoveredKey === edge.from ||
            hoveredKey === edge.to;
          const isDim = (hoveredKey !== null || hoveredEdge !== null) && !isHL;
          const sign = edge.rho > 0 ? '+' : '\u2212';
          const arrow = edge.rho > 0 ? '\u2197' : '\u2198';
          return (
            <div
              key={`lbl-${i}`}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300 ease-linear"
              style={{
                left: edge.lx,
                top: edge.ly,
                zIndex: isHL ? 25 : 3,
                animation: loaded
                  ? `labelPop 0.4s ease-out ${0.35 + i * 0.04}s both`
                  : 'none',
                opacity: isDim ? 0.1 : isHL ? 1 : 0.88,
              }}
            >
              <div
                className="font-mono font-bold whitespace-nowrap flex items-center gap-1.5 rounded-lg transition-all duration-300 ease-linear"
                style={{
                  fontSize: isHL ? 15 : 13,
                  color: lc,
                  background: isHL ? `${C.surface}F5` : `${C.bg}E8`,
                  border: `1px solid ${isHL ? lc + '66' : lc + '28'}`,
                  padding: isHL ? '5px 12px' : '4px 10px',
                  boxShadow: isHL ? `0 0 14px ${lc}25` : `0 1px 4px rgba(0,0,0,0.4)`,
                }}
              >
                <span style={{ fontSize: isHL ? 13 : 11, opacity: 0.7 }}>{arrow}</span>
                <span>
                  {sign}
                  {edge.pct}%
                </span>
              </div>
            </div>
          );
        })}

        {/* Central hub */}
        <CentralHub stats={stats} count={instruments.length} cx={CX} cy={CY} t={t} />

        {/* Instrument nodes */}
        {instruments.map((inst, idx) => {
          const pos = layout[idx];
          return (
            <InstrumentNode
              key={inst.key}
              inst={inst}
              x={pos.x}
              y={pos.y}
              isHovered={hoveredKey === inst.key || isNodeInEdge(inst.key)}
              isDimmed={dimNode(inst.key)}
              isFlashing={flashKeys.has(inst.key)}
              isRTL={isRTL}
              language={language}
              onHover={() => onHoverKey(inst.key)}
              onLeave={() => onHoverKey(null)}
            />
          );
        })}

        {/* Edge tooltip */}
        {hoveredEdge &&
          posMap[hoveredEdge.from] &&
          posMap[hoveredEdge.to] && (
            <EdgeTooltip
              edge={hoveredEdge}
              x={(posMap[hoveredEdge.from].x + posMap[hoveredEdge.to].x) / 2}
              y={(posMap[hoveredEdge.from].y + posMap[hoveredEdge.to].y) / 2}
              t={t}
              isRTL={isRTL}
            />
          )}
      </div>
    </div>
  );
}

export const ConstellationCanvas = React.memo(ConstellationCanvasInner);
