// 印章：方/圆/椭圆外框 + 汉字网格排布 / 西文弧形排布 + 朱文白文 + 做旧
import { cmdsBBox, parsePath, serialize, transformCmds, type BBox, type Cmd } from '../path';
import { lerp, type EngineRun, type SceneEl } from './types';

const HALF = 330;

function roundRectD(x: number, y: number, w: number, h: number, r: number): string {
  return [
    `M${x + r},${y}`,
    `L${x + w - r},${y}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `L${x + w},${y + h - r}`,
    `Q${x + w},${y + h} ${x + w - r},${y + h}`,
    `L${x + r},${y + h}`,
    `Q${x},${y + h} ${x},${y + h - r}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    'Z',
  ].join('');
}
function circleD(cx: number, cy: number, r: number): string {
  return `M${cx - r},${cy}A${r},${r} 0 1,0 ${cx + r},${cy}A${r},${r} 0 1,0 ${cx - r},${cy}Z`;
}
function ellipseD(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx},${cy}A${rx},${ry} 0 1,0 ${cx + rx},${cy}A${rx},${ry} 0 1,0 ${cx - rx},${cy}Z`;
}

interface Placed {
  d: string;
  group: number;
}

export const sealRun: EngineRun = ({ layout, params, paint, seal }) => {
  const { glyphs } = layout;
  const borderW = lerp(14, 26, params.weight);
  const innerHalf = HALF - borderW - 30;
  const ellipseRX = HALF * 1.22;
  const ellipseRY = HALF * 0.82;
  const placed: Placed[] = [];

  const localBBox = (i: number): BBox => cmdsBBox(parsePath(glyphs[i].d));
  const hanCount = glyphs.filter((g) => g.cls === 'han').length;
  const gridMode = glyphs.length > 0 && hanCount * 2 >= glyphs.length;

  if (gridMode) {
    // 经典印章顺序：列从右到左，列内从上到下
    const n = glyphs.length;
    const cols = n === 1 ? 1 : n <= 4 ? 2 : n <= 6 ? 3 : Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const cw = (innerHalf * 2) / cols;
    const ch = (innerHalf * 2) / rows;
    for (let i = 0; i < n; i++) {
      const g = glyphs[i];
      const bb = localBBox(i);
      const bw = Math.max(bb.maxX - bb.minX, 1);
      const bh = Math.max(bb.maxY - bb.minY, 1);
      const col = cols - 1 - Math.floor(i / rows);
      const row = i % rows;
      const cx = -innerHalf + (col + 0.5) * cw;
      const cy = -innerHalf + (row + 0.5) * ch;
      const k = Math.min((cw * 0.84) / bw, (ch * 0.84) / bh);
      const bcx = (bb.minX + bb.maxX) / 2;
      const bcy = (bb.minY + bb.maxY) / 2;
      const cmds = transformCmds(parsePath(g.d), [k, 0, 0, k, cx - bcx * k, cy - bcy * k]);
      placed.push({ d: serialize(cmds), group: i });
    }
  } else if (seal.shape === 'square') {
    // 方框内西文单行
    const bb = layout.bbox;
    const bw = Math.max(bb.maxX - bb.minX, 1);
    const bh = Math.max(bb.maxY - bb.minY, 1);
    const k = Math.min((innerHalf * 1.8) / bw, (innerHalf * 0.9) / bh);
    const bcx = (bb.minX + bb.maxX) / 2;
    const bcy = (bb.minY + bb.maxY) / 2;
    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i];
      const cmds = transformCmds(parsePath(g.d), [
        k,
        0,
        0,
        k,
        (g.x - bcx) * k,
        (g.y - bcy) * k,
      ]);
      placed.push({ d: serialize(cmds), group: i });
    }
  } else {
    // 圆/椭圆内西文弧形排布
    const RX = seal.shape === 'ellipse' ? ellipseRX - borderW - 34 : innerHalf;
    const RY = seal.shape === 'ellipse' ? ellipseRY - borderW - 34 : innerHalf;
    const Rm = (RX + RY) / 2;
    const totalW = Math.max(layout.width, 1);
    const totalAng = Math.min(totalW / Rm, Math.PI * 1.05);
    const bb0 = localBBox(0);
    const capH = Math.max(bb0.maxY - bb0.minY, 1);
    const k = Math.min(Math.max((Rm * 0.52) / capH, 0.25), 1.7);
    let cum = 0;
    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i];
      const mid = cum + g.adv / 2;
      cum += g.adv;
      const theta = Math.PI - totalAng / 2 + (mid / totalW) * totalAng;
      const px = RX * Math.cos(theta);
      const py = RY * Math.sin(theta);
      const phi = Math.atan2(RY * Math.cos(theta), -RX * Math.sin(theta));
      const bb = localBBox(i);
      const bcx = (bb.minX + bb.maxX) / 2;
      const bcy = (bb.minY + bb.maxY) / 2;
      const cos = Math.cos(phi);
      const sin = Math.sin(phi);
      // p → ((p-bc)*k) 旋转 φ 后平移到 (px,py)
      const a = k * cos;
      const b = k * sin;
      const c = -k * sin;
      const d = k * cos;
      const e = px - (bcx * k) * cos + (bcy * k) * sin;
      const f = py - (bcx * k) * sin - (bcy * k) * cos;
      const cmds = transformCmds(parsePath(g.d), [a, b, c, d, e, f]);
      placed.push({ d: serialize(cmds), group: i });
    }
  }

  // 外框
  const frames: SceneEl[] = [];
  const thin = lerp(3, 7, params.weight);
  if (seal.shape === 'square') {
    const o = HALF - borderW / 2;
    frames.push({ d: roundRectD(-o, -o, o * 2, o * 2, 26), stroke: paint, sw: borderW, group: 10000 });
    const i2 = innerHalf + 14;
    frames.push({ d: roundRectD(-i2, -i2, i2 * 2, i2 * 2, 10), stroke: paint, sw: thin, group: 10001 });
  } else if (seal.shape === 'circle') {
    frames.push({ d: circleD(0, 0, HALF - borderW / 2), stroke: paint, sw: borderW, group: 10000 });
    frames.push({ d: circleD(0, 0, innerHalf + 14), stroke: paint, sw: thin, group: 10001 });
  } else {
    frames.push({
      d: ellipseD(0, 0, ellipseRX - borderW / 2, ellipseRY - borderW / 2),
      stroke: paint,
      sw: borderW,
      group: 10000,
    });
    frames.push({
      d: ellipseD(0, 0, ellipseRX - borderW - 26, ellipseRY - borderW - 26),
      stroke: paint,
      sw: thin,
      group: 10001,
    });
  }

  const els: SceneEl[] = [];
  let defs = '';
  const vbHalfX = (seal.shape === 'ellipse' ? ellipseRX : HALF) + 46;
  const vbHalfY = (seal.shape === 'ellipse' ? ellipseRY : HALF) + 46;

  if (seal.mode === 'bai') {
    // 白文：底色填充，字形挖空
    defs =
      `<mask id="seal-mask" maskUnits="userSpaceOnUse" x="${-vbHalfX}" y="${-vbHalfY}" width="${vbHalfX * 2}" height="${vbHalfY * 2}">` +
      `<rect x="${-vbHalfX}" y="${-vbHalfY}" width="${vbHalfX * 2}" height="${vbHalfY * 2}" fill="#fff"/>` +
      placed.map((p) => `<path d="${p.d}" fill="#000"/>`).join('') +
      `</mask>`;
    const bgD =
      seal.shape === 'square'
        ? roundRectD(-HALF, -HALF, HALF * 2, HALF * 2, 30)
        : seal.shape === 'circle'
          ? circleD(0, 0, HALF)
          : ellipseD(0, 0, ellipseRX, ellipseRY);
    els.push({ d: bgD, fill: paint, mask: 'url(#seal-mask)', group: -1 });
    for (const p of placed) els.push({ d: p.d, fill: '#000', group: p.group, ghost: true });
    els.push(...frames);
  } else {
    for (const p of placed) els.push({ d: p.d, fill: paint, group: p.group });
    els.push(...frames);
  }

  if (seal.distress) {
    defs +=
      `<filter id="seal-rough" x="-8%" y="-8%" width="116%" height="116%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="11" result="n"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G"/>` +
      `</filter>`;
  }

  return {
    els,
    viewBox: `${-vbHalfX} ${-vbHalfY} ${vbHalfX * 2} ${vbHalfY * 2}`,
    defs: defs || undefined,
    filter: seal.distress ? 'url(#seal-rough)' : undefined,
    animOrder: els.map((_, i) => i).filter((i) => !!els[i].stroke),
  };
};
