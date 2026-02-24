import { useState, useEffect, useMemo, useCallback, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   DESIGN TOKENS
   ═══════════════════════════════════════════════════════════════════════ */
const T = {
  bg: "#06070A", surface: "#0D0E12", surfaceAlt: "#12141A",
  elevated: "#171920", border: "#1C1E26", borderLight: "#262830",
  gold: "#D4A84B", goldDim: "rgba(212,168,75,0.12)", goldMuted: "#9A7A38",
  inflow: "#00DC82", inflowDim: "rgba(0,220,130,0.08)", inflowMid: "rgba(0,220,130,0.25)",
  outflow: "#FF4D6A", outflowDim: "rgba(255,77,106,0.08)", outflowMid: "rgba(255,77,106,0.25)",
  cyan: "#38BDF8", cyanDim: "rgba(56,189,248,0.10)",
  purple: "#A78BFA", purpleDim: "rgba(167,139,250,0.10)",
  amber: "#F59E0B", amberDim: "rgba(245,158,11,0.10)",
  text1: "#F0EDE6", text2: "#8A8C96", text3: "#4E5058",
  fontAr: "'Tajawal', sans-serif", fontMono: "'IBM Plex Mono', monospace",
  r: 10,
};
const SPR = "cubic-bezier(0.34,1.56,0.64,1)";
const SPR_D = "cubic-bezier(0.16,1,0.3,1)";
const EXPO = "cubic-bezier(0.19,1,0.22,1)";

/* ═══════════════════════════════════════════════════════════════════════
   MOCK DATA — Al Rajhi Bank (1120.SR) 30-day flow data
   In production: fetched via async Server Component or Edge API.
   ═══════════════════════════════════════════════════════════════════════ */
const STOCK = { ticker: "1120", nameAr: "مصرف الراجحي", nameEn: "Al Rajhi Bank", sector: "البنوك", sectorEn: "Banking", price: 96.40, change: 1.68, marketCap: 241.0 };

// 30 days of flow data (millions SAR)
const FLOW_DATA = [
  { day: "Jan 14", inflow: 142, outflow: 128, inst: 82, retail: 38, foreign: 22 },
  { day: "Jan 15", inflow: 156, outflow: 139, inst: 91, retail: 42, foreign: 23 },
  { day: "Jan 16", inflow: 128, outflow: 151, inst: 70, retail: 35, foreign: 23 },
  { day: "Jan 17", inflow: 134, outflow: 145, inst: 78, retail: 32, foreign: 24 },
  { day: "Jan 18", inflow: 167, outflow: 133, inst: 98, retail: 44, foreign: 25 },
  { day: "Jan 19", inflow: 189, outflow: 152, inst: 112, retail: 48, foreign: 29 },
  { day: "Jan 20", inflow: 145, outflow: 158, inst: 84, retail: 36, foreign: 25 },
  { day: "Jan 21", inflow: 178, outflow: 141, inst: 105, retail: 46, foreign: 27 },
  { day: "Jan 22", inflow: 162, outflow: 169, inst: 92, retail: 40, foreign: 30 },
  { day: "Jan 23", inflow: 195, outflow: 148, inst: 118, retail: 50, foreign: 27 },
  { day: "Jan 24", inflow: 183, outflow: 161, inst: 108, retail: 45, foreign: 30 },
  { day: "Jan 25", inflow: 147, outflow: 172, inst: 82, retail: 38, foreign: 27 },
  { day: "Jan 26", inflow: 210, outflow: 164, inst: 128, retail: 52, foreign: 30 },
  { day: "Jan 27", inflow: 198, outflow: 178, inst: 116, retail: 48, foreign: 34 },
  { day: "Jan 28", inflow: 155, outflow: 189, inst: 88, retail: 37, foreign: 30 },
  { day: "Feb 01", inflow: 224, outflow: 171, inst: 138, retail: 54, foreign: 32 },
  { day: "Feb 02", inflow: 201, outflow: 183, inst: 120, retail: 50, foreign: 31 },
  { day: "Feb 03", inflow: 176, outflow: 195, inst: 100, retail: 42, foreign: 34 },
  { day: "Feb 04", inflow: 238, outflow: 178, inst: 148, retail: 56, foreign: 34 },
  { day: "Feb 05", inflow: 215, outflow: 192, inst: 130, retail: 52, foreign: 33 },
  { day: "Feb 06", inflow: 192, outflow: 208, inst: 110, retail: 46, foreign: 36 },
  { day: "Feb 07", inflow: 245, outflow: 189, inst: 152, retail: 58, foreign: 35 },
  { day: "Feb 08", inflow: 228, outflow: 204, inst: 140, retail: 54, foreign: 34 },
  { day: "Feb 09", inflow: 186, outflow: 221, inst: 108, retail: 44, foreign: 34 },
  { day: "Feb 10", inflow: 258, outflow: 198, inst: 162, retail: 60, foreign: 36 },
  { day: "Feb 11", inflow: 242, outflow: 215, inst: 150, retail: 56, foreign: 36 },
  { day: "Feb 12", inflow: 198, outflow: 232, inst: 116, retail: 46, foreign: 36 },
  { day: "Feb 13", inflow: 271, outflow: 208, inst: 168, retail: 64, foreign: 39 },
  { day: "Feb 14", inflow: 256, outflow: 221, inst: 158, retail: 60, foreign: 38 },
  { day: "Feb 15", inflow: 234, outflow: 198, inst: 142, retail: 56, foreign: 36 },
];

// Hourly flow intensity (5 rows = trading hours, 6 cols = last 6 days)
const HOURLY_HEAT = [
  [0.82, 0.65, 0.91, 0.55, 0.78, 0.88],
  [0.45, 0.72, 0.38, 0.68, 0.52, 0.61],
  [0.33, 0.28, 0.42, 0.35, 0.31, 0.39],
  [0.58, 0.64, 0.49, 0.72, 0.68, 0.55],
  [0.91, 0.85, 0.78, 0.95, 0.89, 0.92],
];
const HOUR_LABELS = ["10:00", "11:00", "12:00", "13:00", "14:00"];
const DAY_LABELS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "اليوم"];

/* ═══════════════════════════════════════════════════════════════════════
   COMPUTED ANALYTICS — pure functions (server-side in production)
   ═══════════════════════════════════════════════════════════════════════ */
function computeFlowAnalytics(data) {
  const totalIn = data.reduce((s, d) => s + d.inflow, 0);
  const totalOut = data.reduce((s, d) => s + d.outflow, 0);
  const netFlow = totalIn - totalOut;
  const ratio = totalIn / (totalOut || 1);
  const pressure = Math.min(Math.max((ratio - 0.7) / 0.6, 0), 1); // 0..1 scale

  // Cumulative net flow
  let cum = 0;
  const cumulative = data.map(d => { cum += d.inflow - d.outflow; return cum; });

  // Investor breakdown totals
  const instTotal = data.reduce((s, d) => s + d.inst, 0);
  const retailTotal = data.reduce((s, d) => s + d.retail, 0);
  const foreignTotal = data.reduce((s, d) => s + d.foreign, 0);
  const segTotal = instTotal + retailTotal + foreignTotal;

  // Streak
  let streak = 0, streakDir = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    const net = data[i].inflow - data[i].outflow;
    if (i === data.length - 1) { streakDir = net > 0 ? 1 : -1; streak = 1; }
    else if ((net > 0 ? 1 : -1) === streakDir) streak++;
    else break;
  }

  // 7-day vs 30-day average
  const last7 = data.slice(-7);
  const avg7Net = last7.reduce((s, d) => s + d.inflow - d.outflow, 0) / 7;
  const avg30Net = data.reduce((s, d) => s + d.inflow - d.outflow, 0) / data.length;

  // Flow volatility (stddev of daily net)
  const nets = data.map(d => d.inflow - d.outflow);
  const meanNet = nets.reduce((s, v) => s + v, 0) / nets.length;
  const flowVol = Math.sqrt(nets.reduce((s, v) => s + (v - meanNet) ** 2, 0) / (nets.length - 1));

  // Today
  const today = data[data.length - 1];
  const todayNet = today.inflow - today.outflow;

  return {
    totalIn, totalOut, netFlow, ratio, pressure, cumulative,
    instTotal, retailTotal, foreignTotal, segTotal,
    instPct: instTotal / segTotal, retailPct: retailTotal / segTotal, foreignPct: foreignTotal / segTotal,
    streak, streakDir, avg7Net, avg30Net, flowVol,
    today, todayNet, maxInflow: Math.max(...data.map(d => d.inflow)),
    maxOutflow: Math.max(...data.map(d => d.outflow)),
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   FORMATTERS
   ═══════════════════════════════════════════════════════════════════════ */
const fmtM = v => { const a = Math.abs(v); if (a >= 1000) return (v / 1000).toFixed(1) + "B"; return v.toFixed(0) + "M"; };
const fmtPct = v => (v * 100).toFixed(1) + "%";
const fmtPrice = v => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ═══════════════════════════════════════════════════════════════════════
   ANIMATED COUNTER — counts up from 0 to target value
   ═══════════════════════════════════════════════════════════════════════ */
function AnimatedNum({ value, format = fmtM, duration = 900, delay = 0 }) {
  const [display, setDisplay] = useState(0);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  useEffect(() => {
    if (!started) return;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(value * ease);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [started, value, duration]);
  return <span>{format(started ? display : 0)}</span>;
}

/* ═══════════════════════════════════════════════════════════════════════
   SHIMMER SKELETON
   ═══════════════════════════════════════════════════════════════════════ */
const Shimmer = ({ w, h, r = 6, delay = 0 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: T.border, position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(110deg,transparent 30%,${T.borderLight}50 50%,transparent 70%)`, animation: `shimmer 1.6s ease-in-out ${delay}s infinite` }} />
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════
   PRESSURE GAUGE — circular arc showing buy/sell ratio
   ═══════════════════════════════════════════════════════════════════════ */
function PressureGauge({ pressure, ratio, phase }) {
  const size = 200, cx = 100, cy = 110, r = 78;
  const startAngle = Math.PI * 0.8, endAngle = Math.PI * 0.2 + Math.PI * 2;
  const totalArc = endAngle - startAngle;
  const needleAngle = startAngle + totalArc * pressure;

  // Arc path helper
  const arc = (start, end, radius) => {
    const x1 = cx + Math.cos(start) * radius, y1 = cy + Math.sin(start) * radius;
    const x2 = cx + Math.cos(end) * radius, y2 = cy + Math.sin(end) * radius;
    const large = end - start > Math.PI ? 1 : 0;
    return `M${x1},${y1} A${radius},${radius} 0 ${large} 1 ${x2},${y2}`;
  };

  // Gradient stops along the arc
  const gaugeGrad = `sg-gauge`;
  const needleX = cx + Math.cos(needleAngle) * (r - 8);
  const needleY = cy + Math.sin(needleAngle) * (r - 8);

  const visible = phase >= 2;
  const label = pressure > 0.65 ? "ضغط شراء" : pressure < 0.35 ? "ضغط بيع" : "متوازن";
  const labelEn = pressure > 0.65 ? "Buy Pressure" : pressure < 0.35 ? "Sell Pressure" : "Neutral";
  const labelColor = pressure > 0.65 ? T.inflow : pressure < 0.35 ? T.outflow : T.gold;

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14,
      padding: "16px 20px 12px", textAlign: "center",
      opacity: visible ? 1 : 0, transform: `scale(${visible ? 1 : 0.9})`,
      transition: `all 0.6s ${SPR_D} 0.1s`,
    }}>
      <div style={{ fontFamily: T.fontAr, fontSize: 12, color: T.text2, marginBottom: 4 }}>مقياس الضغط</div>
      <svg width={size} height={140} viewBox={`0 0 ${size} 140`} style={{ display: "block", margin: "0 auto" }}>
        <defs>
          <linearGradient id={gaugeGrad} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={T.outflow} />
            <stop offset="50%" stopColor={T.gold} />
            <stop offset="100%" stopColor={T.inflow} />
          </linearGradient>
        </defs>
        {/* Track */}
        <path d={arc(startAngle, endAngle, r)} fill="none" stroke={T.border} strokeWidth={14} strokeLinecap="round" />
        {/* Filled arc */}
        <path d={arc(startAngle, endAngle, r)} fill="none" stroke={`url(#${gaugeGrad})`} strokeWidth={14} strokeLinecap="round"
          strokeDasharray={totalArc * r}
          strokeDashoffset={visible ? 0 : totalArc * r}
          style={{ transition: `stroke-dashoffset 1.2s ${EXPO} 0.3s` }} />
        {/* Needle */}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY}
          stroke={T.text1} strokeWidth={2.5} strokeLinecap="round"
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            opacity: visible ? 1 : 0,
            transition: `opacity 0.4s ease 0.6s`,
          }} />
        <circle cx={cx} cy={cy} r={5} fill={T.text1} />
        {/* Tick labels */}
        <text x={cx - r - 12} y={cy + 18} textAnchor="middle" fill={T.outflow} fontSize={9} fontFamily={T.fontMono}>SELL</text>
        <text x={cx + r + 12} y={cy + 18} textAnchor="middle" fill={T.inflow} fontSize={9} fontFamily={T.fontMono}>BUY</text>
      </svg>
      <div style={{ marginTop: -8 }}>
        <div style={{ fontFamily: T.fontMono, fontSize: 22, fontWeight: 600, color: labelColor }}>{ratio.toFixed(2)}x</div>
        <div style={{ fontFamily: T.fontAr, fontSize: 14, fontWeight: 600, color: labelColor, marginTop: 2 }}>{label}</div>
        <div style={{ fontFamily: T.fontMono, fontSize: 9, color: T.text3, marginTop: 1 }}>{labelEn}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   FLOW RIVER CHART — dual-area SVG (inflow above, outflow below zero)
   ═══════════════════════════════════════════════════════════════════════ */
function FlowRiver({ data, analytics, phase, onDayClick, selectedDay }) {
  const W = 660, H = 220, padL = 0, padR = 0, padT = 10, padB = 30;
  const cW = W - padL - padR, cH = H - padT - padB;
  const n = data.length;
  const maxVal = Math.max(analytics.maxInflow, analytics.maxOutflow) * 1.1;

  const midY = padT + cH / 2;
  const scaleY = (cH / 2) / maxVal;
  const stepX = cW / (n - 1);

  // Inflow points (above mid) and outflow points (below mid)
  const inPts = data.map((d, i) => [padL + i * stepX, midY - d.inflow * scaleY]);
  const outPts = data.map((d, i) => [padL + i * stepX, midY + d.outflow * scaleY]);

  // Smooth curve helper (catmull-rom to bezier)
  const smoothPath = (pts) => {
    if (pts.length < 2) return "";
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6, cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6, cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
    }
    return d;
  };

  const inPath = smoothPath(inPts);
  const outPath = smoothPath(outPts);
  const inArea = `${inPath} L${padL + (n - 1) * stepX},${midY} L${padL},${midY} Z`;
  const outArea = `${outPath} L${padL + (n - 1) * stepX},${midY} L${padL},${midY} Z`;
  const totalLen = 2000; // approximate for dash animation

  const visible = phase >= 3;

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14,
      padding: "16px 20px 10px", position: "relative",
      opacity: visible ? 1 : 0, transform: `translateY(${visible ? 0 : 16}px)`,
      transition: `all 0.6s ${EXPO} 0.15s`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontFamily: T.fontAr, fontSize: 13, fontWeight: 600, color: T.text1 }}>نهر التدفق — 30 يوم</div>
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 3, borderRadius: 1, background: T.inflow }} />
            <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.text3 }}>تدفق داخل</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 3, borderRadius: 1, background: T.outflow }} />
            <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.text3 }}>تدفق خارج</span>
          </div>
        </div>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        <defs>
          <linearGradient id="sg-inflow" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.inflow} stopOpacity="0.35" /><stop offset="100%" stopColor={T.inflow} stopOpacity="0.02" /></linearGradient>
          <linearGradient id="sg-outflow" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.outflow} stopOpacity="0.02" /><stop offset="100%" stopColor={T.outflow} stopOpacity="0.35" /></linearGradient>
        </defs>
        {/* Zero line */}
        <line x1={padL} y1={midY} x2={padL + cW} y2={midY} stroke={T.border} strokeWidth={1} strokeDasharray="4 4" />
        <text x={W - 2} y={midY - 4} textAnchor="end" fill={T.text3} fontSize={8} fontFamily={T.fontMono}>0</text>
        {/* Area fills */}
        <path d={inArea} fill="url(#sg-inflow)" opacity={visible ? 1 : 0} style={{ transition: "opacity 0.6s ease 0.4s" }} />
        <path d={outArea} fill="url(#sg-outflow)" opacity={visible ? 1 : 0} style={{ transition: "opacity 0.6s ease 0.4s" }} />
        {/* Line strokes with draw-in */}
        <path d={inPath} fill="none" stroke={T.inflow} strokeWidth={2} strokeLinecap="round"
          strokeDasharray={totalLen} strokeDashoffset={visible ? 0 : totalLen}
          style={{ transition: `stroke-dashoffset 1.4s ${EXPO} 0.2s` }} />
        <path d={outPath} fill="none" stroke={T.outflow} strokeWidth={2} strokeLinecap="round"
          strokeDasharray={totalLen} strokeDashoffset={visible ? 0 : totalLen}
          style={{ transition: `stroke-dashoffset 1.4s ${EXPO} 0.35s` }} />
        {/* Interactive columns */}
        {data.map((d, i) => {
          const x = padL + i * stepX;
          const isSel = selectedDay === i;
          return (
            <g key={i}>
              <rect x={x - stepX / 2} y={padT} width={stepX} height={cH}
                fill={isSel ? `${T.gold}12` : "transparent"} rx={2}
                style={{ cursor: "pointer" }}
                onClick={() => onDayClick(i)} />
              {isSel && <line x1={x} y1={padT} x2={x} y2={padT + cH} stroke={T.gold} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />}
              {/* Inflow dot */}
              <circle cx={x} cy={inPts[i][1]} r={isSel ? 4 : 0} fill={T.inflow}
                style={{ transition: `r 0.2s ${SPR}` }} />
              {/* Outflow dot */}
              <circle cx={x} cy={outPts[i][1]} r={isSel ? 4 : 0} fill={T.outflow}
                style={{ transition: `r 0.2s ${SPR}` }} />
            </g>
          );
        })}
        {/* X-axis labels (every 5th) */}
        {data.map((d, i) => i % 5 === 0 || i === n - 1 ? (
          <text key={`xl-${i}`} x={padL + i * stepX} y={H - 4} textAnchor="middle"
            fill={T.text3} fontSize={8} fontFamily={T.fontMono}>{d.day.split(" ")[1]}</text>
        ) : null)}
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   INVESTOR SEGMENTS — horizontal stacked bar + breakdown
   ═══════════════════════════════════════════════════════════════════════ */
function SegmentBreakdown({ analytics, phase }) {
  const visible = phase >= 3;
  const segs = [
    { key: "مؤسسات", keyEn: "Institutional", pct: analytics.instPct, total: analytics.instTotal, color: T.cyan, dim: T.cyanDim },
    { key: "أفراد", keyEn: "Retail", pct: analytics.retailPct, total: analytics.retailTotal, color: T.purple, dim: T.purpleDim },
    { key: "أجانب", keyEn: "Foreign", pct: analytics.foreignPct, total: analytics.foreignTotal, color: T.amber, dim: T.amberDim },
  ];
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 20px",
      opacity: visible ? 1 : 0, transform: `translateY(${visible ? 0 : 12}px)`,
      transition: `all 0.5s ${EXPO} 0.25s`,
    }}>
      <div style={{ fontFamily: T.fontAr, fontSize: 13, fontWeight: 600, color: T.text1, marginBottom: 12 }}>تدفق حسب المستثمر</div>
      {/* Stacked bar */}
      <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginBottom: 14, background: T.border }}>
        {segs.map((s, i) => (
          <div key={s.key} style={{
            width: visible ? `${s.pct * 100}%` : "0%", height: "100%", background: s.color,
            transition: `width 0.8s ${SPR_D} ${0.4 + i * 0.1}s`,
          }} />
        ))}
      </div>
      {/* Detail rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {segs.map((s, i) => (
          <div key={s.key} style={{
            display: "flex", alignItems: "center", gap: 10,
            opacity: visible ? 1 : 0, transform: `translateX(${visible ? 0 : 16}px)`,
            transition: `all 0.4s ${SPR_D} ${0.5 + i * 0.08}s`,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: T.fontAr, fontSize: 12, color: T.text1 }}>{s.key}</span>
                <span style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 600, color: s.color }}>{fmtM(s.total)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.text3 }}>{s.keyEn}</span>
                <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.text2 }}>{fmtPct(s.pct)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   HOURLY FLOW HEATMAP
   ═══════════════════════════════════════════════════════════════════════ */
function HourlyHeatmap({ phase }) {
  const visible = phase >= 4;
  const cellW = 48, cellH = 28, gap = 3;
  const heatColor = (v) => {
    if (v > 0.7) return T.inflow;
    if (v > 0.5) return T.gold;
    if (v > 0.35) return `${T.gold}88`;
    return `${T.outflow}88`;
  };
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 20px",
      opacity: visible ? 1 : 0, transform: `translateY(${visible ? 0 : 10}px)`,
      transition: `all 0.5s ${EXPO} 0.3s`,
    }}>
      <div style={{ fontFamily: T.fontAr, fontSize: 13, fontWeight: 600, color: T.text1, marginBottom: 4 }}>خريطة حرارة التدفق</div>
      <div style={{ fontFamily: T.fontMono, fontSize: 9, color: T.text3, marginBottom: 10 }}>Net flow intensity by hour / day</div>
      <div style={{ display: "flex", gap: gap, direction: "ltr" }}>
        {/* Row labels */}
        <div style={{ display: "flex", flexDirection: "column", gap, paddingTop: cellH + gap }}>
          {HOUR_LABELS.map(h => (
            <div key={h} style={{ height: cellH, display: "flex", alignItems: "center", fontFamily: T.fontMono, fontSize: 8, color: T.text3, paddingRight: 4 }}>{h}</div>
          ))}
        </div>
        {/* Grid */}
        <div>
          {/* Column labels */}
          <div style={{ display: "flex", gap }}>
            {DAY_LABELS.map(d => (
              <div key={d} style={{ width: cellW, height: cellH, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.fontAr, fontSize: 9, color: T.text3 }}>{d}</div>
            ))}
          </div>
          {/* Cells */}
          {HOURLY_HEAT.map((row, ri) => (
            <div key={ri} style={{ display: "flex", gap }}>
              {row.map((val, ci) => (
                <div key={ci} style={{
                  width: cellW, height: cellH, borderRadius: 4,
                  background: `${heatColor(val)}${Math.round(20 + val * 30).toString(16)}`,
                  border: `1px solid ${heatColor(val)}22`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: T.fontMono, fontSize: 9, fontWeight: 600,
                  color: heatColor(val),
                  opacity: visible ? 1 : 0,
                  transition: `opacity 0.3s ease ${0.4 + ri * 0.06 + ci * 0.04}s, background 0.3s ease`,
                }}>
                  {val > 0.5 ? "+" : val < 0.35 ? "−" : "·"}{Math.round(val * 100)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CUMULATIVE WATERFALL
   ═══════════════════════════════════════════════════════════════════════ */
function CumulativeWaterfall({ data, cumulative, phase }) {
  const visible = phase >= 3;
  const last10 = data.slice(-10);
  const last10Cum = cumulative.slice(-10);
  const W = 300, H = 120, padB = 18;
  const barW = 20, gap = 6;
  const nets = last10.map(d => d.inflow - d.outflow);
  const maxAbs = Math.max(...nets.map(Math.abs), 1);
  const scaleY = (H - padB - 10) / (maxAbs * 2);
  const midY = (H - padB) / 2 + 5;

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 20px 10px",
      opacity: visible ? 1 : 0, transform: `translateY(${visible ? 0 : 12}px)`,
      transition: `all 0.5s ${EXPO} 0.2s`,
    }}>
      <div style={{ fontFamily: T.fontAr, fontSize: 13, fontWeight: 600, color: T.text1, marginBottom: 10 }}>صافي التدفق اليومي</div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        <line x1={10} y1={midY} x2={W - 10} y2={midY} stroke={T.border} strokeWidth={1} />
        {nets.map((net, i) => {
          const x = 20 + i * (barW + gap);
          const h = Math.abs(net) * scaleY;
          const y = net > 0 ? midY - h : midY;
          const color = net > 0 ? T.inflow : T.outflow;
          return (
            <g key={i}>
              <rect x={x} y={visible ? y : midY} width={barW} height={visible ? h : 0}
                rx={3} fill={color} opacity={0.7}
                style={{ transition: `y 0.5s ${SPR_D} ${0.4 + i * 0.04}s, height 0.5s ${SPR_D} ${0.4 + i * 0.04}s` }} />
              <text x={x + barW / 2} y={H - 4} textAnchor="middle" fill={T.text3} fontSize={7} fontFamily={T.fontMono}>
                {last10[i].day.split(" ")[1]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DAY DETAIL OVERLAY — origin-aware layout projection
   ═══════════════════════════════════════════════════════════════════════ */
function DayDetailOverlay({ dayData, dayIndex, analytics, onClose }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { requestAnimationFrame(() => requestAnimationFrame(() => setVis(true))); }, []);
  const handleClose = useCallback(() => { setVis(false); setTimeout(onClose, 400); }, [onClose]);
  useEffect(() => { const h = e => { if (e.key === "Escape") handleClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [handleClose]);

  const net = dayData.inflow - dayData.outflow;
  const pos = net >= 0;
  const ac = pos ? T.inflow : T.outflow;
  const segTotal = dayData.inst + dayData.retail + dayData.foreign;

  return (
    <div onClick={handleClose} style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: vis ? "rgba(0,0,0,0.78)" : "rgba(0,0,0,0)",
      backdropFilter: vis ? "blur(16px)" : "blur(0px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.4s ease", cursor: "pointer",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 480, background: T.elevated, border: `1px solid ${T.borderLight}`, borderRadius: 18, cursor: "default",
        transform: vis ? "scale(1)" : "scale(0.88) translateY(30px)",
        opacity: vis ? 1 : 0, transition: `transform 0.5s ${SPR_D}, opacity 0.35s ease`,
        boxShadow: `0 24px 80px rgba(0,0,0,0.5), 0 0 40px ${ac}06`, direction: "rtl",
      }}>
        {/* Header */}
        <div style={{ padding: "22px 24px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: T.fontAr, fontSize: 18, fontWeight: 700, color: T.text1 }}>تفصيل يوم {dayData.day}</div>
            <div style={{ fontFamily: T.fontMono, fontSize: 10, color: T.text3, marginTop: 2, direction: "ltr" }}>Day {dayIndex + 1} of 30 · {STOCK.nameEn}</div>
          </div>
          <div style={{
            fontFamily: T.fontMono, fontSize: 20, fontWeight: 600, color: ac,
            background: pos ? T.inflowDim : T.outflowDim, padding: "4px 12px", borderRadius: 8,
          }}>
            {pos ? "+" : ""}{fmtM(net)}
          </div>
        </div>
        {/* Flow bars */}
        <div style={{ padding: "16px 24px", animation: `fadeUp 0.4s ${EXPO} 0.1s both` }}>
          {[
            { label: "تدفق داخل", labelEn: "Inflow", val: dayData.inflow, color: T.inflow, max: analytics.maxInflow },
            { label: "تدفق خارج", labelEn: "Outflow", val: dayData.outflow, color: T.outflow, max: analytics.maxOutflow },
          ].map((row, i) => (
            <div key={row.labelEn} style={{ marginBottom: 14, animation: `slideInRow 0.4s ${SPR_D} ${0.15 + i * 0.08}s both` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontFamily: T.fontAr, fontSize: 12, color: T.text2 }}>{row.label}</span>
                <span style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 600, color: row.color }}>{fmtM(row.val)}</span>
              </div>
              <div style={{ height: 8, background: T.border, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(row.val / row.max) * 100}%`, background: row.color, borderRadius: 4, opacity: 0.8, transition: `width 0.6s ${SPR_D}` }} />
              </div>
            </div>
          ))}
        </div>
        {/* Segment breakdown */}
        <div style={{ padding: "0 24px 20px", animation: `fadeUp 0.4s ${EXPO} 0.2s both` }}>
          <div style={{ fontFamily: T.fontAr, fontSize: 12, color: T.text2, marginBottom: 10 }}>تدفق داخل حسب النوع</div>
          {[
            { label: "مؤسسات", val: dayData.inst, color: T.cyan, pct: dayData.inst / segTotal },
            { label: "أفراد", val: dayData.retail, color: T.purple, pct: dayData.retail / segTotal },
            { label: "أجانب", val: dayData.foreign, color: T.amber, pct: dayData.foreign / segTotal },
          ].map((s, i) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, animation: `slideInRow 0.4s ${SPR_D} ${0.3 + i * 0.06}s both` }}>
              <div style={{ width: 6, height: 6, borderRadius: 2, background: s.color }} />
              <span style={{ fontFamily: T.fontAr, fontSize: 11, color: T.text2, width: 50, flexShrink: 0 }}>{s.label}</span>
              <div style={{ flex: 1, height: 14, background: `${T.border}88`, borderRadius: 3, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${s.pct * 100}%`, background: `${s.color}30`, borderRadius: 3 }} />
                <div style={{ position: "absolute", top: 0, left: 6, height: "100%", display: "flex", alignItems: "center", fontFamily: T.fontMono, fontSize: 8, fontWeight: 600, color: s.color }}>
                  {fmtM(s.val)} ({fmtPct(s.pct)})
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: "8px 24px 14px", textAlign: "center", fontFamily: T.fontMono, fontSize: 9, color: T.text3, borderTop: `1px solid ${T.border}` }}>
          ESC or click outside to close
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════════════════════════ */
export default function MoneyFlowDashboard() {
  const [phase, setPhase] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
  const [detailDay, setDetailDay] = useState(null);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 200);
    const t2 = setTimeout(() => setPhase(2), 450);
    const t3 = setTimeout(() => setPhase(3), 750);
    const t4 = setTimeout(() => setPhase(4), 1100);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  const analytics = useMemo(() => computeFlowAnalytics(FLOW_DATA), []);
  const pos = analytics.todayNet >= 0;
  const todayColor = pos ? T.inflow : T.outflow;

  const handleDayClick = useCallback((i) => {
    setSelectedDay(i);
    setDetailDay(i);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.fontAr, direction: "rtl", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes pulseRing{0%,100%{transform:scale(1);opacity:0.6}50%{transform:scale(1.08);opacity:0.2}}
        @keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideInRow{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        @keyframes flowPulse{0%,100%{box-shadow:0 0 8px rgba(0,220,130,0.15)}50%{box-shadow:0 0 20px rgba(0,220,130,0.3)}}
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 40px" }}>

        {/* ════════ HEADER ════════ */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24,
          opacity: phase >= 1 ? 1 : 0, transform: `translateY(${phase >= 1 ? 0 : -14}px)`,
          transition: `all 0.5s ${EXPO}`,
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <h1 style={{ fontFamily: T.fontAr, fontSize: 28, fontWeight: 800, color: T.text1, margin: 0, lineHeight: 1 }}>تحليل التدفق المالي</h1>
              <div style={{ background: T.goldDim, border: `1px solid ${T.gold}30`, borderRadius: 6, padding: "3px 10px" }}>
                <span style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 600, color: T.gold }}>FLOW</span>
              </div>
            </div>
            <p style={{ fontFamily: T.fontMono, fontSize: 11, color: T.text3, margin: "4px 0 0", direction: "ltr", textAlign: "right" }}>
              Money Flow Analysis · <span style={{ color: T.gold }}>{STOCK.ticker}.SR</span>
            </p>
          </div>
          {/* Stock info pill */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 18px" }}>
            <div>
              <div style={{ fontFamily: T.fontAr, fontSize: 16, fontWeight: 700, color: T.text1 }}>{STOCK.nameAr}</div>
              <div style={{ fontFamily: T.fontMono, fontSize: 9, color: T.text3 }}>{STOCK.nameEn} · {STOCK.sectorEn}</div>
            </div>
            <div style={{ width: 1, height: 30, background: T.border }} />
            <div style={{ textAlign: "left", direction: "ltr" }}>
              <div style={{ fontFamily: T.fontMono, fontSize: 18, fontWeight: 600, color: T.text1 }}>{fmtPrice(STOCK.price)}</div>
              <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.inflow }}>▲ +{STOCK.change.toFixed(2)}%</div>
            </div>
          </div>
        </div>

        {/* ════════ KPI STRIP ════════ */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 18,
          opacity: phase >= 2 ? 1 : 0, transform: `translateY(${phase >= 2 ? 0 : 10}px)`,
          transition: `all 0.5s ${EXPO} 0.1s`,
        }}>
          {[
            { labelAr: "إجمالي التدفق الداخل", labelEn: "Total Inflow", value: analytics.totalIn, color: T.inflow, prefix: "+" },
            { labelAr: "إجمالي التدفق الخارج", labelEn: "Total Outflow", value: analytics.totalOut, color: T.outflow, prefix: "−" },
            { labelAr: "صافي التدفق", labelEn: "Net Flow", value: analytics.netFlow, color: analytics.netFlow > 0 ? T.inflow : T.outflow, prefix: analytics.netFlow > 0 ? "+" : "" },
            { labelAr: "تقلب التدفق", labelEn: "Flow Volatility", value: analytics.flowVol, color: T.gold, prefix: "±" },
            { labelAr: `سلسلة ${analytics.streakDir > 0 ? "شراء" : "بيع"}`, labelEn: `${analytics.streakDir > 0 ? "Buy" : "Sell"} Streak`, value: analytics.streak, color: analytics.streakDir > 0 ? T.inflow : T.outflow, prefix: "", format: v => `${Math.round(v)} days` },
          ].map((kpi, i) => (
            <div key={kpi.labelEn} style={{
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
              padding: "14px 16px", textAlign: "center",
              animation: phase >= 2 ? `fadeUp 0.4s ${EXPO} ${0.12 + i * 0.06}s both` : "none",
            }}>
              <div style={{ fontFamily: T.fontMono, fontSize: 20, fontWeight: 600, color: kpi.color, lineHeight: 1.1 }}>
                {kpi.prefix}<AnimatedNum value={Math.abs(kpi.value)} format={kpi.format || fmtM} duration={800} delay={300 + i * 100} />
              </div>
              <div style={{ fontFamily: T.fontAr, fontSize: 11, color: T.text2, marginTop: 5 }}>{kpi.labelAr}</div>
              <div style={{ fontFamily: T.fontMono, fontSize: 8, color: T.text3, marginTop: 1 }}>{kpi.labelEn}</div>
            </div>
          ))}
        </div>

        {/* ════════ MAIN GRID ════════ */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 250px", gap: 14 }}>
          {/* LEFT: Flow River + Waterfall */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <FlowRiver data={FLOW_DATA} analytics={analytics} phase={phase} onDayClick={handleDayClick} selectedDay={selectedDay} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <CumulativeWaterfall data={FLOW_DATA} cumulative={analytics.cumulative} phase={phase} />
              <HourlyHeatmap phase={phase} />
            </div>
          </div>
          {/* RIGHT: Gauge + Segments */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <PressureGauge pressure={analytics.pressure} ratio={analytics.ratio} phase={phase} />
            <SegmentBreakdown analytics={analytics} phase={phase} />
            {/* Mini stat cards */}
            <div style={{
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "14px 16px",
              opacity: phase >= 4 ? 1 : 0, transition: `opacity 0.5s ease 0.35s`,
            }}>
              <div style={{ fontFamily: T.fontAr, fontSize: 12, fontWeight: 600, color: T.text1, marginBottom: 10 }}>مقارنة المتوسطات</div>
              {[
                { label: "متوسط 7 أيام", en: "7D Avg Net", val: analytics.avg7Net, color: analytics.avg7Net > 0 ? T.inflow : T.outflow },
                { label: "متوسط 30 يوم", en: "30D Avg Net", val: analytics.avg30Net, color: analytics.avg30Net > 0 ? T.inflow : T.outflow },
                { label: "تدفق اليوم", en: "Today's Net", val: analytics.todayNet, color: todayColor },
              ].map((s, i) => (
                <div key={s.en} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 0", borderBottom: i < 2 ? `1px solid ${T.border}` : "none",
                }}>
                  <div>
                    <div style={{ fontFamily: T.fontAr, fontSize: 11, color: T.text2 }}>{s.label}</div>
                    <div style={{ fontFamily: T.fontMono, fontSize: 8, color: T.text3 }}>{s.en}</div>
                  </div>
                  <div style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 600, color: s.color }}>
                    {s.val > 0 ? "+" : ""}{fmtM(s.val)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ════════ FOOTER ════════ */}
        <div style={{
          marginTop: 18, textAlign: "center",
          opacity: phase >= 4 ? 1 : 0, transition: "opacity 0.5s ease 0.4s",
        }}>
          <p style={{ fontFamily: T.fontAr, fontSize: 11, color: T.text3, lineHeight: 1.8, margin: "0 0 6px" }}>
            <span style={{ color: T.inflow }}>التدفق الداخل</span> يُظهر قيمة عمليات الشراء و<span style={{ color: T.outflow }}>التدفق الخارج</span> يُظهر عمليات البيع (بالمليون ريال). اضغط أي يوم في الرسم لعرض تفاصيله.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", fontFamily: T.fontMono, fontSize: 8, color: T.text3, opacity: 0.5 }}>
            <span>All values in SAR millions</span><span>·</span><span>30-day window</span><span>·</span><span>Mock data for illustration</span>
          </div>
        </div>
      </div>

      {/* ════════ DAY DETAIL OVERLAY ════════ */}
      {detailDay !== null && (
        <DayDetailOverlay
          dayData={FLOW_DATA[detailDay]}
          dayIndex={detailDay}
          analytics={analytics}
          onClose={() => setDetailDay(null)}
        />
      )}
    </div>
  );
}
