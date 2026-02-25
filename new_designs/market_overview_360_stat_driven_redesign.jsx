import { useState, useEffect, useMemo, useCallback, useId } from "react";

/* ─────────────────────────── Design Tokens ─────────────────────────── */
const T = {
  bg: "#0A0A0C",
  surface: "#111114",
  surfaceHover: "#18181C",
  border: "#1E1E24",
  gold: "#D4A84B",
  goldDim: "rgba(212,168,75,0.15)",
  green: "#2ECC71",
  greenDim: "rgba(46,204,113,0.12)",
  red: "#E74C3C",
  redDim: "rgba(231,76,60,0.12)",
  textPrimary: "#F0EDE6",
  textSecondary: "#8A8A94",
  textTertiary: "#55555F",
  fontAr: "'Tajawal', sans-serif",
  fontMono: "'IBM Plex Mono', monospace",
  radius: 12,
};

/* ─────────────────────────── Instruments (8 only) ─────────────────────────── */
const INSTRUMENTS = [
  { key: "BTC", nameAr: "بيتكوين", nameEn: "Bitcoin", value: 97245.3, change: 2.34, category: "Crypto", sparkline: [91200, 93400, 94100, 92800, 95600, 96800, 97245], angle: -90, radius: 0.82 },
  { key: "GOLD", nameAr: "الذهب", nameEn: "Gold", value: 2935.4, change: 0.68, category: "Commodity", sparkline: [2890, 2905, 2898, 2920, 2915, 2928, 2935], angle: -45, radius: 0.78 },
  { key: "WTI", nameAr: "نفط خام (WTI)", nameEn: "WTI Oil", value: 71.23, change: -1.34, category: "Energy", sparkline: [73.5, 74.1, 73.2, 72.8, 72.1, 71.8, 71.23], angle: 0, radius: 0.85 },
  { key: "BRENT", nameAr: "نفط برنت", nameEn: "Brent Crude", value: 75.67, change: -1.18, category: "Energy", sparkline: [78.2, 77.8, 77.1, 76.5, 76.2, 75.9, 75.67], angle: 45, radius: 0.8 },
  { key: "SPX", nameAr: "إس آند بي 500", nameEn: "S&P 500", value: 6120.35, change: 1.12, category: "US Index", sparkline: [5980, 6010, 6045, 6030, 6075, 6098, 6120], angle: 90, radius: 0.83 },
  { key: "NASDAQ", nameAr: "ناسداك", nameEn: "NASDAQ", value: 19845.2, change: 1.45, category: "US Index", sparkline: [19200, 19380, 19500, 19420, 19650, 19780, 19845], angle: 135, radius: 0.78 },
  { key: "DJI", nameAr: "داو جونز", nameEn: "Dow Jones", value: 44521.67, change: 0.82, category: "US Index", sparkline: [43800, 43950, 44100, 44050, 44280, 44400, 44522], angle: 180, radius: 0.85 },
  { key: "RUT", nameAr: "راسل 2000", nameEn: "Russell 2000", value: 2287.45, change: -0.38, category: "US Index", sparkline: [2310, 2305, 2298, 2295, 2290, 2288, 2287], angle: -135, radius: 0.8 },
];

/* ─────────────────────────── Helpers ─────────────────────────── */
const fmt = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);

const std = (arr) => {
  const m = mean(arr);
  const variance = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(variance);
};

const returnsFromSeries = (series) => {
  const out = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1] || 1;
    out.push((series[i] - prev) / prev);
  }
  return out;
};

const correlation = (a, b) => {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ax = a.slice(a.length - n);
  const bx = b.slice(b.length - n);
  const ma = mean(ax);
  const mb = mean(bx);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = ax[i] - ma;
    const db = bx[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  const denom = Math.sqrt(va * vb);
  return denom === 0 ? 0 : cov / denom;
};

const slope = (arr) => {
  const n = arr.length;
  if (n < 2) return 0;
  const xs = Array.from({ length: n }, (_, i) => i);
  const mx = mean(xs);
  const my = mean(arr);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (arr[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
};

function polarToCartesian(angleDeg, radiusFraction, cx, cy, maxR) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + Math.cos(rad) * maxR * radiusFraction, y: cy + Math.sin(rad) * maxR * radiusFraction };
}

function lineColorFromScore(score) {
  return score >= 0 ? T.green : T.red;
}

function corrToPercent(corr) {
  return `${corr >= 0 ? "+" : ""}${(corr * 100).toFixed(0)}%`;
}

function corrLabel(corr) {
  const a = Math.abs(corr);
  if (a >= 0.8) return "Very Strong";
  if (a >= 0.6) return "Strong";
  if (a >= 0.4) return "Moderate";
  if (a >= 0.2) return "Weak";
  return "Very Weak";
}

/* ─────────────────────────── Sparkline ─────────────────────────── */
function Sparkline({ data, positive, width = 64, height = 24, idPrefix }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height * 0.85) - height * 0.075;
    return `${x},${y}`;
  });
  const color = positive ? T.green : T.red;
  const gradId = `${idPrefix}-${positive ? "g" : "r"}`;
  const [lx, ly] = pts[pts.length - 1].split(",");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts.join(" ")} ${width},${height}`} fill={`url(#${gradId})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2" fill={color} />
    </svg>
  );
}

/* ─────────────────────────── Node ─────────────────────────── */
function InstrumentNode({ inst, metrics, x, y, isHovered, onHover, onLeave }) {
  const positive = inst.change >= 0;
  const accent = positive ? T.green : T.red;
  const bgTint = positive ? T.greenDim : T.redDim;
  const uid = useId();

  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        width: isHovered ? 208 : 188,
        padding: "12px 14px",
        borderRadius: T.radius,
        background: isHovered ? `linear-gradient(135deg, ${T.surfaceHover} 0%, ${T.surface} 100%)` : T.surface,
        border: `1px solid ${isHovered ? accent + "55" : T.border}`,
        boxShadow: isHovered ? `0 0 30px ${accent}18, 0 8px 32px rgba(0,0,0,0.4)` : `0 2px 12px rgba(0,0,0,0.3)`,
        transition: "all .25s ease",
        zIndex: isHovered ? 20 : 5,
        direction: "rtl",
        textAlign: "right",
        cursor: "default",
      }}
      aria-label={`${inst.nameEn} ${pct(inst.change)} trend ${metrics.trendScore.toFixed(2)}`}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: accent, boxShadow: `0 0 8px ${accent}66` }} />
          <span style={{ fontFamily: T.fontAr, fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{inst.nameAr}</span>
        </div>
        <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.textSecondary, background: bgTint, padding: "2px 6px", borderRadius: 4 }}>
          {inst.key}
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontFamily: T.fontMono, fontSize: 16, fontWeight: 600, color: T.textPrimary }}>{fmt(inst.value)}</span>
        <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 600, color: accent }}>{positive ? "▲" : "▼"} {pct(inst.change)}</span>
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 2 }}>
        <Sparkline data={inst.sparkline} positive={positive} width={isHovered ? 160 : 145} height={26} idPrefix={`${uid}-${inst.key}`} />
      </div>

      <div
        style={{
          marginTop: 7,
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0,1fr))",
          gap: 4,
          fontFamily: T.fontMono,
          fontSize: 9,
          color: T.textTertiary,
          direction: "ltr",
        }}
      >
        <span>β(SPX): {metrics.betaToSPX.toFixed(2)}</span>
        <span>σ: {(metrics.volatility * 100).toFixed(2)}%</span>
        <span>Slope: {metrics.trendScore.toFixed(2)}</span>
        <span>Corr BTC: {metrics.corrToBTC.toFixed(2)}</span>
      </div>

      <div style={{ fontFamily: T.fontMono, fontSize: 9, color: T.textTertiary, textAlign: "center", marginTop: 6, direction: "ltr" }}>
        {inst.nameEn}
      </div>
    </button>
  );
}

export default function MarketOverview360() {
  const [hoveredKey, setHoveredKey] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [time, setTime] = useState(new Date());

  useEffect(() => setLoaded(true), []);
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const containerSize = useMemo(() => ({ w: 1100, h: 760 }), []);
  const cx = containerSize.w / 2;
  const cy = containerSize.h / 2 + 20;
  const maxR = Math.min(cx, cy) * 0.72;

  const positions = useMemo(
    () => INSTRUMENTS.map((inst) => ({ key: inst.key, ...polarToCartesian(inst.angle, inst.radius, cx, cy, maxR) })),
    [cx, cy, maxR]
  );

  const posMap = useMemo(() => Object.fromEntries(positions.map((p) => [p.key, p])), [positions]);
  const returnsMap = useMemo(() => Object.fromEntries(INSTRUMENTS.map((i) => [i.key, returnsFromSeries(i.sparkline)])), []);

  const spxReturns = returnsMap.SPX || [];
  const btcReturns = returnsMap.BTC || [];

  const metricsMap = useMemo(() => {
    const m = {};
    for (const i of INSTRUMENTS) {
      const r = returnsMap[i.key] || [];
      const vol = std(r);
      const corrSPX = correlation(r, spxReturns);
      const corrBTC = correlation(r, btcReturns);
      const beta = std(spxReturns) === 0 ? 0 : corrSPX * (std(r) / std(spxReturns));
      const tr = slope(i.sparkline);
      m[i.key] = { volatility: vol, corrToSPX: corrSPX, corrToBTC: corrBTC, betaToSPX: beta, trendScore: tr };
    }
    return m;
  }, [returnsMap, spxReturns, btcReturns]);

  const links = useMemo(() => {
    const out = [];
    for (let a = 0; a < INSTRUMENTS.length; a++) {
      for (let b = a + 1; b < INSTRUMENTS.length; b++) {
        const A = INSTRUMENTS[a];
        const B = INSTRUMENTS[b];
        const ra = returnsMap[A.key] || [];
        const rb = returnsMap[B.key] || [];
        const corr = correlation(ra, rb);
        const signAgreement = Math.sign(A.change) === Math.sign(B.change) ? 1 : -1;
        const va = metricsMap[A.key]?.volatility ?? 0;
        const vb = metricsMap[B.key]?.volatility ?? 0;
        const volSimilarity = 1 - Math.min(1, Math.abs(va - vb) / (((va + vb) / 2) || 1));
        const score = 0.45 * corr + 0.3 * signAgreement + 0.25 * volSimilarity;

        if (Math.abs(score) >= 0.35 || Math.abs(corr) >= 0.55) {
          out.push({ a: A.key, b: B.key, corr, signAgreement, volSimilarity, score, strength: Math.min(1, Math.abs(score)) });
        }
      }
    }
    return out.sort((x, y) => Math.abs(y.score) - Math.abs(x.score)).slice(0, 12);
  }, [metricsMap, returnsMap]);

  const hoveredLinksInfo = useMemo(() => {
    if (!hoveredKey) return [];
    return links
      .filter((l) => l.a === hoveredKey || l.b === hoveredKey)
      .sort((x, y) => Math.abs(y.score) - Math.abs(x.score))
      .slice(0, 3)
      .map((l) => {
        const other = l.a === hoveredKey ? l.b : l.a;
        return {
          other,
          corr: l.corr,
          corrPct: corrToPercent(l.corr),
          corrStrength: corrLabel(l.corr),
          rationale: `Score=${l.score.toFixed(2)} = 0.45*Corr(${l.corr.toFixed(2)}) + 0.30*Sign(${l.signAgreement}) + 0.25*VolSim(${l.volSimilarity.toFixed(2)})`,
        };
      });
  }, [hoveredKey, links]);

  const setHover = useCallback((k) => setHoveredKey(k), []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        fontFamily: T.fontAr,
        direction: "rtl",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

      <style>{`
        @keyframes pulseRing { 0%,100% { transform: scale(1); opacity: .6;} 50% {transform: scale(1.08); opacity:.2;} }
        @keyframes fadeSlideIn { from {opacity:0; transform: translate(-50%,-50%) scale(.85);} to {opacity:1; transform: translate(-50%,-50%) scale(1);} }
        @keyframes orbitDash { to { stroke-dashoffset: -20; } }
        @keyframes headerIn { from {opacity:0; transform: translateY(-18px);} to {opacity:1; transform: translateY(0);} }
      `}</style>

      <div style={{ width: "100%", maxWidth: 1100, padding: "30px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", animation: loaded ? "headerIn .6s ease-out" : "none", opacity: loaded ? 1 : 0 }}>
        <div>
          <h1 style={{ fontFamily: T.fontAr, fontSize: 32, fontWeight: 800, color: T.textPrimary, margin: 0, lineHeight: 1.2 }}>
            نظرة 360° — مدفوعة بالإحصاء
          </h1>
          <p style={{ fontFamily: T.fontMono, fontSize: 12, color: T.textSecondary, margin: "6px 0 0", direction: "ltr", textAlign: "right" }}>
            <span style={{ color: T.gold }}>Statistical Link Engine</span>
            <span style={{ margin: "0 8px", color: T.textTertiary }}>·</span>
            Corr / Beta / Volatility / Trend
          </p>
        </div>
        <div style={{ textAlign: "left", direction: "ltr" }}>
          <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textTertiary, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, boxShadow: `0 0 6px ${T.green}88`, animation: "pulseRing 2s ease-in-out infinite" }} />
            {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            <span style={{ color: T.textTertiary }}>·</span>
            {time.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        </div>
      </div>

      <div style={{ position: "relative", width: containerSize.w, height: containerSize.h, margin: "6px auto 6px" }}>
        <svg width={containerSize.w} height={containerSize.h} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 1 }}>
          {[0.5, 0.7, 0.9].map((r, i) => (
            <circle key={i} cx={cx} cy={cy} r={maxR * r} fill="none" stroke={T.border} strokeWidth="0.5" strokeDasharray="4 8" opacity={0.35} style={{ animation: `orbitDash ${20 + i * 5}s linear infinite` }} />
          ))}

          {links.map((l, i) => {
            const pa = posMap[l.a];
            const pb = posMap[l.b];
            if (!pa || !pb) return null;
            const highlight = hoveredKey && (l.a === hoveredKey || l.b === hoveredKey);
            const fade = hoveredKey && !highlight;
            const color = lineColorFromScore(l.score);
            const mx = (pa.x + pb.x) / 2;
            const my = (pa.y + pb.y) / 2;
            const corrPctText = corrToPercent(l.corr);

            return (
              <g key={`${l.a}-${l.b}-${i}`}>
                <line
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke={color}
                  strokeWidth={0.5 + l.strength * 2.4}
                  strokeDasharray={Math.abs(l.corr) > 0.7 ? "none" : "4 6"}
                  opacity={fade ? 0.05 : highlight ? 0.85 : 0.28}
                />

                {(highlight || l.strength >= 0.75) && (
                  <g>
                    <rect x={mx - 18} y={my - 9} width={36} height={14} rx={4} fill="#0D0D10" opacity={0.9} />
                    <text x={mx} y={my + 1.5} textAnchor="middle" fontSize="9" fontFamily={T.fontMono} fill={Math.abs(l.corr) >= 0.6 ? T.textPrimary : T.textSecondary}>
                      {corrPctText}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {positions.map((p) => {
            const isConn = hoveredKey === p.key;
            return (
              <line
                key={p.key}
                x1={cx}
                y1={cy}
                x2={p.x}
                y2={p.y}
                stroke={isConn ? T.gold : T.textTertiary}
                strokeWidth={isConn ? 1.1 : 0.35}
                strokeDasharray="2 6"
                opacity={hoveredKey && !isConn ? 0.06 : isConn ? 0.35 : 0.12}
              />
            );
          })}
        </svg>

        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 170, height: 170, borderRadius: "50%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10, background: `radial-gradient(circle, ${T.surface} 0%, ${T.bg} 100%)`, border: `1px solid ${T.border}`, boxShadow: `0 0 60px ${T.gold}22, 0 0 120px ${T.gold}08` }}>
          <div style={{ position: "absolute", inset: -2, borderRadius: "50%", border: `2px solid ${T.gold}33`, animation: "pulseRing 3s ease-in-out infinite" }} />
          <span style={{ fontFamily: T.fontAr, fontSize: 20, fontWeight: 700, color: T.textPrimary }}>محرك الروابط</span>
          <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textSecondary, marginTop: 1 }}>Link Engine</span>
          <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.gold, marginTop: 8, direction: "ltr" }}>Active links: {links.length}</span>
          <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.textTertiary, marginTop: 4, direction: "ltr", textAlign: "center", padding: "0 12px" }}>
            Line labels show correlation coefficient (%) between linked assets
          </span>
        </div>

        {INSTRUMENTS.map((inst, idx) => {
          const pos = positions[idx];
          return (
            <div key={inst.key} style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, animation: loaded ? `fadeSlideIn .5s ease-out ${0.1 + idx * 0.06}s both` : "none" }}>
              <InstrumentNode
                inst={inst}
                metrics={metricsMap[inst.key]}
                x={pos.x}
                y={pos.y}
                isHovered={hoveredKey === inst.key}
                onHover={() => setHover(inst.key)}
                onLeave={() => setHover(null)}
              />
            </div>
          );
        })}
      </div>

      <div style={{ width: "100%", maxWidth: 1100, padding: "2px 24px 24px" }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontFamily: T.fontAr, color: T.textPrimary, fontWeight: 700 }}>تفسير الروابط</span>
            <span style={{ fontFamily: T.fontMono, color: T.textTertiary, fontSize: 11 }}>
              {hoveredKey ? `Focused: ${hoveredKey}` : "Hover any node to show statistical rationale"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10, direction: "ltr" }}>
            {[
              { c: ">= ±80%", t: "Very Strong" },
              { c: "±60% to ±79%", t: "Strong" },
              { c: "±40% to ±59%", t: "Moderate" },
              { c: "< ±40%", t: "Weak/Very Weak" },
            ].map((r) => (
              <div key={r.c} style={{ border: `1px solid ${T.border}`, borderRadius: 999, padding: "4px 8px", fontFamily: T.fontMono, fontSize: 10, color: T.textSecondary }}>
                {r.c} · {r.t}
              </div>
            ))}
          </div>

          {!hoveredKey ? (
            <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textSecondary, direction: "ltr" }}>
              Links are not category-based anymore. They are selected by measurable co-movement and risk likeness.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {hoveredLinksInfo.map((x) => (
                <div key={x.other} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", background: "#0f0f12" }}>
                  <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textPrimary, direction: "ltr", marginBottom: 3 }}>
                    {hoveredKey} ↔ {x.other}
                  </div>
                  <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textPrimary, direction: "ltr", marginBottom: 4 }}>
                    Corr: <span style={{ color: Math.abs(x.corr) >= 0.6 ? T.gold : T.textSecondary }}>{x.corrPct}</span> · {x.corrStrength}
                  </div>
                  <div style={{ fontFamily: T.fontMono, fontSize: 10, color: T.textSecondary, direction: "ltr" }}>{x.rationale}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/*
Basic sanity checks (manual):
1) Component compiles (no JSX nesting errors).
2) Hover any node => linked lines highlight + rationale panel updates.
3) Correlation labels appear on highlighted/strong links (e.g., +78%, -42%).
4) Exactly 8 instruments rendered.
*/
