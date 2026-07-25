// 墨色：纯色与渐变预设
export interface ColorSpec {
  type: 'solid' | 'gradient';
  value: string;
}

export const SOLID_PRESETS: { name: string; value: string }[] = [
  { name: '玄墨', value: '#17171c' },
  { name: '朱红', value: '#c0392b' },
  { name: '青花', value: '#2456a6' },
  { name: '黛紫', value: '#6b4fa0' },
  { name: '松烟', value: '#1e6f5c' },
  { name: '赭石', value: '#6f4e37' },
];

export const GRADIENT_PRESETS: { key: string; name: string; stops: [number, string][] }[] = [
  { key: 'gold', name: '鎏金', stops: [[0, '#f7e08b'], [0.45, '#d4a017'], [1, '#8b5a00']] },
  { key: 'rose', name: '绯霞', stops: [[0, '#ff9a9e'], [1, '#c2185b']] },
  { key: 'ocean', name: '沧浪', stops: [[0, '#4facfe'], [1, '#0b3d91']] },
  { key: 'jade', name: '翡翠', stops: [[0, '#84fab0'], [1, '#0f6b4f']] },
];

export function resolvePaint(c: ColorSpec): string {
  return c.type === 'solid' ? c.value : 'url(#ink-grad)';
}

export function paintDefs(c: ColorSpec): string {
  if (c.type !== 'gradient') return '';
  const g = GRADIENT_PRESETS.find((x) => x.key === c.value) ?? GRADIENT_PRESETS[0];
  const stops = g.stops
    .map(([o, col]) => `<stop offset="${o}" stop-color="${col}"/>`)
    .join('');
  return `<linearGradient id="ink-grad" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>`;
}
