// 涂鸦手绘：随机抖动 + 多重描边模拟手抖 + 微旋转
import { mapCmds, parsePath, serialize, transformCmds, type Cmd } from '../path';
import { mulberry32 } from '../rng';
import { lerp, type EngineRun, type SceneEl } from './types';

export const doodleRun: EngineRun = ({ layout, params, paint, seed }) => {
  const { glyphs, bbox } = layout;
  const els: SceneEl[] = [];
  const rng = mulberry32(seed);
  const amp = 1.5 + params.flourish * 5.5;
  const sw = 1 + params.weight * 3;

  for (let gi = 0; gi < glyphs.length; gi++) {
    const g = glyphs[gi];
    const base: Cmd[] = transformCmds(parsePath(g.d), [1, 0, 0, 1, g.x, g.y]);
    const cx = (g.bbox.minX + g.bbox.maxX) / 2;
    const cy = (g.bbox.minY + g.bbox.maxY) / 2;
    const rot = (rng() - 0.5) * params.flourish * 0.1;
    const bounce = (rng() - 0.5) * amp * 0.8;
    const cosr = Math.cos(rot);
    const sinr = Math.sin(rot);
    const place = (jitter: number) =>
      mapCmds(base, (x, y) => {
        const jx = x + (rng() - 0.5) * 2 * jitter;
        const jy = y + (rng() - 0.5) * 2 * jitter + bounce;
        const dx = jx - cx;
        const dy = jy - cy;
        return [cx + dx * cosr - dy * sinr, cy + dx * sinr + dy * cosr];
      });
    els.push({ d: serialize(place(amp)), fill: paint, opacity: 0.92, group: gi });
    els.push({
      d: serialize(place(amp * 1.2)),
      stroke: paint,
      sw,
      opacity: 0.45,
      cap: 'round',
      join: 'round',
      group: gi,
    });
    els.push({
      d: serialize(place(amp * 1.5)),
      stroke: paint,
      sw: sw * 0.8,
      opacity: 0.22,
      cap: 'round',
      join: 'round',
      group: gi,
    });
  }

  const pad = amp * 2 + 14;
  return {
    els,
    viewBox: `${bbox.minX - pad} ${bbox.minY - pad} ${bbox.maxX - bbox.minX + pad * 2} ${
      bbox.maxY - bbox.minY + pad * 2
    }`,
    animOrder: els.map((_, i) => i).filter((i) => !!els[i].stroke),
  };
};
