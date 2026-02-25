import { useState, useEffect, useMemo } from "react";

/* ═══════════════════════════ DESIGN TOKENS ═══════════════════════════ */
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
  cyan: "#22D3EE",
  cyanDim: "rgba(34,211,238,0.12)",
  purple: "#A78BFA",
  textPrimary: "#F0EDE6",
  textSecondary: "#8A8A94",
  textTertiary: "#55555F",
  fontAr: "'Tajawal', sans-serif",
  fontMono: "'IBM Plex Mono', monospace",
  radius: 12,
};

/* ═══════════════════════════ RAW INSTRUMENT DATA ═══════════════════════════ */
const RAW = [
  { key: "BTC",    nameAr: "بيتكوين",        nameEn: "Bitcoin",      value: 97245.30, change:  2.34, category: "Crypto",    sparkline: [91200, 93400, 94100, 92800, 95600, 96800, 97245] },
  { key: "GOLD",   nameAr: "الذهب",           nameEn: "Gold",         value: 2935.40,  change:  0.68, category: "Commodity", sparkline: [2890, 2905, 2898, 2920, 2915, 2928, 2935] },
  { key: "WTI",    nameAr: "نفط خام (WTI)",   nameEn: "WTI Oil",      value: 71.23,    change: -1.34, category: "Energy",    sparkline: [73.5, 74.1, 73.2, 72.8, 72.1, 71.8, 71.23] },
  { key: "BRENT",  nameAr: "نفط برنت",        nameEn: "Brent Crude",  value: 75.67,    change: -1.18, category: "Energy",    sparkline: [78.2, 77.8, 77.1, 76.5, 76.2, 75.9, 75.67] },
  { key: "SPX",    nameAr: "إس آند بي 500",   nameEn: "S&P 500",      value: 6120.35,  change:  1.12, category: "US Index",  sparkline: [5980, 6010, 6045, 6030, 6075, 6098, 6120] },
  { key: "NASDAQ", nameAr: "ناسداك",          nameEn: "NASDAQ",       value: 19845.20, change:  1.45, category: "US Index",  sparkline: [19200, 19380, 19500, 19420, 19650, 19780, 19845] },
  { key: "DJI",    nameAr: "داو جونز",        nameEn: "Dow Jones",    value: 44521.67, change:  0.82, category: "US Index",  sparkline: [43800, 43950, 44100, 44050, 44280, 44400, 44522] },
  { key: "RUT",    nameAr: "راسل 2000",       nameEn: "Russell 2000", value: 2287.45,  change: -0.38, category: "US Index",  sparkline: [2310, 2305, 2298, 2295, 2290, 2288, 2287] },
];

/* ═══════════════════════════ STATISTICS ENGINE ═══════════════════════════ */

function logReturns(prices) {
  const r = [];
  for (let i = 1; i < prices.length; i++) r.push(Math.log(prices[i] / prices[i - 1]));
  return r;
}
function mean(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }
function stdDev(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}
function pearsonCorr(a, b) {
  if (a.length !== b.length || a.length < 2) return 0;
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  const d = Math.sqrt(da * db);
  return d === 0 ? 0 : num / d;
}
function betaCalc(ar, mr) {
  if (ar.length !== mr.length || ar.length < 2) return 0;
  const ma = mean(ar), mm = mean(mr);
  let cov = 0, v = 0;
  for (let i = 0; i < ar.length; i++) { const da = ar[i] - ma, dm = mr[i] - mm; cov += da * dm; v += dm * dm; }
  return v === 0 ? 0 : cov / v;
}
function annualizedVol(r) { return stdDev(r) * Math.sqrt(252); }
function sharpeRatio(r) { const ar = mean(r) * 252, av = annualizedVol(r); return av === 0 ? 0 : ar / av; }

/* ═══════════════════════════ COMPUTE ═══════════════════════════ */

function computeMetrics(instruments) {
  const allR = {};
  instruments.forEach((i) => { allR[i.key] = logReturns(i.sparkline); });
  const spx = allR["SPX"];
  return instruments.map((i) => {
    const r = allR[i.key];
    return { ...i, returns: r, vol: annualizedVol(r), sharpe: sharpeRatio(r), beta: i.key === "SPX" ? 1.0 : betaCalc(r, spx) };
  });
}

function computeEdges(instruments, threshold = 0.25) {
  const edges = [];
  for (let i = 0; i < instruments.length; i++) {
    for (let j = i + 1; j < instruments.length; j++) {
      const a = instruments[i], b = instruments[j];
      const rho = pearsonCorr(a.returns, b.returns);
      if (Math.abs(rho) >= threshold) {
        edges.push({
          from: a.key, to: b.key, rho,
          r2: rho * rho,
          type: rho > 0 ? "positive" : "inverse",
          pct: Math.round(Math.abs(rho) * 100),
        });
      }
    }
  }
  return edges.sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));
}

function portfolioStats(instruments) {
  const n = instruments.length;
  const avgReturn = mean(instruments.map((i) => i.change));
  const avgVol = mean(instruments.map((i) => i.vol));
  const advancing = instruments.filter((i) => i.change > 0).length;
  const breadth = (advancing / n) * 2 - 1;
  const allR = instruments.map((i) => i.returns);
  let tc = 0, pc = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { tc += Math.abs(pearsonCorr(allR[i], allR[j])); pc++; }
  const avgAbsCorr = pc > 0 ? tc / pc : 0;
  return { avgReturn, avgVol, advancing, declining: n - advancing, breadth, avgAbsCorr, diversification: 1 - avgAbsCorr };
}

/* ═══════════════════════════ LAYOUT ═══════════════════════════ */

function layoutNodes(instruments, cx, cy, maxR) {
  const vols = instruments.map((i) => i.vol);
  const minV = Math.min(...vols), maxV = Math.max(...vols), rng = maxV - minV || 1;
  return instruments.map((inst, idx) => {
    const angle = (idx / instruments.length) * 360 - 90;
    const nv = (inst.vol - minV) / rng;
    const rf = 0.62 + nv * 0.30;
    const rad = (angle * Math.PI) / 180;
    return { key: inst.key, x: cx + Math.cos(rad) * maxR * rf, y: cy + Math.sin(rad) * maxR * rf };
  });
}

/**
 * SMART LABEL PLACEMENT — avoids center hub and other labels.
 *
 * Strategy:
 *  1. For each edge, try multiple t-positions along the line (0.25, 0.75, 0.35, 0.65, 0.20, 0.80)
 *     instead of always placing at the midpoint (0.5). This naturally spreads labels toward nodes.
 *  2. Enforce a CENTER EXCLUSION ZONE — if a candidate point falls inside the hub radius,
 *     push it outward radially until it clears.
 *  3. After choosing t, nudge perpendicular to the line to avoid collisions with already-placed labels.
 *  4. Larger collision rects (60×26) and bigger nudge steps (24px) for clear spacing.
 */
function computeEdgeLabelPositions(edges, posMap, cx, cy, hubRadius) {
  const labels = [];
  const occupied = []; // { x, y, w, h }
  const LABEL_W = 62, LABEL_H = 28;
  const NUDGE_STEP = 26;
  const CENTER_CLEAR = hubRadius + 30; // min distance from center

  // Alternating t-values: place labels closer to one node or the other
  const T_CANDIDATES = [0.28, 0.72, 0.22, 0.78, 0.35, 0.65, 0.18, 0.82, 0.42, 0.58];

  for (let ei = 0; ei < edges.length; ei++) {
    const edge = edges[ei];
    const pa = posMap[edge.from], pb = posMap[edge.to];
    if (!pa || !pb) continue;

    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const lineLen = Math.sqrt(dx * dx + dy * dy) || 1;
    // Unit normal (perpendicular)
    const nx = -dy / lineLen, ny = dx / lineLen;

    let bestX = null, bestY = null, bestScore = Infinity;

    // Try each t-candidate position along the line
    for (let ti = 0; ti < T_CANDIDATES.length; ti++) {
      const t = T_CANDIDATES[(ei + ti) % T_CANDIDATES.length]; // offset by edge index for variety
      let px = pa.x + dx * t;
      let py = pa.y + dy * t;

      // Push out of center exclusion zone
      const distFromCenter = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
      if (distFromCenter < CENTER_CLEAR) {
        const angle = Math.atan2(py - cy, px - cx);
        px = cx + Math.cos(angle) * CENTER_CLEAR;
        py = cy + Math.sin(angle) * CENTER_CLEAR;
      }

      // Try nudge offsets perpendicular to the line
      for (const nudge of [0, NUDGE_STEP, -NUDGE_STEP, NUDGE_STEP * 2, -NUDGE_STEP * 2]) {
        const tx = px + nx * nudge;
        const ty = py + ny * nudge;

        // Skip if inside center zone after nudge
        const dc = Math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2);
        if (dc < CENTER_CLEAR) continue;

        // Score: penalize collisions heavily, slightly prefer small nudges
        const collisionPenalty = occupied.reduce((sum, r) => {
          const overlapX = Math.max(0, (LABEL_W + r.w) / 2 - Math.abs(tx - r.x));
          const overlapY = Math.max(0, (LABEL_H + r.h) / 2 - Math.abs(ty - r.y));
          return sum + overlapX * overlapY;
        }, 0);

        const score = collisionPenalty * 1000 + Math.abs(nudge) * 0.5;

        if (score < bestScore) {
          bestScore = score;
          bestX = tx;
          bestY = ty;
          if (collisionPenalty === 0 && Math.abs(nudge) <= NUDGE_STEP) break; // good enough
        }
      }
      if (bestScore < 1) break; // perfect placement found
    }

    if (bestX !== null) {
      occupied.push({ x: bestX, y: bestY, w: LABEL_W, h: LABEL_H });
      labels.push({ ...edge, lx: bestX, ly: bestY });
    }
  }
  return labels;
}

/* ═══════════════════════════ SUB-COMPONENTS ═══════════════════════════ */

const fmt = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctFmt = (v) => (v * 100).toFixed(1) + "%";

const Sparkline = ({ data, positive, width = 64, height = 24 }) => {
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const color = positive ? T.green : T.red;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - ((v - min) / range) * height * 0.85 - height * 0.075]);
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  const areaD = `${pathD} L${width},${height} L0,${height} Z`;
  const gid = useMemo(() => `sg${Math.random().toString(36).slice(2, 6)}`, []);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.25" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={areaD} fill={`url(#${gid})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2" fill={color} />
    </svg>
  );
};

function CentralHub({ stats, instruments }) {
  const color = stats.avgReturn > 0 ? T.green : stats.avgReturn < 0 ? T.red : T.gold;
  const sentiment = stats.breadth > 0.3 ? "صاعد" : stats.breadth < -0.3 ? "هابط" : "متوازن";
  const sentimentEn = stats.breadth > 0.3 ? "Bullish" : stats.breadth < -0.3 ? "Bearish" : "Neutral";
  return (
    <div style={{
      position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
      width: 180, height: 180, borderRadius: "50%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", zIndex: 10,
      background: `radial-gradient(circle, ${T.surface} 0%, ${T.bg} 100%)`,
      border: `1px solid ${T.border}`, boxShadow: `0 0 60px ${color}18, 0 0 100px ${color}06`,
    }}>
      <div style={{ position: "absolute", inset: -2, borderRadius: "50%", border: `2px solid ${color}30`, animation: "pulseRing 3s ease-in-out infinite" }} />
      <span style={{ fontFamily: T.fontAr, fontSize: 19, fontWeight: 700, color: T.textPrimary, lineHeight: 1 }}>{sentiment}</span>
      <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.textSecondary, marginTop: 1 }}>{sentimentEn}</span>
      <span style={{ fontFamily: T.fontMono, fontSize: 16, fontWeight: 600, color, marginTop: 6, lineHeight: 1 }}>
        {stats.avgReturn > 0 ? "+" : ""}{stats.avgReturn.toFixed(2)}%
      </span>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 600, color: T.textPrimary }}>{stats.advancing}/{instruments.length}</div>
          <div style={{ fontFamily: T.fontMono, fontSize: 8, color: T.textTertiary }}>A/D</div>
        </div>
        <div style={{ width: 1, height: 22, background: T.border }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 600, color: stats.diversification > 0.5 ? T.green : T.gold }}>{pctFmt(stats.diversification)}</div>
          <div style={{ fontFamily: T.fontMono, fontSize: 8, color: T.textTertiary }}>Div.R</div>
        </div>
      </div>
    </div>
  );
}

const StatBadge = ({ label, value, color = T.textSecondary }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
    <span style={{ fontFamily: T.fontMono, fontSize: 8, color: T.textTertiary, textTransform: "uppercase" }}>{label}</span>
    <span style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 600, color }}>{value}</span>
  </div>
);

function InstrumentNode({ inst, x, y, isHovered, onHover, onLeave }) {
  const positive = inst.change >= 0;
  const accent = positive ? T.green : T.red;
  const bgTint = positive ? T.greenDim : T.redDim;
  const betaColor = Math.abs(inst.beta) > 1.5 ? T.red : Math.abs(inst.beta) > 0.8 ? T.gold : T.green;
  const sharpeColor = inst.sharpe > 1 ? T.green : inst.sharpe > 0 ? T.gold : T.red;
  return (
    <div onMouseEnter={onHover} onMouseLeave={onLeave} style={{
      position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)",
      width: isHovered ? 200 : 185, padding: "12px 14px", borderRadius: T.radius,
      background: isHovered ? `linear-gradient(135deg, ${T.surfaceHover} 0%, ${T.surface} 100%)` : T.surface,
      border: `1px solid ${isHovered ? accent + "50" : T.border}`,
      boxShadow: isHovered ? `0 0 28px ${accent}15, 0 6px 28px rgba(0,0,0,0.4)` : `0 2px 10px rgba(0,0,0,0.3)`,
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", cursor: "default", zIndex: isHovered ? 20 : 5, direction: "rtl",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: accent, boxShadow: `0 0 6px ${accent}66` }} />
          <span style={{ fontFamily: T.fontAr, fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{inst.nameAr}</span>
        </div>
        <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.textSecondary, background: bgTint, padding: "1px 5px", borderRadius: 3 }}>{inst.key}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ fontFamily: T.fontMono, fontSize: 16, fontWeight: 600, color: T.textPrimary, letterSpacing: "-0.02em" }}>{fmt(inst.value)}</span>
        <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 500, color: accent }}>
          {positive ? "▲" : "▼"} {positive ? "+" : ""}{inst.change.toFixed(2)}%
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
        <Sparkline data={inst.sparkline} positive={positive} width={isHovered ? 168 : 155} height={24} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, padding: "4px 0 0", borderTop: `1px solid ${T.border}` }}>
        <StatBadge label="σ" value={pctFmt(inst.vol)} color={T.textSecondary} />
        <StatBadge label="β" value={inst.beta.toFixed(2)} color={betaColor} />
        <StatBadge label="SR" value={inst.sharpe.toFixed(2)} color={sharpeColor} />
      </div>
      <div style={{ fontFamily: T.fontMono, fontSize: 8, color: T.textTertiary, textAlign: "center", marginTop: 4, direction: "ltr" }}>{inst.nameEn}</div>
    </div>
  );
}

function EdgeTooltip({ edge, x, y }) {
  const color = edge.rho > 0 ? T.gold : T.cyan;
  const dirLabel = edge.rho > 0 ? "يتحركان في نفس الاتجاه" : "يتحركان بشكل عكسي";
  const dirLabelEn = edge.rho > 0 ? "Move together" : "Move inversely";
  return (
    <div style={{
      position: "absolute", left: x, top: y, transform: "translate(-50%, -130%)",
      background: T.surface, border: `1px solid ${color}55`, borderRadius: 10,
      padding: "10px 14px", zIndex: 30, pointerEvents: "none",
      boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 20px ${color}10`,
      minWidth: 175, direction: "rtl",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.textPrimary, fontWeight: 600 }}>{edge.from} ↔ {edge.to}</span>
        <span style={{ fontFamily: T.fontMono, fontSize: 9, color, background: `${color}18`, padding: "2px 6px", borderRadius: 4 }}>
          {edge.rho > 0 ? "+" : "−"}{edge.pct}%
        </span>
      </div>
      <div style={{ fontFamily: T.fontAr, fontSize: 12, color: T.textSecondary, marginBottom: 6, lineHeight: 1.5 }}>
        <span style={{ color }}>ارتباط {edge.pct}%</span> — {dirLabel}
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        <div>
          <div style={{ fontFamily: T.fontMono, fontSize: 8, color: T.textTertiary }}>Correlation (ρ)</div>
          <div style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 600, color }}>{edge.rho > 0 ? "+" : ""}{edge.rho.toFixed(3)}</div>
        </div>
        <div>
          <div style={{ fontFamily: T.fontMono, fontSize: 8, color: T.textTertiary }}>Explained (R²)</div>
          <div style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 600, color: T.textSecondary }}>{(edge.r2 * 100).toFixed(1)}%</div>
        </div>
      </div>
      <div style={{ fontFamily: T.fontMono, fontSize: 9, color: T.textTertiary, marginTop: 6, direction: "ltr" }}>
        {dirLabelEn} — {edge.pct}% correlation
      </div>
    </div>
  );
}

/* ═══════════════════════════ MAIN ═══════════════════════════ */

export default function MarketOverview360() {
  const [hoveredKey, setHoveredKey] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const [time, setTime] = useState(new Date());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { setLoaded(true); }, []);
  useEffect(() => { const id = setInterval(() => setTime(new Date()), 60000); return () => clearInterval(id); }, []);

  const instruments = useMemo(() => computeMetrics(RAW), []);
  const edges = useMemo(() => computeEdges(instruments, 0.25), [instruments]);
  const stats = useMemo(() => portfolioStats(instruments), [instruments]);

  const W = 1120, H = 780;
  const cx = W / 2, cy = H / 2 + 10;
  const maxR = Math.min(cx, cy) * 0.74;
  const HUB_RADIUS = 90;

  const positions = useMemo(() => layoutNodes(instruments, cx, cy, maxR), [instruments, cx, cy, maxR]);
  const posMap = useMemo(() => { const m = {}; positions.forEach((p) => { m[p.key] = p; }); return m; }, [positions]);
  const edgeLabels = useMemo(() => computeEdgeLabelPositions(edges, posMap, cx, cy, HUB_RADIUS), [edges, posMap, cx, cy]);

  const isNodeInEdge = (key) => hoveredEdge && (hoveredEdge.from === key || hoveredEdge.to === key);
  const dimNode = (key) => (hoveredKey && hoveredKey !== key && !isNodeInEdge(key)) || (hoveredEdge && !isNodeInEdge(key));

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.fontAr, direction: "rtl", display: "flex", flexDirection: "column", alignItems: "center", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes pulseRing { 0%,100%{transform:scale(1);opacity:0.6} 50%{transform:scale(1.08);opacity:0.2} }
        @keyframes fadeSlideIn { from{opacity:0;transform:translate(-50%,-50%) scale(0.85)} to{opacity:1;transform:translate(-50%,-50%) scale(1)} }
        @keyframes orbitDash { to{stroke-dashoffset:-20} }
        @keyframes headerIn { from{opacity:0;transform:translateY(-18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes labelPop { from{opacity:0;transform:translate(-50%,-50%) scale(0.5)} to{opacity:1;transform:translate(-50%,-50%) scale(1)} }
      `}</style>

      {/* ═══ HEADER ═══ */}
      <div style={{
        width: "100%", maxWidth: W, padding: "26px 24px 0", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start",
        animation: loaded ? "headerIn 0.6s ease-out" : "none", opacity: loaded ? 1 : 0,
      }}>
        <div>
          <h1 style={{ fontFamily: T.fontAr, fontSize: 30, fontWeight: 800, color: T.textPrimary, margin: 0, lineHeight: 1.2 }}>نظرة 360°</h1>
          <p style={{ fontFamily: T.fontMono, fontSize: 12, color: T.textSecondary, margin: "5px 0 0", direction: "ltr", textAlign: "right" }}>
            <span style={{ color: T.gold }}>الأسواق العالمية</span>
            <span style={{ margin: "0 8px", color: T.textTertiary }}>·</span>
            World Markets
          </p>
          <p style={{ fontFamily: T.fontAr, fontSize: 12, color: T.textTertiary, margin: "8px 0 0", lineHeight: 1.6 }}>
            الخطوط تُظهر <span style={{ color: T.gold, fontWeight: 600 }}>نسبة الارتباط %</span> بين الأصول — كلما زادت النسبة، زاد تحركهما معاً.
            مرّر على أي خط لتفاصيل أكثر.
          </p>
        </div>
        <div style={{ textAlign: "left", direction: "ltr", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div style={{ fontFamily: T.fontMono, fontSize: 10, color: T.textTertiary, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, boxShadow: `0 0 5px ${T.green}88`, animation: "pulseRing 2s ease-in-out infinite" }} />
            {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            <span>·</span>
            {time.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
          <div style={{ display: "flex", gap: 12, fontFamily: T.fontMono, fontSize: 9, color: T.textTertiary }}>
            <span>Avg Corr = {Math.round(stats.avgAbsCorr * 100)}%</span>
            <span>σ̄ = {pctFmt(stats.avgVol)}</span>
            <span>{edges.length} links</span>
          </div>
        </div>
      </div>

      {/* ═══ CONSTELLATION ═══ */}
      <div style={{ position: "relative", width: W, height: H, margin: "2px auto 10px" }}>

        <svg width={W} height={H} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 1 }}>
          {[0.45, 0.65, 0.85].map((r, i) => (
            <circle key={i} cx={cx} cy={cy} r={maxR * r} fill="none" stroke={T.border} strokeWidth="0.4"
              strokeDasharray="3 8" opacity={0.22} style={{ animation: `orbitDash ${22 + i * 6}s linear infinite` }} />
          ))}

          {/* Correlation edge lines */}
          {edgeLabels.map((edge, i) => {
            const pa = posMap[edge.from], pb = posMap[edge.to];
            if (!pa || !pb) return null;
            const isHL = hoveredEdge === edge || hoveredKey === edge.from || hoveredKey === edge.to;
            const isDim = (hoveredKey || hoveredEdge) && !isHL;
            const lc = edge.rho > 0 ? T.gold : T.cyan;
            const thick = 0.5 + Math.abs(edge.rho) * 2.2;
            return (
              <g key={i}>
                <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="transparent" strokeWidth={16}
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                  onMouseEnter={() => setHoveredEdge(edge)} onMouseLeave={() => setHoveredEdge(null)} />
                <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                  stroke={lc} strokeWidth={isHL ? thick * 1.4 : thick}
                  strokeDasharray={isHL ? "none" : `${2 + Math.abs(edge.rho) * 5} ${5 + (1 - Math.abs(edge.rho)) * 5}`}
                  opacity={isDim ? 0.04 : isHL ? 0.7 : 0.2}
                  strokeLinecap="round" style={{ transition: "all 0.3s ease", pointerEvents: "none" }} />
              </g>
            );
          })}

          {/* Radial lines */}
          {positions.map((p) => {
            const inst = instruments.find((i) => i.key === p.key);
            const isConn = hoveredKey === p.key || isNodeInEdge(p.key);
            const color = inst.change >= 0 ? T.green : T.red;
            return (
              <line key={p.key} x1={cx} y1={cy} x2={p.x} y2={p.y}
                stroke={isConn ? color : T.textTertiary} strokeWidth={isConn ? 0.7 : 0.2}
                strokeDasharray="2 7" opacity={dimNode(p.key) ? 0.02 : isConn ? 0.25 : 0.05}
                style={{ transition: "all 0.3s ease" }} />
            );
          })}
        </svg>

        {/* ── Correlation % badges (HTML for crisp rendering) ── */}
        {edgeLabels.map((edge, i) => {
          const lc = edge.rho > 0 ? T.gold : T.cyan;
          const isHL = hoveredEdge === edge || hoveredKey === edge.from || hoveredKey === edge.to;
          const isDim = (hoveredKey || hoveredEdge) && !isHL;
          const sign = edge.rho > 0 ? "+" : "−";
          const arrow = edge.rho > 0 ? "↗" : "↘";
          return (
            <div key={`lbl-${i}`} style={{
              position: "absolute", left: edge.lx, top: edge.ly,
              transform: "translate(-50%, -50%)",
              zIndex: isHL ? 25 : 3,
              pointerEvents: "none",
              animation: loaded ? `labelPop 0.4s ease-out ${0.35 + i * 0.04}s both` : "none",
              opacity: isDim ? 0.1 : isHL ? 1 : 0.88,
              transition: "opacity 0.3s ease",
            }}>
              <div style={{
                fontFamily: T.fontMono,
                fontSize: isHL ? 12 : 10,
                fontWeight: 600,
                color: lc,
                background: isHL ? `${T.surface}F5` : `${T.bg}E8`,
                border: `1px solid ${isHL ? lc + "66" : lc + "28"}`,
                borderRadius: 6,
                padding: isHL ? "3px 9px" : "2px 7px",
                whiteSpace: "nowrap",
                boxShadow: isHL ? `0 0 14px ${lc}25` : `0 1px 4px rgba(0,0,0,0.4)`,
                transition: "all 0.3s ease",
                display: "flex", alignItems: "center", gap: 3,
              }}>
                <span style={{ fontSize: isHL ? 11 : 9, opacity: 0.7 }}>{arrow}</span>
                <span>{sign}{edge.pct}%</span>
              </div>
            </div>
          );
        })}

        <CentralHub stats={stats} instruments={instruments} />

        {instruments.map((inst, idx) => {
          const pos = positions[idx];
          return (
            <div key={inst.key} style={{
              position: "absolute", left: 0, top: 0, width: 0, height: 0,
              animation: loaded ? `fadeSlideIn 0.5s ease-out ${0.08 + idx * 0.055}s both` : "none",
              opacity: dimNode(inst.key) ? 0.3 : 1,
              transition: "opacity 0.3s ease",
            }}>
              <InstrumentNode
                inst={inst} x={pos.x} y={pos.y}
                isHovered={hoveredKey === inst.key || isNodeInEdge(inst.key)}
                onHover={() => setHoveredKey(inst.key)}
                onLeave={() => setHoveredKey(null)}
              />
            </div>
          );
        })}

        {hoveredEdge && posMap[hoveredEdge.from] && posMap[hoveredEdge.to] && (
          <EdgeTooltip
            edge={hoveredEdge}
            x={(posMap[hoveredEdge.from].x + posMap[hoveredEdge.to].x) / 2}
            y={(posMap[hoveredEdge.from].y + posMap[hoveredEdge.to].y) / 2}
          />
        )}
      </div>

      {/* ═══ LEGEND ═══ */}
      <div style={{ display: "flex", gap: 18, padding: "0 24px 10px", justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
        {[
          { labelAr: "عملات رقمية", labelEn: "Crypto", color: T.purple },
          { labelAr: "سلع", labelEn: "Commodity", color: T.gold },
          { labelAr: "طاقة", labelEn: "Energy", color: "#F59E0B" },
          { labelAr: "مؤشرات أمريكية", labelEn: "US Index", color: "#60A5FA" },
        ].map((c) => (
          <div key={c.labelEn} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: c.color, opacity: 0.7 }} />
            <span style={{ fontFamily: T.fontAr, fontSize: 11, color: T.textSecondary }}>{c.labelAr}</span>
            <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.textTertiary }}>{c.labelEn}</span>
          </div>
        ))}
        <div style={{ width: 1, height: 14, background: T.border }} />
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 14, height: 2, background: T.gold, borderRadius: 1 }} />
          <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.textTertiary }}>ارتباط إيجابي</span>
          <span style={{ fontFamily: T.fontMono, fontSize: 8, color: T.textTertiary, opacity: 0.5 }}>+ρ</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 14, height: 2, background: T.cyan, borderRadius: 1 }} />
          <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.textTertiary }}>ارتباط عكسي</span>
          <span style={{ fontFamily: T.fontMono, fontSize: 8, color: T.textTertiary, opacity: 0.5 }}>−ρ</span>
        </div>
      </div>

      {/* ═══ EXPLAINER ═══ */}
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "6px 24px 22px", textAlign: "center" }}>
        <p style={{ fontFamily: T.fontAr, fontSize: 12, color: T.textTertiary, lineHeight: 1.8, margin: "0 0 8px" }}>
          النسب على الخطوط تُظهر مدى <span style={{ color: T.gold }}>ارتباط</span> حركة الأصول ببعضها — <span style={{ color: T.gold }}>↗ 90%</span> تعني أنهما يتحركان معاً بنسبة 90%، بينما <span style={{ color: T.cyan }}>↘ 70%</span> تعني أنهما يتحركان بشكل عكسي بنسبة 70%.
          مرّر على أي خط لتفاصيل أكثر.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", fontFamily: T.fontMono, fontSize: 8, color: T.textTertiary, opacity: 0.5 }}>
          <span>σ = Ann. Volatility</span>
          <span>β = Beta vs SPX</span>
          <span>SR = Sharpe Ratio</span>
          <span>ρ = Pearson Corr.</span>
          <span>R² = Determination</span>
          <span>Div.R = 1−|ρ̄|</span>
        </div>
      </div>
    </div>
  );
}
