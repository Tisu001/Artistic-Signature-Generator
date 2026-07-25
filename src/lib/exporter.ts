// 导出：SVG / 高清 PNG / SMIL 动画 / WebM 视频
import type { Scene } from './engines/index';
import { cmdsBBox, cmdsLength, parsePath, type BBox } from './path';
import { GRADIENT_PRESETS, type ColorSpec } from './paint';
import { mulberry32 } from './rng';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function cleanClone(svgEl: SVGSVGElement): SVGSVGElement {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const vb = svgEl.viewBox.baseVal;
  clone.setAttribute('width', String(Math.round(vb.width)));
  clone.setAttribute('height', String(Math.round(vb.height)));
  clone.querySelectorAll('path').forEach((p) => {
    p.style.strokeDasharray = '';
    p.style.strokeDashoffset = '';
    p.style.opacity = '';
    p.removeAttribute('pathLength');
  });
  clone.removeAttribute('class');
  return clone;
}

export function exportSVG(svgEl: SVGSVGElement, name: string) {
  const str = new XMLSerializer().serializeToString(cleanClone(svgEl));
  downloadBlob(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }), `${name}.svg`);
}

export async function exportPNG(svgEl: SVGSVGElement, name: string, scale: number) {
  const str = new XMLSerializer().serializeToString(cleanClone(svgEl));
  const url = URL.createObjectURL(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('SVG 栅格化失败'));
      img.src = url;
    });
    const vb = svgEl.viewBox.baseVal;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vb.width * scale);
    canvas.height = Math.round(vb.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (blob) downloadBlob(blob, `${name}@${scale}x.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- 动画时间轴（SMIL 与 WebM 共用） ----------
interface Timeline {
  strokes: { idx: number; len: number; begin: number; dur: number }[];
  fills: { idx: number; begin: number; dur: number; target: number }[];
  total: number; // 秒
}

function buildTimeline(scene: Scene): Timeline {
  const strokeIdx = scene.animOrder.filter((i) => {
    const e = scene.els[i];
    return e && e.stroke && !e.ghost;
  });
  const lens = strokeIdx.map((i) => Math.max(cmdsLength(parsePath(scene.els[i].d)), 1));
  const totalLen = lens.reduce((a, b) => a + b, 0);
  const strokeT = strokeIdx.length ? Math.min(Math.max(totalLen / 900, 1.2), 7) : 0;
  const strokes: Timeline['strokes'] = [];
  let acc = 0;
  strokeIdx.forEach((idx, k) => {
    const dur = strokeT * (lens[k] / totalLen);
    strokes.push({ idx, len: lens[k], begin: acc, dur });
    acc += dur;
  });

  const fillIdx = scene.els
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.fill && !e.ghost)
    .map(({ i }) => i);
  const groups = [...new Set(fillIdx.map((i) => scene.els[i].group))].sort((a, b) => a - b);
  const fadeStart = strokeIdx.length ? acc * 0.92 : 0;
  const fadeSpan = strokeIdx.length
    ? Math.max(strokeT * 0.08, 0.45)
    : Math.min(Math.max(groups.length * 0.32, 0.8), 4);
  const fills: Timeline['fills'] = [];
  groups.forEach((g, gi) => {
    const begin = fadeStart + (fadeSpan * gi) / Math.max(groups.length, 1);
    const dur = Math.max(fadeSpan / Math.max(groups.length, 1), 0.25);
    for (const i of fillIdx) {
      if (scene.els[i].group === g)
        fills.push({ idx: i, begin, dur, target: scene.els[i].opacity ?? 1 });
    }
  });
  return { strokes, fills, total: acc + fadeSpan + 0.25 };
}

// XML 属性值转义：所有拼入 SVG 字符串的值都必须经过这里
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const num = (n: unknown, dflt: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : dflt;

export function exportSMIL(scene: Scene, defsMarkup: string, name: string) {
  const tl = buildTimeline(scene);
  const parts: string[] = [];
  scene.els.forEach((e, i) => {
    if (e.ghost) return;
    const base =
      `d="${esc(e.d)}" fill="${esc(e.fill ?? 'none')}"` +
      (e.stroke
        ? ` stroke="${esc(e.stroke)}" stroke-width="${num(e.sw, 1)}" stroke-linecap="${esc(e.cap ?? 'round')}" stroke-linejoin="${esc(e.join ?? 'round')}"`
        : '') +
      (e.rule ? ` fill-rule="${esc(e.rule)}"` : '') +
      (e.mask ? ` mask="${esc(e.mask)}"` : '');
    const st = tl.strokes.find((s) => s.idx === i);
    if (st) {
      parts.push(
        `<path ${base} pathLength="100" stroke-dasharray="100" stroke-dashoffset="100">` +
          `<animate attributeName="stroke-dashoffset" from="100" to="0" begin="${st.begin.toFixed(2)}s" dur="${st.dur.toFixed(2)}s" fill="freeze" calcMode="spline" keySplines="0.4 0 0.3 1" keyTimes="0;1" values="100;0"/>` +
          `</path>`
      );
      return;
    }
    const fl = tl.fills.find((f) => f.idx === i);
    if (fl) {
      parts.push(
        `<path ${base} opacity="0">` +
          `<animate attributeName="opacity" from="0" to="${num(fl.target, 1)}" begin="${fl.begin.toFixed(2)}s" dur="${fl.dur.toFixed(2)}s" fill="freeze"/>` +
          `</path>`
      );
      return;
    }
    parts.push(`<path ${base} opacity="${num(e.opacity, 1)}"/>`);
  });
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${esc(scene.viewBox)}">` +
    `<defs>${defsMarkup}${scene.defs ?? ''}</defs>` +
    (scene.filter ? `<g filter="${esc(scene.filter)}">${parts.join('')}</g>` : parts.join('')) +
    `</svg>`;
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${name}-动画.svg`);
}

// ---------- WebM：Canvas 原生实现渐变 / 白文挖空 / 做旧（不依赖 SVG 滤镜与 url() 画笔） ----------
export async function exportWebM(
  scene: Scene,
  color: ColorSpec,
  name: string,
  onError: (msg: string) => void
) {
  const vb = scene.viewBox.split(/\s+/).map(Number);
  const scale = 2;
  const W = Math.round(vb[2] * scale);
  const H = Math.round(vb[3] * scale);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  // 墨水层：所有笔迹先画到离屏画布，挖空与做旧只作用于墨水，不破坏白底
  const ink = document.createElement('canvas');
  ink.width = W;
  ink.height = H;
  const ictx = ink.getContext('2d')!;
  const tl = buildTimeline(scene);

  // 渐变 → CanvasGradient；按元素自身 bbox 取对角线，对齐 SVG objectBoundingBox 语义
  const grad = GRADIENT_PRESETS.find((g) => g.key === color.value) ?? GRADIENT_PRESETS[0];
  const bboxOf = (d: string): BBox | null => {
    try {
      return cmdsBBox(parsePath(d));
    } catch {
      return null;
    }
  };
  const paintFor = (css: string | undefined, bbox: BBox | null): string | CanvasGradient => {
    if (!css) return '#000000';
    if (!css.startsWith('url(')) return css;
    if (!bbox || bbox.maxX - bbox.minX < 1e-3) return grad.stops[0][1];
    const g = ictx.createLinearGradient(bbox.minX, bbox.minY, bbox.maxX, bbox.maxY);
    for (const [o, c] of grad.stops) g.addColorStop(o, c);
    return g;
  };

  const strokeItems = tl.strokes.map((s) => {
    const st = scene.els[s.idx];
    return { ...s, path: new Path2D(st.d), style: st, paint: paintFor(st.stroke, bboxOf(st.d)) };
  });
  const fillItems = tl.fills.map((f) => {
    const st = scene.els[f.idx];
    return { ...f, path: new Path2D(st.d), style: st, paint: paintFor(st.fill, bboxOf(st.d)), masked: !!st.mask };
  });
  const ghosts = scene.els.filter((e) => e.ghost).map((e) => new Path2D(e.d));
  const maskedBg = fillItems.find((f) => f.masked) ?? null; // 白文印章底色
  const plainFills = fillItems.filter((f) => !f.masked);

  // 做旧质感：feTurbulence 无法用于 Canvas，用确定性块状噪声对墨水层做侵蚀近似
  let noise: HTMLCanvasElement | null = null;
  if (scene.filter) {
    const nw = Math.max(1, W >> 1);
    const nh = Math.max(1, H >> 1);
    noise = document.createElement('canvas');
    noise.width = nw;
    noise.height = nh;
    const nctx = noise.getContext('2d')!;
    const img = nctx.createImageData(nw, nh);
    const rng = mulberry32(0x9e3779b9);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = rng() < 0.3 ? 255 : 0;
    }
    nctx.putImageData(img, 0, 0);
  }

  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (ev) => {
    if (ev.data.size) chunks.push(ev.data);
  };
  const done = new Promise<void>((res) => {
    rec.onstop = () => res();
  });
  rec.start();
  const t0 = performance.now();

  const draw = () => {
    const el = (performance.now() - t0) / 1000;
    // 1) 墨水层
    ictx.setTransform(scale, 0, 0, scale, -vb[0] * scale, -vb[1] * scale);
    ictx.clearRect(vb[0], vb[1], vb[2], vb[3]);
    // 白文印章：先铺底色，再用 ghost 字形挖空
    if (maskedBg) {
      const p = Math.min(Math.max((el - maskedBg.begin) / maskedBg.dur, 0), 1);
      if (p > 0) {
        ictx.globalAlpha = p * maskedBg.target;
        ictx.fillStyle = maskedBg.paint;
        ictx.fill(maskedBg.path);
        ictx.globalAlpha = 1;
        ictx.save();
        ictx.globalCompositeOperation = 'destination-out';
        for (const g of ghosts) ictx.fill(g);
        ictx.restore();
      }
    }
    // 填充淡入
    for (const f of plainFills) {
      const p = Math.min(Math.max((el - f.begin) / f.dur, 0), 1);
      if (p <= 0) continue;
      ictx.globalAlpha = p * f.target;
      ictx.fillStyle = f.paint;
      ictx.fill(f.path);
    }
    ictx.globalAlpha = 1;
    // 描边书写
    for (const s of strokeItems) {
      const p = Math.min(Math.max((el - s.begin) / s.dur, 0), 1);
      if (p <= 0) continue;
      ictx.strokeStyle = s.paint;
      ictx.lineWidth = num(s.style.sw, 1);
      ictx.lineCap = 'round';
      ictx.lineJoin = 'round';
      ictx.globalAlpha = num(s.style.opacity, 1);
      if (p >= 1) {
        ictx.setLineDash([]);
        ictx.stroke(s.path);
      } else {
        ictx.setLineDash([s.len * p, s.len * 1.2]);
        ictx.lineDashOffset = 0;
        ictx.stroke(s.path);
      }
    }
    ictx.globalAlpha = 1;
    ictx.setLineDash([]);
    // 2) 做旧噪声侵蚀（仅墨水层）
    if (noise) {
      ictx.save();
      ictx.setTransform(1, 0, 0, 1, 0, 0);
      ictx.globalCompositeOperation = 'destination-out';
      ictx.globalAlpha = 0.55;
      ictx.imageSmoothingEnabled = false;
      ictx.drawImage(noise, 0, 0, W, H);
      ictx.restore();
    }
    // 3) 合成：白底 + 墨水（WebM 为不透明的白底视频，便于直接分享）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(ink, 0, 0);
    if (el < tl.total) {
      requestAnimationFrame(draw);
    } else {
      rec.stop();
    }
  };
  requestAnimationFrame(draw);
  await done;
  const blob = new Blob(chunks, { type: 'video/webm' });
  if (blob.size < 1024) {
    onError('视频录制失败（浏览器不支持或时长过短）');
    return;
  }
  downloadBlob(blob, `${name}-书写动画.webm`);
}
