// 中心线提取：轮廓 → 扫描线栅格化 → 距离变换 → Zhang-Suen 细化 → 图追踪 → 交汇点缝合 → 曲线拟合
import { catmullRom, flatten, parsePath, rdp, serialize, type BBox, type Cmd, type Pt } from './path';

export interface SkStroke {
  cmds: Cmd[];
  d: string;
  width: number; // 估算自然笔宽（原坐标系）
  start: Pt;
  end: Pt;
  startDir: Pt; // 起点切向单位向量
  endDir: Pt; // 终点切向单位向量
  len: number; // 像素长度（原坐标系）
  closed: boolean;
}

const skeletonCache = new Map<string, SkStroke[]>();

function chamfer(bin: Uint8Array, W: number, H: number): Float32Array {
  const dist = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) dist[i] = bin[i] ? 1e9 : 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!bin[i]) continue;
      let m = dist[i];
      if (x > 0) m = Math.min(m, dist[i - 1] + 1);
      if (y > 0) {
        m = Math.min(m, dist[i - W] + 1);
        if (x > 0) m = Math.min(m, dist[i - W - 1] + 1.4142);
        if (x < W - 1) m = Math.min(m, dist[i - W + 1] + 1.4142);
      }
      dist[i] = m;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (!bin[i]) continue;
      let m = dist[i];
      if (x < W - 1) m = Math.min(m, dist[i + 1] + 1);
      if (y < H - 1) {
        m = Math.min(m, dist[i + W] + 1);
        if (x < W - 1) m = Math.min(m, dist[i + W + 1] + 1.4142);
        if (x > 0) m = Math.min(m, dist[i + W - 1] + 1.4142);
      }
      dist[i] = m;
    }
  }
  return dist;
}

function zhangSuen(bin: Uint8Array, W: number, H: number) {
  let changed = true;
  let iter = 0;
  const kill: number[] = [];
  while (changed && iter < 200) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      kill.length = 0;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (!bin[i]) continue;
          const p2 = bin[i - W];
          const p3 = bin[i - W + 1];
          const p4 = bin[i + 1];
          const p5 = bin[i + W + 1];
          const p6 = bin[i + W];
          const p7 = bin[i + W - 1];
          const p8 = bin[i - 1];
          const p9 = bin[i - W - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const A =
            (p2 === 0 && p3 === 1 ? 1 : 0) +
            (p3 === 0 && p4 === 1 ? 1 : 0) +
            (p4 === 0 && p5 === 1 ? 1 : 0) +
            (p5 === 0 && p6 === 1 ? 1 : 0) +
            (p6 === 0 && p7 === 1 ? 1 : 0) +
            (p7 === 0 && p8 === 1 ? 1 : 0) +
            (p8 === 0 && p9 === 1 ? 1 : 0) +
            (p9 === 0 && p2 === 1 ? 1 : 0);
          if (A !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }
          kill.push(i);
        }
      }
      if (kill.length) {
        for (const i of kill) bin[i] = 0;
        changed = true;
      }
    }
    iter++;
  }
}

type Pxl = [number, number];

interface NodeInfo {
  cx: number;
  cy: number;
  kind: 'end' | 'junc';
  pxls: Pxl[];
}

interface RawStroke {
  pts: Pxl[];
  closed: boolean;
  n1: number; // -1 表示悬空端
  n2: number;
  alive: boolean;
}

export function trace(bin: Uint8Array, W: number, H: number): { strokes: RawStroke[]; nodes: NodeInfo[] } {
  const N8: Pxl[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  const deg = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!bin[i]) continue;
      let d = 0;
      for (const [dx, dy] of N8) if (bin[i + dy * W + dx]) d++;
      deg[i] = d;
    }
  }
  const nodeId = new Int32Array(W * H).fill(-1);
  const nodes: NodeInfo[] = [];
  // 交汇区：deg>=3 的像素向外膨胀一圈（8 邻域），吸收对角处的 2x2 碎块
  const jmask = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (bin[i] && deg[i] >= 3) jmask[i] = 1;
    }
  }
  const jzone = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!bin[i]) continue;
      if (jmask[i]) {
        jzone[i] = 1;
        continue;
      }
      // 只吸收非链条像素（deg!=2），保留 deg==2 的链段不被吞并
      if (deg[i] !== 2) {
        for (const [dx, dy] of N8) {
          if (jmask[i + dy * W + dx]) {
            jzone[i] = 1;
            break;
          }
        }
      }
    }
  }
  // 端点节点（排除被交汇区吸收的像素）
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (bin[i] && deg[i] === 1 && !jzone[i]) {
        nodeId[i] = nodes.length;
        nodes.push({ cx: x, cy: y, kind: 'end', pxls: [[x, y]] });
      }
    }
  }
  const seen = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!bin[i] || !jzone[i] || seen[i]) continue;
      const cluster: Pxl[] = [];
      const q: Pxl[] = [[x, y]];
      seen[i] = 1;
      let sx = 0;
      let sy = 0;
      while (q.length) {
        const [cx, cy] = q.pop()!;
        cluster.push([cx, cy]);
        sx += cx;
        sy += cy;
        for (const [dx, dy] of N8) {
          const nx = cx + dx;
          const ny = cy + dy;
          const ni = ny * W + nx;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ni]) continue;
          if (bin[ni] && jzone[ni]) {
            seen[ni] = 1;
            q.push([nx, ny]);
          }
        }
      }
      const id = nodes.length;
      for (const [px, py] of cluster) nodeId[py * W + px] = id;
      nodes.push({ cx: sx / cluster.length, cy: sy / cluster.length, kind: 'junc', pxls: cluster });
    }
  }

  const visited = new Uint8Array(W * H);
  const fgNeighbors = (x: number, y: number): Pxl[] => {
    const out: Pxl[] = [];
    for (const [dx, dy] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && bin[ny * W + nx]) out.push([nx, ny]);
    }
    return out;
  };

  const strokes: RawStroke[] = [];
  const hasEdge = new Set<number>();
  const maxSteps = W * H;
  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni];
    const starts: { from: Pxl; to: Pxl }[] = [];
    for (const [px, py] of node.pxls) {
      for (const [nx, ny] of fgNeighbors(px, py)) {
        if (nodeId[ny * W + nx] !== ni) starts.push({ from: [px, py], to: [nx, ny] });
      }
    }
    for (const { from, to } of starts) {
      if (visited[to[1] * W + to[0]]) continue;
      const path: Pxl[] = [[node.cx, node.cy]];
      let prev: Pxl = from;
      let cur: Pxl = to;
      let endNode = -1;
      let steps = 0;
      while (steps++ < maxSteps) {
        path.push(cur);
        visited[cur[1] * W + cur[0]] = 1;
        const nid = nodeId[cur[1] * W + cur[0]];
        if (nid >= 0 && nid !== ni) {
          path.push([nodes[nid].cx, nodes[nid].cy]);
          endNode = nid;
          break;
        }
        if (nid === ni) {
          endNode = ni;
          break;
        }
        const nbs = fgNeighbors(cur[0], cur[1]).filter(
          ([nx, ny]) => !(nx === prev[0] && ny === prev[1])
        );
        const nxt = nbs.find(([nx, ny]) => !visited[ny * W + nx]);
        if (!nxt) break;
        prev = cur;
        cur = nxt;
      }
      if (path.length >= 2) {
        strokes.push({ pts: path, closed: false, n1: ni, n2: endNode, alive: true });
        hasEdge.add(ni);
        if (endNode >= 0) hasEdge.add(endNode);
      }
    }
  }
  // 无节点闭环
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!bin[i] || visited[i] || nodeId[i] >= 0) continue;
      const path: Pxl[] = [[x, y]];
      visited[i] = 1;
      let prev: Pxl = [-1, -1];
      let cur: Pxl = [x, y];
      let steps = 0;
      while (steps++ < maxSteps) {
        const nbs = fgNeighbors(cur[0], cur[1]).filter(
          ([nx, ny]) => !(nx === prev[0] && ny === prev[1]) && !visited[ny * W + nx]
        );
        if (!nbs.length) break;
        prev = cur;
        cur = nbs[0];
        path.push(cur);
        visited[cur[1] * W + cur[0]] = 1;
      }
      if (path.length > 2) strokes.push({ pts: path, closed: true, n1: -1, n2: -1, alive: true });
    }
  }
  // 孤立交汇团（整个环带被吸收成一块的情况）：团内走一圈成环
  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni];
    if (node.kind !== 'junc' || hasEdge.has(ni) || node.pxls.length < 8) continue;
    const inCluster = new Set(node.pxls.map(([x, y]) => y * W + x));
    const localVisited = new Set<number>();
    const start = node.pxls[0];
    const path: Pxl[] = [start];
    localVisited.add(start[1] * W + start[0]);
    let prev: Pxl = [-1, -1];
    let cur: Pxl = start;
    let steps = 0;
    while (steps++ < maxSteps) {
      const nbs = fgNeighbors(cur[0], cur[1]).filter(
        ([nx, ny]) =>
          inCluster.has(ny * W + nx) &&
          !(nx === prev[0] && ny === prev[1]) &&
          !localVisited.has(ny * W + nx)
      );
      if (!nbs.length) break;
      prev = cur;
      cur = nbs[0];
      path.push(cur);
      localVisited.add(cur[1] * W + cur[0]);
    }
    if (path.length > 4) strokes.push({ pts: path, closed: true, n1: -1, n2: -1, alive: true });
  }
  return { strokes, nodes };
}

// 在交汇节点处把方向平直的边缝合成更长笔画
function mergeJunctions(strokes: RawStroke[], nodes: NodeInfo[]) {
  const otherEnd = (s: RawStroke, ni: number) => (s.n1 === ni ? s.n2 : s.n1);
  const tangentAt = (s: RawStroke, ni: number): Pxl => {
    const k = 4;
    if (s.n1 === ni) {
      const p0 = s.pts[0];
      const p1 = s.pts[Math.min(k, s.pts.length - 1)];
      const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1e-9;
      return [(p1[0] - p0[0]) / l, (p1[1] - p0[1]) / l];
    }
    const p0 = s.pts[s.pts.length - 1];
    const p1 = s.pts[Math.max(s.pts.length - 1 - k, 0)];
    const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1e-9;
    return [(p1[0] - p0[0]) / l, (p1[1] - p0[1]) / l];
  };
  // 使 pts 以节点 ni 结尾
  const endWith = (s: RawStroke, ni: number): Pxl[] => (s.n2 === ni ? s.pts : [...s.pts].reverse());
  // 使 pts 以节点 ni 开头
  const startWith = (s: RawStroke, ni: number): Pxl[] => (s.n1 === ni ? s.pts : [...s.pts].reverse());

  for (let round = 0; round < 12; round++) {
    let mergedAny = false;
    for (let ni = 0; ni < nodes.length; ni++) {
      if (nodes[ni].kind !== 'junc') continue;
      const inc = strokes.filter((s) => s.alive && !s.closed && (s.n1 === ni || s.n2 === ni));
      if (inc.length < 2) continue;
      const tans = inc.map((s) => tangentAt(s, ni));
      const pairs: [number, number, number][] = [];
      for (let a = 0; a < inc.length; a++)
        for (let b = a + 1; b < inc.length; b++)
          pairs.push([a, b, tans[a][0] * tans[b][0] + tans[a][1] * tans[b][1]]);
      // 外向切向越相反（dot 越小）越平直
      pairs.sort((x, y) => x[2] - y[2]);
      const used = new Set<number>();
      for (const [a, b, dot] of pairs) {
        if (dot > -0.2) break;
        if (used.has(a) || used.has(b)) continue;
        used.add(a);
        used.add(b);
        const s1 = inc[a];
        const s2 = inc[b];
        const merged: RawStroke = {
          pts: [...endWith(s1, ni), ...startWith(s2, ni).slice(1)],
          closed: false,
          n1: otherEnd(s1, ni),
          n2: otherEnd(s2, ni),
          alive: true,
        };
        s1.alive = false;
        s2.alive = false;
        strokes.push(merged);
        mergedAny = true;
      }
    }
    if (!mergedAny) break;
  }
}

function strokeLen(pts: Pxl[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++)
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return len;
}

// 扫描线偶奇填充（环境无关，无 Canvas 依赖）
function rasterize(d: string, bbox: BBox, W: number, H: number, s: number, pad: number): Uint8Array {
  const bin = new Uint8Array(W * H);
  const contours = flatten(parsePath(d), 1.5);
  const tx = (x: number) => (x - bbox.minX) * s + pad;
  const ty = (y: number) => (y - bbox.minY) * s + pad;
  const xs: number[] = [];
  for (let y = 0; y < H; y++) {
    const scanY = y + 0.5;
    xs.length = 0;
    for (const { pts } of contours) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const gy1 = ty(pts[i][1]);
        const gy2 = ty(pts[i + 1][1]);
        if ((gy1 <= scanY && gy2 > scanY) || (gy2 <= scanY && gy1 > scanY)) {
          const t = (scanY - gy1) / (gy2 - gy1);
          xs.push(tx(pts[i][0]) + t * (tx(pts[i + 1][0]) - tx(pts[i][0])));
        }
      }
    }
    if (!xs.length) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] - 0.5));
      const x1 = Math.min(W - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
      for (let x = x0; x <= x1; x++) bin[y * W + x] = 1;
    }
  }
  return bin;
}

export function skeletonize(d: string, bbox: BBox, cacheKey?: string): SkStroke[] {
  if (cacheKey) {
    const hit = skeletonCache.get(cacheKey);
    if (hit) return hit;
  }
  const pad = 4;
  const w0 = Math.max(bbox.maxX - bbox.minX, 1);
  const h0 = Math.max(bbox.maxY - bbox.minY, 1);
  const s = Math.min(320 / Math.max(w0, h0), 2.2);
  const W = Math.max(10, Math.ceil(w0 * s) + pad * 2);
  const H = Math.max(10, Math.ceil(h0 * s) + pad * 2);

  const bin = rasterize(d, bbox, W, H, s, pad);
  const dist = chamfer(bin, W, H);
  zhangSuen(bin, W, H);
  const { strokes, nodes } = trace(bin, W, H);

  const isEndNode = (ni: number) => ni < 0 || nodes[ni]?.kind === 'end';
  const prunePx = 8;
  const prune = () => {
    for (const st of strokes) {
      if (!st.alive || st.closed) continue;
      const e1 = isEndNode(st.n1);
      const e2 = isEndNode(st.n2);
      if (e1 === e2) continue;
      if (strokeLen(st.pts) < prunePx) st.alive = false;
    }
  };
  prune();
  mergeJunctions(strokes, nodes);
  prune();

  const inv = (px: number, py: number): Pt => [(px - pad) / s + bbox.minX, (py - pad) / s + bbox.minY];
  const out: SkStroke[] = [];
  for (const st of strokes) {
    if (!st.alive) continue;
    let pts = st.pts.map(([x, y]) => inv(x + 0.5, y + 0.5));
    let closed = st.closed;
    // 缝合后首尾落在同一节点的边是闭环（圆环）；短自环是残桩
    if (!closed && st.n1 === st.n2 && st.n1 >= 0) {
      if (strokeLen(pts) < prunePx) continue;
      closed = true;
    }
    // 闭环首尾重复点全部去掉，否则 RDP 弦长为 0 会塌缩
    if (closed) {
      while (
        pts.length > 1 &&
        Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-4
      )
        pts = pts.slice(0, -1);
    }
    pts = rdp(pts, 1.5);
    if (pts.length < 2) continue;
    const cmds = catmullRom(pts, closed);
    let wSum = 0;
    let wN = 0;
    for (const [x, y] of st.pts) {
      wSum += dist[y * W + x];
      wN++;
    }
    const width = Math.max((wSum / Math.max(wN, 1)) * (2 / s), 1.5);
    const len = strokeLen(pts);
    const dirAt = (a: Pt, b: Pt): Pt => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
      return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    };
    out.push({
      cmds,
      d: serialize(cmds),
      width,
      start: pts[0],
      end: pts[pts.length - 1],
      startDir: dirAt(pts[0], pts[Math.min(1, pts.length - 1)]),
      endDir: dirAt(pts[Math.max(pts.length - 2, 0)], pts[pts.length - 1]),
      len,
      closed, // 用升级后的判定：缝合首尾同节点的闭环在此为 true
    });
  }
  if (cacheKey) skeletonCache.set(cacheKey, out);
  return out;
}
