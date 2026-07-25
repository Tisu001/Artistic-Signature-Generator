// 花体飘逸：正弦波扰动 + 起笔横扫 + 收尾藤蔓卷曲 + 下划弧线
import {
  bboxOfPts,
  mapCmds,
  mergeBBox,
  parsePath,
  serialize,
  spiralPts,
  taperedStroke,
  transformCmds,
  type BBox,
  type Pt,
} from '../path';
import { lerp, type EngineRun, type SceneEl } from './types';

function cubicPts(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return pts;
}

export const flourishRun: EngineRun = ({ layout, params, paint }) => {
  const { glyphs, bbox } = layout;
  const els: SceneEl[] = [];
  const F = params.flourish;
  const A = F * 26;
  const lambda = Math.max(layout.width * 0.55, layout.base * 2.2);
  const phase = -Math.PI * 0.35;
  const wave = (gx: number) => A * Math.sin((2 * Math.PI * gx) / lambda + phase);

  for (let gi = 0; gi < glyphs.length; gi++) {
    const g = glyphs[gi];
    const cmds = transformCmds(parsePath(g.d), [1, 0, 0, 1, g.x, g.y]);
    const warped = mapCmds(cmds, (x, y) => [x, y + wave(x)]);
    els.push({ d: serialize(warped), fill: paint, group: gi });
  }

  const warpedBBox: BBox = {
    minX: bbox.minX,
    minY: bbox.minY - A,
    maxX: bbox.maxX,
    maxY: bbox.maxY + A,
  };
  let union = warpedBBox;
  const wMax = lerp(4, 12, params.weight) + F * 3;

  // 起笔横扫（第一个字形左侧甩入）
  if (glyphs.length && F > 0.04) {
    const g0 = glyphs[0].bbox;
    const P: Pt = [g0.minX + 4, lerp(g0.minY, g0.maxY, 0.62)];
    P[1] += wave(P[0]);
    const E = lerp(26, 110, F);
    const pts = cubicPts(
      [P[0] - E, P[1] + E * 0.5],
      [P[0] - E * 0.72, P[1] + E * 0.42],
      [P[0] - E * 0.18, P[1] + E * 0.06],
      P,
      26
    );
    els.push({
      d: serialize(taperedStroke(pts, (t) => wMax * Math.pow(Math.sin((Math.PI / 2) * t), 0.6))),
      fill: paint,
      opacity: 0.95,
      group: -2,
    });
    union = mergeBBox(union, bboxOfPts(pts));
  }

  // 收尾藤蔓卷曲（最后一个字形右侧螺旋）
  if (glyphs.length && F > 0.04) {
    const gl = glyphs[glyphs.length - 1].bbox;
    const Q: Pt = [gl.maxX - 2, lerp(gl.minY, gl.maxY, 0.4)];
    Q[1] += wave(Q[0]);
    const rOut = lerp(12, 52, F);
    const pts = spiralPts(Q, rOut, 2.5, 2.15, -Math.PI / 2, 1, 90);
    els.push({
      d: serialize(taperedStroke(pts, (t) => Math.max(wMax * (1 - t) * 0.9, 0.8))),
      fill: paint,
      opacity: 0.95,
      group: glyphs.length,
    });
    union = mergeBBox(union, bboxOfPts(pts));
  }

  // 下划弧线（经典签名收尾）
  if (glyphs.length > 1) {
    const U = lerp(16, 80, F);
    const sag = lerp(8, 34, F);
    const yU = warpedBBox.maxY + lerp(16, 30, F);
    const x0 = warpedBBox.minX - U * 0.3;
    const x1 = warpedBBox.maxX + U;
    const pts = cubicPts(
      [x0, yU - sag * 0.3],
      [lerp(x0, x1, 0.3), yU + sag],
      [lerp(x0, x1, 0.78), yU + sag * 0.55],
      [x1, yU - sag * 0.5],
      44
    );
    els.push({
      d: serialize(taperedStroke(pts, (t) => wMax * Math.pow(Math.sin(Math.PI * t), 0.75))),
      fill: paint,
      opacity: 0.9,
      group: -1,
    });
    if (F > 0.45) {
      const echo = pts.map(([x, y]) => [x + 6, y + 13] as Pt);
      els.push({
        d: serialize(taperedStroke(echo, (t) => wMax * 0.32 * Math.pow(Math.sin(Math.PI * t), 0.75))),
        fill: paint,
        opacity: 0.32,
        group: -1,
      });
      union = mergeBBox(union, bboxOfPts(echo));
    }
    union = mergeBBox(union, bboxOfPts(pts));
  }

  const pad = 26;
  return {
    els,
    viewBox: `${union.minX - pad} ${union.minY - pad} ${union.maxX - union.minX + pad * 2} ${
      union.maxY - union.minY + pad * 2
    }`,
    animOrder: els.map((_, i) => i),
  };
};
