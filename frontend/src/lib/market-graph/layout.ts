import type { AssetCategory, Instrument, CorrelationEdge, NodePosition, EdgeLabel } from './types';

// ---------------------------------------------------------------------------
// Category ordering for clockwise layout starting from top (-90 deg)
// Saudi (top), US Index (right), Energy (bottom-right),
// Commodity (bottom-left), Crypto (left)
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: AssetCategory[] = [
  'Saudi',
  'US Index',
  'Energy',
  'Commodity',
  'Crypto',
];

/** Degrees of empty arc between category groups */
const CATEGORY_GAP_DEG = 12;

/** Minimum distance between any two nodes (pixels) */
const MIN_NODE_DISTANCE = 48;

// ---------------------------------------------------------------------------
// Compute node positions in a circular constellation layout,
// grouped by category with gaps between groups
// ---------------------------------------------------------------------------

export function layoutNodes(
  instruments: Instrument[],
  cx: number,
  cy: number,
  maxR: number,
): NodePosition[] {
  if (instruments.length === 0) return [];

  // --- volatility range for radial offset ---
  const vols = instruments.map((i) => i.vol ?? 0);
  const minV = Math.min(...vols);
  const maxV = Math.max(...vols);
  const rng = maxV - minV || 1;

  // --- group instruments by category (preserving original order within each) ---
  const groups: Map<AssetCategory, Instrument[]> = new Map();
  for (const cat of CATEGORY_ORDER) groups.set(cat, []);
  for (const inst of instruments) {
    const list = groups.get(inst.category);
    if (list) list.push(inst);
    else groups.set(inst.category, [inst]); // unknown category fallback
  }

  // Remove empty groups so gaps are only between populated categories
  const populatedCats: AssetCategory[] = [];
  for (const cat of CATEGORY_ORDER) {
    if ((groups.get(cat)?.length ?? 0) > 0) populatedCats.push(cat);
  }

  const totalItems = instruments.length;
  const totalGapDeg = CATEGORY_GAP_DEG * populatedCats.length;
  const availableDeg = 360 - totalGapDeg;
  const degPerItem = totalItems > 0 ? availableDeg / totalItems : 0;

  // --- assign angles per instrument ---
  const positions: NodePosition[] = [];
  let cursor = -90; // start at top

  for (const cat of populatedCats) {
    const members = groups.get(cat)!;
    for (let i = 0; i < members.length; i++) {
      const inst = members[i];
      const angle = cursor + i * degPerItem;
      const nv = (inst.vol - minV) / rng;
      const rf = 0.84 + nv * 0.06;
      const rad = (angle * Math.PI) / 180;
      positions.push({
        key: inst.key,
        x: cx + Math.cos(rad) * maxR * rf,
        y: cy + Math.sin(rad) * maxR * rf,
      });
    }
    cursor += members.length * degPerItem + CATEGORY_GAP_DEG;
  }

  // --- push apart any overlapping nodes ---
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[j].x - positions[i].x;
        const dy = positions[j].y - positions[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        if (dist < MIN_NODE_DISTANCE) {
          const push = (MIN_NODE_DISTANCE - dist) / 2;
          const ux = (dx / dist) * push;
          const uy = (dy / dist) * push;
          positions[i].x -= ux;
          positions[i].y -= uy;
          positions[j].x += ux;
          positions[j].y += uy;
        }
      }
    }
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Build a lookup map from key to position
// ---------------------------------------------------------------------------

export function toPosMap(positions: NodePosition[]): Record<string, NodePosition> {
  const m: Record<string, NodePosition> = {};
  positions.forEach((p) => {
    m[p.key] = p;
  });
  return m;
}

// ---------------------------------------------------------------------------
// Compute edge label positions avoiding center and collisions
// ---------------------------------------------------------------------------

export function computeEdgeLabelPositions(
  edges: CorrelationEdge[],
  posMap: Record<string, NodePosition>,
  cx: number,
  cy: number,
  hubRadius: number,
): EdgeLabel[] {
  const labels: EdgeLabel[] = [];
  const occupied: Array<{ x: number; y: number; w: number; h: number }> = [];
  const LABEL_W = 78;
  const LABEL_H = 34;
  const NUDGE_STEP = 26;
  const CENTER_CLEAR = hubRadius + 30;
  const T_CANDIDATES = [0.28, 0.72, 0.22, 0.78, 0.35, 0.65, 0.18, 0.82, 0.42, 0.58];

  for (let ei = 0; ei < edges.length; ei++) {
    const edge = edges[ei];
    const pa = posMap[edge.from];
    const pb = posMap[edge.to];
    if (!pa || !pb) continue;

    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const lineLen = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / lineLen;
    const ny = dx / lineLen;

    let bestX: number | null = null;
    let bestY: number | null = null;
    let bestScore = Infinity;

    for (let ti = 0; ti < T_CANDIDATES.length; ti++) {
      const t = T_CANDIDATES[(ei + ti) % T_CANDIDATES.length];
      let px = pa.x + dx * t;
      let py = pa.y + dy * t;

      const distFromCenter = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
      if (distFromCenter < CENTER_CLEAR) {
        const angle = Math.atan2(py - cy, px - cx);
        px = cx + Math.cos(angle) * CENTER_CLEAR;
        py = cy + Math.sin(angle) * CENTER_CLEAR;
      }

      for (const nudge of [0, NUDGE_STEP, -NUDGE_STEP, NUDGE_STEP * 2, -NUDGE_STEP * 2]) {
        const tx = px + nx * nudge;
        const ty = py + ny * nudge;

        const dc = Math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2);
        if (dc < CENTER_CLEAR) continue;

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
          if (collisionPenalty === 0 && Math.abs(nudge) <= NUDGE_STEP) break;
        }
      }
      if (bestScore < 1) break;
    }

    if (bestX !== null && bestY !== null) {
      occupied.push({ x: bestX, y: bestY, w: LABEL_W, h: LABEL_H });
      labels.push({ ...edge, lx: bestX, ly: bestY });
    }
  }

  return labels;
}
