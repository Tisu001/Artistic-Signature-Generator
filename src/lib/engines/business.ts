// 商务连笔：骨架中心线 + 均匀描边 + 相邻字母平滑桥接 + 整体右倾
import { cmdsBBox, mapCmds, parsePath, serialize, type Cmd, type Pt } from '../path';
import { skeletonize, type SkStroke } from '../skeleton';
import { lerp, type EngineRun, type SceneEl } from './types';

const SLANT = 0.16; // 右倾斜率

function transformStroke(st: SkStroke, g: { x: number; y: number }): SkStroke {
  const fn = (x: number, y: number): Pt => [x + g.x - (y + g.y) * SLANT, y + g.y];
  const dirFn = (d: Pt): Pt => {
    const v: Pt = [d[0] - d[1] * SLANT, d[1]];
    const l = Math.hypot(v[0], v[1]) || 1e-9;
    return [v[0] / l, v[1] / l];
  };
  const cmds = mapCmds(st.cmds, fn);
  return {
    ...st,
    cmds,
    d: serialize(cmds),
    start: fn(...st.start),
    end: fn(...st.end),
    startDir: dirFn(st.startDir),
    endDir: dirFn(st.endDir),
  };
}

export const businessRun: EngineRun = ({ layout, params, paint }) => {
  const { glyphs, bbox, base } = layout;
  const sw = lerp(3.5, 20, params.weight);
  const els: SceneEl[] = [];
  const animOrder: number[] = [];

  interface End {
    p: Pt;
    dir: Pt;
    isEnd: boolean;
  }
  const perGlyph: { ends: End[]; starts: End[] }[] = [];

  for (let gi = 0; gi < glyphs.length; gi++) {
    const g = glyphs[gi];
    const lbbox = cmdsBBox(parsePath(g.d));
    const sk = skeletonize(g.d, lbbox, `${g.fontKey}:${g.gid}`);
    const strokes = sk
      .map((st) => transformStroke(st, g))
      .sort((a, b) => a.start[0] - b.start[0]);
    const ends: End[] = [];
    const starts: End[] = [];
    for (const st of strokes) {
      if (st.len < base * 0.04) continue; // 跳过碎屑
      // 闭环（o、0 等）不参与桥接端点，但必须渲染
      if (!st.closed) {
        ends.push({ p: st.end, dir: st.endDir, isEnd: true });
        starts.push({ p: st.start, dir: st.startDir, isEnd: false });
      }
      els.push({
        d: st.d,
        stroke: paint,
        sw,
        cap: 'round',
        join: 'round',
        group: gi,
      });
      animOrder.push(els.length - 1);
    }
    perGlyph.push({ ends, starts });
  }

  // 相邻拉丁字母桥接
  const maxDX = base * (0.45 + params.tightness * 0.65);
  const k = 0.35 + params.tightness * 0.5;
  for (let i = 0; i + 1 < glyphs.length; i++) {
    if (glyphs[i].cls !== 'latn' || glyphs[i + 1].cls !== 'latn') continue;
    const A = perGlyph[i];
    const B = perGlyph[i + 1];
    let best: { a: End; b: End; d: number } | null = null;
    for (const a of A.ends) {
      for (const b of B.starts) {
        const dx = b.p[0] - a.p[0];
        if (dx < -base * 0.15 || dx > maxDX) continue;
        const d = Math.hypot(dx, b.p[1] - a.p[1]);
        if (d > base * 0.85) continue;
        if (!best || d < best.d) best = { a, b, d };
      }
    }
    if (best) {
      const { a, b, d } = best;
      const c1: Pt = [a.p[0] + a.dir[0] * d * k, a.p[1] + a.dir[1] * d * k];
      const c2: Pt = [b.p[0] - b.dir[0] * d * k, b.p[1] - b.dir[1] * d * k];
      const cmds: Cmd[] = [
        { t: 'M', v: a.p },
        { t: 'C', v: [...c1, ...c2, ...b.p] },
      ];
      els.push({
        d: serialize(cmds),
        stroke: paint,
        sw: sw * 0.92,
        cap: 'round',
        join: 'round',
        opacity: 0.96,
        group: i,
      });
      animOrder.push(els.length - 1);
    }
  }

  const minX = bbox.minX - bbox.maxY * SLANT;
  const maxX = bbox.maxX - bbox.minY * SLANT;
  const pad = 34;
  return {
    els,
    viewBox: `${minX - pad} ${bbox.minY - pad} ${maxX - minX + pad * 2} ${
      bbox.maxY - bbox.minY + pad * 2
    }`,
    animOrder,
  };
};
