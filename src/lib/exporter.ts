// 导出：SVG / 高清 PNG / SMIL 动画 / WebM 视频
import type { Scene } from './engines/index';
import { cmdsLength, parsePath } from './path';

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

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function exportSMIL(scene: Scene, defsMarkup: string, name: string) {
  const tl = buildTimeline(scene);
  const parts: string[] = [];
  scene.els.forEach((e, i) => {
    if (e.ghost) return;
    const base =
      `d="${esc(e.d)}" fill="${e.fill ?? 'none'}"` +
      (e.stroke ? ` stroke="${e.stroke}" stroke-width="${e.sw ?? 1}" stroke-linecap="${e.cap ?? 'round'}" stroke-linejoin="${e.join ?? 'round'}"` : '') +
      (e.rule ? ` fill-rule="${e.rule}"` : '') +
      (e.mask ? ` mask="${e.mask}"` : '');
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
          `<animate attributeName="opacity" from="0" to="${fl.target}" begin="${fl.begin.toFixed(2)}s" dur="${fl.dur.toFixed(2)}s" fill="freeze"/>` +
          `</path>`
      );
      return;
    }
    parts.push(`<path ${base} opacity="${e.opacity ?? 1}"/>`);
  });
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${scene.viewBox}">` +
    `<defs>${defsMarkup}${scene.defs ?? ''}</defs>` +
    (scene.filter ? `<g filter="${scene.filter}">${parts.join('')}</g>` : parts.join('')) +
    `</svg>`;
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${name}-动画.svg`);
}

export async function exportWebM(scene: Scene, name: string, onError: (msg: string) => void) {
  const vb = scene.viewBox.split(/\s+/).map(Number);
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vb[2] * scale);
  canvas.height = Math.round(vb[3] * scale);
  const ctx = canvas.getContext('2d')!;
  const tl = buildTimeline(scene);

  const strokeItems = tl.strokes.map((s) => ({
    ...s,
    path: new Path2D(scene.els[s.idx].d),
    style: scene.els[s.idx],
  }));
  const fillItems = tl.fills.map((f) => ({
    ...f,
    path: new Path2D(scene.els[f.idx].d),
    style: scene.els[f.idx],
  }));
  const ghosts = scene.els
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.ghost)
    .map(({ e }) => new Path2D(e.d));
  const maskedBg = scene.els.find((e) => e.mask && e.fill);

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
    ctx.setTransform(scale, 0, 0, scale, -vb[0] * scale, -vb[1] * scale);
    ctx.clearRect(vb[0], vb[1], vb[2], vb[3]);
    // 白底（WebM 不透明背景，便于直接分享）
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(vb[0], vb[1], vb[2], vb[3]);
    if (scene.filter) {
      try {
        (ctx as any).filter = scene.filter;
      } catch {
        /* 忽略不支持的滤镜 */
      }
    }
    // 白文印章：先铺底色，再挖空
    if (maskedBg) {
      ctx.fillStyle = maskedBg.fill!;
      ctx.fill(new Path2D(maskedBg.d));
      if (ghosts.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        for (const g of ghosts) ctx.fill(g);
        ctx.restore();
      }
    }
    // 填充淡入
    for (const f of fillItems) {
      const p = Math.min(Math.max((el - f.begin) / f.dur, 0), 1);
      if (p <= 0) continue;
      ctx.globalAlpha = p * f.target;
      ctx.fillStyle = f.style.fill!;
      ctx.fill(f.path);
    }
    ctx.globalAlpha = 1;
    // 描边书写
    for (const s of strokeItems) {
      const p = Math.min(Math.max((el - s.begin) / s.dur, 0), 1);
      if (p <= 0) continue;
      ctx.strokeStyle = s.style.stroke!;
      ctx.lineWidth = s.style.sw ?? 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = s.style.opacity ?? 1;
      if (p >= 1) {
        ctx.setLineDash([]);
        ctx.stroke(s.path);
      } else {
        ctx.setLineDash([s.len * p, s.len * 1.2]);
        ctx.lineDashOffset = 0;
        ctx.stroke(s.path);
      }
    }
    ctx.globalAlpha = 1;
    if (scene.filter) {
      try {
        (ctx as any).filter = 'none';
      } catch {
        /* ignore */
      }
    }
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
