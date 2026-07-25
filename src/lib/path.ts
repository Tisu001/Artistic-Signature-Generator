// 路径几何工具：解析/序列化/变换/采样/拟合
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export type Pt = [number, number];
export interface Cmd {
  t: 'M' | 'L' | 'C' | 'Q' | 'Z';
  v: number[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function parsePath(d: string): Cmd[] {
  const cmds: Cmd[] = [];
  const re = /([MLCQZHVmlcqzhv])([^MLCQZHVmlcqzhv]*)/g;
  let m: RegExpExecArray | null;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  while ((m = re.exec(d))) {
    const raw = m[1];
    const nums = m[2].trim() ? m[2].trim().split(/[\s,]+/).map(Number) : [];
    const rel = raw === raw.toLowerCase();
    const t = raw.toUpperCase() as Cmd['t'] | 'H' | 'V';
    const abs = (x: number, y: number): Pt => (rel ? [cx + x, cy + y] : [x, y]);
    if (t === 'M') {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const [x, y] = abs(nums[i], nums[i + 1]);
        if (i === 0) {
          cmds.push({ t: 'M', v: [x, y] });
          startX = x;
          startY = y;
        } else cmds.push({ t: 'L', v: [x, y] });
        cx = x;
        cy = y;
      }
    } else if (t === 'L') {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const [x, y] = abs(nums[i], nums[i + 1]);
        cmds.push({ t: 'L', v: [x, y] });
        cx = x;
        cy = y;
      }
    } else if (t === 'C') {
      for (let i = 0; i + 5 < nums.length; i += 6) {
        const [x1, y1] = abs(nums[i], nums[i + 1]);
        const [x2, y2] = abs(nums[i + 2], nums[i + 3]);
        const [x, y] = abs(nums[i + 4], nums[i + 5]);
        cmds.push({ t: 'C', v: [x1, y1, x2, y2, x, y] });
        cx = x;
        cy = y;
      }
    } else if (t === 'Q') {
      for (let i = 0; i + 3 < nums.length; i += 4) {
        const [x1, y1] = abs(nums[i], nums[i + 1]);
        const [x, y] = abs(nums[i + 2], nums[i + 3]);
        cmds.push({ t: 'Q', v: [x1, y1, x, y] });
        cx = x;
        cy = y;
      }
    } else if (t === 'H') {
      for (const n of nums) {
        cx = rel ? cx + n : n;
        cmds.push({ t: 'L', v: [cx, cy] });
      }
    } else if (t === 'V') {
      for (const n of nums) {
        cy = rel ? cy + n : n;
        cmds.push({ t: 'L', v: [cx, cy] });
      }
    } else if (t === 'Z') {
      cmds.push({ t: 'Z', v: [] });
      cx = startX;
      cy = startY;
    }
  }
  return cmds;
}

export function serialize(cmds: Cmd[]): string {
  return cmds
    .map((c) => (c.t === 'Z' ? 'Z' : `${c.t}${c.v.map(r2).join(' ')}`))
    .join('');
}

// 三次/二次贝塞尔取值
function cubicAt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}
function quadAt(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
}

// 轮廓采样为多边形点列（按轮廓分组）
export function flatten(cmds: Cmd[], step = 3): { pts: Pt[]; closed: boolean }[] {
  const contours: { pts: Pt[]; closed: boolean }[] = [];
  let pts: Pt[] = [];
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  const pushContour = (closed: boolean) => {
    if (pts.length > 1) contours.push({ pts, closed });
    pts = [];
  };
  for (const c of cmds) {
    if (c.t === 'M') {
      pushContour(false);
      cur = [c.v[0], c.v[1]];
      start = cur;
      pts.push(cur);
    } else if (c.t === 'L') {
      const to: Pt = [c.v[0], c.v[1]];
      const dist = Math.hypot(to[0] - cur[0], to[1] - cur[1]);
      const n = Math.max(1, Math.ceil(dist / step));
      for (let i = 1; i <= n; i++)
        pts.push([cur[0] + ((to[0] - cur[0]) * i) / n, cur[1] + ((to[1] - cur[1]) * i) / n]);
      cur = to;
    } else if (c.t === 'C') {
      const p1: Pt = [c.v[0], c.v[1]];
      const p2: Pt = [c.v[2], c.v[3]];
      const to: Pt = [c.v[4], c.v[5]];
      const approx =
        Math.hypot(p1[0] - cur[0], p1[1] - cur[1]) +
        Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) +
        Math.hypot(to[0] - p2[0], to[1] - p2[1]);
      const n = Math.max(4, Math.ceil(approx / step));
      for (let i = 1; i <= n; i++) pts.push(cubicAt(cur, p1, p2, to, i / n));
      cur = to;
    } else if (c.t === 'Q') {
      const p1: Pt = [c.v[0], c.v[1]];
      const to: Pt = [c.v[2], c.v[3]];
      const approx =
        Math.hypot(p1[0] - cur[0], p1[1] - cur[1]) + Math.hypot(to[0] - p1[0], to[1] - p1[1]);
      const n = Math.max(4, Math.ceil(approx / step));
      for (let i = 1; i <= n; i++) pts.push(quadAt(cur, p1, to, i / n));
      cur = to;
    } else if (c.t === 'Z') {
      pts.push(start);
      pushContour(true);
      cur = start;
    }
  }
  pushContour(false);
  return contours;
}

export function cmdsBBox(cmds: Cmd[]): BBox {
  const contours = flatten(cmds, 4);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { pts } of contours)
    for (const [x, y] of pts) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

export function mergeBBox(a: BBox, b: BBox): BBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function translateBBox(b: BBox, dx: number, dy: number): BBox {
  return { minX: b.minX + dx, minY: b.minY + dy, maxX: b.maxX + dx, maxY: b.maxY + dy };
}

// 对所有坐标应用映射
export function mapCmds(cmds: Cmd[], fn: (x: number, y: number) => Pt): Cmd[] {
  return cmds.map((c) => {
    if (c.t === 'Z') return c;
    const v: number[] = [];
    for (let i = 0; i + 1 < c.v.length; i += 2) {
      const [x, y] = fn(c.v[i], c.v[i + 1]);
      v.push(x, y);
    }
    return { t: c.t, v };
  });
}

// 仿射变换 [a,b,c,d,e,f]: x' = a*x + c*y + e; y' = b*x + d*y + f
export function transformCmds(cmds: Cmd[], m: [number, number, number, number, number, number]): Cmd[] {
  return mapCmds(cmds, (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
}

// Ramer-Douglas-Peucker 抽稀
export function rdp(pts: Pt[], tol: number): Pt[] {
  if (pts.length <= 2) return pts.slice();
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [x1, y1] = pts[s];
    const [x2, y2] = pts[e];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      // 弦长退化（首尾同点，如未去重的闭合环）时退化为点到锚点的距离，避免整体塌缩
      const d =
        len < 1e-6
          ? Math.hypot(pts[i][0] - x1, pts[i][1] - y1)
          : Math.abs((pts[i][0] - x1) * dy - (pts[i][1] - y1) * dx) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// Catmull-Rom 拟合为三次贝塞尔
export function catmullRom(pts: Pt[], closed = false): Cmd[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return [{ t: 'M', v: pts[0] }];
  if (pts.length === 2) return [{ t: 'M', v: pts[0] }, { t: 'L', v: pts[1] }];
  const cmds: Cmd[] = [{ t: 'M', v: pts[0] }];
  const n = pts.length;
  const get = (i: number): Pt =>
    closed ? pts[((i % n) + n) % n] : pts[Math.min(Math.max(i, 0), n - 1)];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    cmds.push({ t: 'C', v: [...c1, ...c2, ...p2] });
  }
  if (closed) cmds.push({ t: 'Z', v: [] });
  return cmds;
}

// 路径长度估计
export function cmdsLength(cmds: Cmd[]): number {
  const contours = flatten(cmds, 2.5);
  let len = 0;
  for (const { pts } of contours)
    for (let i = 1; i < pts.length; i++)
      len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return len;
}

// 沿线宽度渐变的描边 → 填充多边形（用于花体收尾/下划线）
export function taperedStroke(pts: Pt[], widthAt: (t: number) => number): Cmd[] {
  if (pts.length < 2) return [];
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1] || 1e-9;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const pPrev = pts[Math.max(i - 1, 0)];
    const pNext = pts[Math.min(i + 1, pts.length - 1)];
    let dx = pNext[0] - pPrev[0];
    let dy = pNext[1] - pPrev[1];
    const l = Math.hypot(dx, dy) || 1e-9;
    dx /= l;
    dy /= l;
    const w = widthAt(cum[i] / total) / 2;
    left.push([pts[i][0] - dy * w, pts[i][1] + dx * w]);
    right.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  const poly = [...left, ...right.reverse()];
  const cmds: Cmd[] = [{ t: 'M', v: poly[0] }];
  for (let i = 1; i < poly.length; i++) cmds.push({ t: 'L', v: poly[i] });
  cmds.push({ t: 'Z', v: [] });
  return cmds;
}

// 对数螺旋点列（收尾卷曲装饰）
export function spiralPts(
  attach: Pt,
  rOut: number,
  rIn: number,
  turns: number,
  startAngle: number,
  dir: 1 | -1 = 1,
  samples = 90
): Pt[] {
  const pts: Pt[] = [];
  const totalAng = Math.PI * 2 * turns;
  // 起点在 attach：螺旋中心 = attach - rOut * dirVec(startAngle)
  const cx = attach[0] - rOut * Math.cos(startAngle);
  const cy = attach[1] - rOut * Math.sin(startAngle);
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const ang = startAngle + dir * totalAng * t;
    const r = rOut + (rIn - rOut) * t;
    pts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
  }
  return pts;
}

export function bboxOfPts(pts: Pt[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}
