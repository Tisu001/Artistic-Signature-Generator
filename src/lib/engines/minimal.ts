// 极简几何：轮廓抽直为折线 + 角度吸附 + 圆角描边
import { flatten, parsePath, rdp, serialize, transformCmds, type Cmd, type Pt } from '../path';
import { lerp, type EngineRun, type SceneEl } from './types';

function angleSnap(pts: Pt[], closed: boolean): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]];
  let cur = pts[0];
  const segs = closed ? pts.length - 1 : pts.length - 1;
  for (let i = 0; i < segs; i++) {
    const nxt = pts[i + 1];
    const dx = nxt[0] - cur[0];
    const dy = nxt[1] - cur[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const ang = Math.atan2(dy, dx);
    const snapped = (Math.round(ang / (Math.PI / 4)) * Math.PI) / 4;
    cur = [cur[0] + Math.cos(snapped) * len, cur[1] + Math.sin(snapped) * len];
    out.push(cur);
  }
  return out;
}

export const minimalRun: EngineRun = ({ layout, params, paint }) => {
  const { glyphs, bbox } = layout;
  const tol = lerp(1.4, 10, params.flourish);
  const sw = lerp(2.5, 14, params.weight);
  const snap = params.flourish > 0.3;
  const els: SceneEl[] = [];
  const animOrder: number[] = [];

  for (let gi = 0; gi < glyphs.length; gi++) {
    const g = glyphs[gi];
    const cmds = transformCmds(parsePath(g.d), [1, 0, 0, 1, g.x, g.y]);
    const contours = flatten(cmds, 2.2);
    for (const { pts, closed } of contours) {
      // 闭合轮廓首尾可能重复多次（曲线回起点 + Z 再补一次），全部去掉再做 RDP
      let body = pts;
      while (
        closed &&
        body.length > 1 &&
        Math.hypot(body[0][0] - body[body.length - 1][0], body[0][1] - body[body.length - 1][1]) < 1e-4
      )
        body = body.slice(0, -1);
      let simp = rdp(body, tol);
      if (simp.length < 2) continue;
      if (snap) simp = angleSnap(simp, closed);
      const out: Cmd[] = [{ t: 'M', v: simp[0] }];
      for (let i = 1; i < simp.length; i++) out.push({ t: 'L', v: simp[i] });
      if (closed) out.push({ t: 'Z', v: [] });
      els.push({
        d: serialize(out),
        stroke: paint,
        sw,
        cap: 'round',
        join: 'round',
        group: gi,
      });
      animOrder.push(els.length - 1);
    }
  }

  const pad = 26;
  return {
    els,
    viewBox: `${bbox.minX - pad} ${bbox.minY - pad} ${bbox.maxX - bbox.minX + pad * 2} ${
      bbox.maxY - bbox.minY + pad * 2
    }`,
    animOrder,
  };
};
