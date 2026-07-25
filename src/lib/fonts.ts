// 字体注册表：内置懒加载 + 上传 + 字符覆盖回退
import { getHB } from './hb';
import { cmdsBBox, parsePath, serialize, type BBox, type Cmd } from './path';

export const BASE = 220;

export type ScriptClass = 'latn' | 'han' | 'arab';

export interface FontMeta {
  key: string;
  name: string;
  cn: string;
  cls: ScriptClass;
  sizeAdjust: number;
  builtin: boolean;
  file?: string;
}

export const BUILTIN_FONTS: FontMeta[] = [
  { key: 'great-vibes', name: 'Great Vibes', cn: '华丽花体', cls: 'latn', sizeAdjust: 1, builtin: true, file: 'fonts/GreatVibes-Regular.ttf' },
  { key: 'sacramento', name: 'Sacramento', cn: '连笔手写', cls: 'latn', sizeAdjust: 1, builtin: true, file: 'fonts/Sacramento-Regular.ttf' },
  { key: 'allura', name: 'Allura', cn: '优雅行书', cls: 'latn', sizeAdjust: 1, builtin: true, file: 'fonts/Allura-Regular.ttf' },
  { key: 'gochi', name: 'Gochi Hand', cn: '随性涂鸦', cls: 'latn', sizeAdjust: 1.05, builtin: true, file: 'fonts/GochiHand-Regular.ttf' },
  { key: 'zhimangxing', name: '志莽行书', cn: '中文行书', cls: 'han', sizeAdjust: 0.94, builtin: true, file: 'fonts/ZhiMangXing-Regular.ttf' },
  { key: 'mashanzheng', name: '马善政毛笔', cn: '毛笔楷书', cls: 'han', sizeAdjust: 0.94, builtin: true, file: 'fonts/MaShanZheng-Regular.ttf' },
  { key: 'amiri', name: 'Amiri', cn: '阿文正体', cls: 'arab', sizeAdjust: 1, builtin: true, file: 'fonts/Amiri-Regular.ttf' },
  { key: 'aref-ruqaa', name: 'Aref Ruqaa', cn: '阿文草体', cls: 'arab', sizeAdjust: 1.12, builtin: true, file: 'fonts/ArefRuqaa-Regular.ttf' },
];

export interface LoadedFont extends FontMeta {
  hbFont: any;
  upem: number;
  unicodes: Set<number>;
  glyphCache: Map<number, { d: string; bbox: BBox; cmds: Cmd[] }>;
}

const loadedCache = new Map<string, Promise<LoadedFont>>();
const uploadStore = new Map<string, ArrayBuffer>();
export const uploadedMetas: FontMeta[] = [];
let uploadSeq = 0;

export function allFontMetas(): FontMeta[] {
  return [...BUILTIN_FONTS, ...uploadedMetas];
}

let fontBase: string | null = null;

export function setFontBase(u: string) {
  fontBase = u;
}

export function fontUrl(meta: FontMeta): string {
  const rel = meta.file!;
  if (fontBase) return new URL(rel, fontBase).href;
  return new URL(rel, document.baseURI).href;
}

async function createLoadedFont(meta: FontMeta, buffer: ArrayBuffer): Promise<LoadedFont> {
  const hb = await getHB();
  const blob = new hb.Blob(buffer);
  const face = new hb.Face(blob, 0);
  const hbFont = new hb.Font(face);
  const px = BASE * meta.sizeAdjust;
  hbFont.setScale(px, -px); // 负 y：直接产出 y 向下的屏幕坐标
  const unicodes = new Set<number>(face.collectUnicodes() as Uint32Array);
  return { ...meta, hbFont, upem: face.upem, unicodes, glyphCache: new Map() };
}

export function loadFont(key: string): Promise<LoadedFont> {
  let p = loadedCache.get(key);
  if (!p) {
    p = (async () => {
      const meta = allFontMetas().find((f) => f.key === key);
      if (!meta) throw new Error(`未知字体: ${key}`);
      let buffer = uploadStore.get(key);
      if (!buffer) {
        const res = await fetch(fontUrl(meta));
        if (!res.ok) throw new Error(`字体下载失败: ${meta.name}`);
        buffer = await res.arrayBuffer();
      }
      return createLoadedFont(meta, buffer);
    })();
    loadedCache.set(key, p);
  }
  return p;
}

export async function registerUpload(file: File): Promise<FontMeta> {
  const buffer = await file.arrayBuffer();
  const hb = await getHB();
  const blob = new hb.Blob(buffer);
  const face = new hb.Face(blob, 0);
  const uni = face.collectUnicodes() as Uint32Array;
  let han = 0;
  let arab = 0;
  for (const cp of uni) {
    if (cp >= 0x4e00 && cp <= 0x9fff) han++;
    if (cp >= 0x0600 && cp <= 0x06ff) arab++;
  }
  const cls: ScriptClass = han > 50 ? 'han' : arab > 50 ? 'arab' : 'latn';
  const key = `up-${++uploadSeq}`;
  const meta: FontMeta = {
    key,
    name: file.name.replace(/\.(ttf|otf|woff2?)$/i, ''),
    cn: '上传字体',
    cls,
    sizeAdjust: cls === 'han' ? 0.94 : 1,
    builtin: false,
  };
  uploadStore.set(key, buffer);
  uploadedMetas.push(meta);
  return meta;
}

// 提取字形轮廓（缓存）；坐标 y 向下，基于 BASE*sizeAdjust 像素
export function getGlyphOutline(lf: LoadedFont, gid: number): { d: string; bbox: BBox; cmds: Cmd[] } {
  let hit = lf.glyphCache.get(gid);
  if (!hit) {
    const raw = lf.hbFont.glyphToJson(gid) as { type: string; values: number[] }[];
    const cmds: Cmd[] = raw.map((c) => ({ t: c.type as Cmd['t'], v: c.values }));
    const d = serialize(cmds);
    hit = { d, bbox: cmdsBBox(cmds), cmds };
    lf.glyphCache.set(gid, hit);
  }
  return hit;
}
