// 核心纯函数单测：无需浏览器与 WASM
import { describe, expect, it } from 'vitest';
import { esc } from '../exporter';
import { cmdsBBox, parsePath, rdp, type Pt } from '../path';
import { mulberry32 } from '../rng';
import { sanitizeState } from '../share';
import { skeletonize } from '../skeleton';

describe('share.sanitizeState（URL hash 运行时校验）', () => {
  it('拒绝注入式颜色值，回退默认墨色', () => {
    const s = sanitizeState({
      text: 'abc',
      engine: 'flourish',
      color: { type: 'solid', value: 'red"/><script>alert(1)</script>' },
    });
    expect(s).not.toBeNull();
    expect(s!.color.value).toBe('#17171c');
  });

  it('渐变只接受预设白名单', () => {
    const bad = sanitizeState({ text: 'a', engine: 'seal', color: { type: 'gradient', value: 'x" onload="alert(1)' } });
    expect(bad!.color).toEqual({ type: 'solid', value: '#17171c' });
    const good = sanitizeState({ text: 'a', engine: 'seal', color: { type: 'gradient', value: 'gold' } });
    expect(good!.color).toEqual({ type: 'gradient', value: 'gold' });
  });

  it('拒绝未知引擎与非法 fontKey，剥离控制字符', () => {
    expect(sanitizeState({ text: 'a', engine: 'evil' })).toBeNull();
    const s = sanitizeState({ text: 'a\nb\x00c', engine: 'minimal', fontKey: 'x"><' });
    expect(s!.text).toBe('abc');
    expect(s!.fontKey).toBe('great-vibes');
  });

  it('参数钳制到 0..1', () => {
    const s = sanitizeState({ text: 'a', engine: 'doodle', params: { flourish: 9, tightness: -3, weight: '0.4' } });
    expect(s!.params).toEqual({ flourish: 1, tightness: 0, weight: 0.4 });
  });
});

describe('exporter.esc（XML 属性转义）', () => {
  it('转义全部五种特殊字符', () => {
    expect(esc(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&#39;f');
  });
});

describe('path.rdp（回归：闭合轮廓首尾重复点不得塌缩）', () => {
  it('首尾同点的闭合环抽稀后仍保持多点', () => {
    const ring: Pt[] = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      ring.push([Math.cos(a) * 50, Math.sin(a) * 50]);
    }
    ring.push([...ring[0]]); // 轮廓闭合产生的重复终点
    const out = rdp(ring, 1.5);
    expect(out.length).toBeGreaterThan(4);
  });
});

describe('rng.mulberry32（确定性随机）', () => {
  it('同种子同序列', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 8; i++) expect(a()).toBe(b());
  });
});

describe('skeleton.skeletonize（回归：数字 0 的环带骨架）', () => {
  it('双矩形环带提取为单一闭合笔画', () => {
    // 外框 100x100 + 内框 20..80，偶奇填充后为环带（同字母 o / 数字 0 的拓扑）
    const d = 'M0 0H100V100H0Z M20 20V80H80V20Z';
    const strokes = skeletonize(d, cmdsBBox(parsePath(d)));
    expect(strokes.length).toBe(1);
    expect(strokes[0].closed).toBe(true);
  });
});
