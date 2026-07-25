// 文本排版：run 分段 → 字体回退 → harfbuzz 整形 → 定位轮廓序列
import { BASE, getGlyphOutline, loadFont, type LoadedFont, type ScriptClass } from './fonts';
import { getHB } from './hb';
import { mergeBBox, translateBBox, type BBox } from './path';

export interface GlyphItem {
  char: string;
  gid: number;
  fontKey: string;
  cls: ScriptClass;
  d: string;
  x: number; // 落笔点 x（相对行首）
  y: number; // 落笔点 y（基线为 0）
  adv: number;
  bbox: BBox; // 已平移到最终位置
}

export interface LayoutResult {
  glyphs: GlyphItem[];
  bbox: BBox;
  missing: string[];
  width: number;
  base: number;
}

function isArabic(cp: number): boolean {
  return (
    (cp >= 0x0600 && cp <= 0x06ff) ||
    (cp >= 0x0750 && cp <= 0x077f) ||
    (cp >= 0x08a0 && cp <= 0x08ff) ||
    (cp >= 0xfb50 && cp <= 0xfdff) ||
    (cp >= 0xfe70 && cp <= 0xfeff)
  );
}
function isHan(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x3040 && cp <= 0x30ff) ||
    (cp >= 0x3000 && cp <= 0x303f) ||
    (cp >= 0xff00 && cp <= 0xff65)
  );
}
function isNeutral(cp: number): boolean {
  // 空格、常见符号与标点：并入前一个 run，保持字体连贯
  return (
    cp === 0x20 ||
    (cp >= 0x21 && cp <= 0x2f) ||
    (cp >= 0x3a && cp <= 0x40) ||
    (cp >= 0x5b && cp <= 0x60) ||
    (cp >= 0x7b && cp <= 0x7e) ||
    cp === 0x2000 ||
    cp === 0x2019 ||
    cp === 0x2018 ||
    cp === 0x201c ||
    cp === 0x201d ||
    cp === 0x2013 ||
    cp === 0x2014
  );
}
export function classify(cp: number): ScriptClass {
  if (isArabic(cp)) return 'arab';
  if (isHan(cp)) return 'han';
  return 'latn';
}

const FALLBACK: Record<ScriptClass, string[]> = {
  arab: ['aref-ruqaa', 'amiri'],
  han: ['zhimangxing', 'mashanzheng'],
  latn: ['great-vibes', 'sacramento', 'allura', 'gochi'],
};

export async function layoutText(
  text: string,
  selectedKey: string,
  spacing = 1
): Promise<LayoutResult> {
  const empty: LayoutResult = {
    glyphs: [],
    bbox: { minX: 0, minY: -BASE, maxX: 0, maxY: BASE * 0.3 },
    missing: [],
    width: 0,
    base: BASE,
  };
  const chars = [...text];
  if (!chars.length) return empty;

  // 1) 每个字符归类（中性字符继承前一个有效类）
  const classes: ScriptClass[] = [];
  let last: ScriptClass = 'latn';
  for (const ch of chars) {
    const cp = ch.codePointAt(0)!;
    if (isNeutral(cp)) {
      classes.push(last);
    } else {
      last = classify(cp);
      classes.push(last);
    }
  }

  // 2) 每个字符选字体（回退链按需加载：先加载者命中即用，不再预载整条链）
  const selected = await loadFont(selectedKey);
  const picked: (LoadedFont | null)[] = new Array(chars.length).fill(null);
  const missing: string[] = [];
  const need = new Map<string, LoadedFont | null>([[selectedKey, selected]]);
  const getFallback = async (key: string): Promise<LoadedFont | null> => {
    if (!need.has(key)) {
      try {
        need.set(key, await loadFont(key));
      } catch {
        need.set(key, null); // 加载失败则跳过该回退字体
      }
    }
    return need.get(key) ?? null;
  };
  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i].codePointAt(0)!;
    if (selected.unicodes.has(cp)) {
      picked[i] = selected;
      continue;
    }
    for (const key of FALLBACK[classes[i]]) {
      const lf = await getFallback(key);
      if (lf && lf.unicodes.has(cp)) {
        picked[i] = lf;
        break;
      }
    }
    if (!picked[i]) missing.push(chars[i]);
  }

  // 3) 连续同字体同类的字符组成整形单元
  interface Unit {
    font: LoadedFont;
    cls: ScriptClass;
    text: string;
    charIdx: number[];
  }
  const units: Unit[] = [];
  for (let i = 0; i < chars.length; i++) {
    const lf = picked[i];
    if (!lf) continue;
    const prev = units[units.length - 1];
    if (prev && prev.font.key === lf.key && prev.cls === classes[i]) {
      prev.text += chars[i];
      prev.charIdx.push(i);
    } else {
      units.push({ font: lf, cls: classes[i], text: chars[i], charIdx: [i] });
    }
  }

  // 4) 逐单元 harfbuzz 整形并定位
  const hb = await getHB();
  const glyphs: GlyphItem[] = [];
  let penX = 0;
  for (const unit of units) {
    const buf = new hb.Buffer();
    buf.addText(unit.text);
    buf.guessSegmentProperties();
    if (unit.cls === 'arab') buf.setDirection(5); // HB_DIRECTION_RTL
    hb.shape(unit.font.hbFont, buf);
    const out = buf.getGlyphInfosAndPositions() as {
      codepoint: number;
      cluster: number;
      xAdvance: number;
      yAdvance: number;
      xOffset: number;
      yOffset: number;
    }[];
    // RTL 单元：harfbuzz 按阅读顺序（从右到左）输出，翻转为从左到右排布
    const seq = unit.cls === 'arab' ? [...out].reverse() : out;
    // cluster(UTF-8 字节偏移) → 字符索引
    const byteOffsetOfChar: number[] = [];
    {
      let off = 0;
      for (const ch of [...unit.text]) {
        byteOffsetOfChar.push(off);
        off += new TextEncoder().encode(ch).length;
      }
    }
    const charOfCluster = (cl: number): number => {
      let best = 0;
      for (let i = 0; i < byteOffsetOfChar.length; i++) if (byteOffsetOfChar[i] <= cl) best = i;
      return unit.charIdx[best];
    };
    for (const g of seq) {
      const outline = getGlyphOutline(unit.font, g.codepoint);
      const gx = penX + g.xOffset;
      const gy = g.yOffset;
      glyphs.push({
        char: chars[charOfCluster(g.cluster)],
        gid: g.codepoint,
        fontKey: unit.font.key,
        cls: unit.cls,
        d: outline.d,
        x: gx,
        y: gy,
        adv: g.xAdvance * spacing,
        bbox: translateBBox(outline.bbox, gx, gy),
      });
      penX += g.xAdvance * spacing;
    }
  }

  let bbox: BBox | null = null;
  for (const g of glyphs) bbox = bbox ? mergeBBox(bbox, g.bbox) : g.bbox;
  if (!bbox) bbox = empty.bbox;
  return { glyphs, bbox, missing, width: penX, base: BASE };
}
