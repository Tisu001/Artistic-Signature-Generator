// 应用状态与 URL 分享（hash 编码）
import type { EngineKey, EngineParams, SealOpts } from './engines/index';
import { ENGINE_KEYS } from './engines/index';
import type { ColorSpec } from './paint';

export interface AppState {
  text: string;
  fontKey: string;
  engine: EngineKey;
  params: EngineParams;
  color: ColorSpec;
  seal: SealOpts;
  bg: 'paper' | 'dark' | 'grid';
}

export const DEFAULT_STATE: AppState = {
  text: 'Artistic Signature',
  fontKey: 'great-vibes',
  engine: 'flourish',
  params: { flourish: 0.55, tightness: 0.5, weight: 0.5 },
  color: { type: 'solid', value: '#17171c' },
  seal: { shape: 'square', mode: 'zhu', distress: true },
  bg: 'paper',
};

function b64encode(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64decode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)));
}

export function encodeState(s: AppState): string {
  return b64encode(JSON.stringify({ v: 1, ...s }));
}

export function readHashState(): AppState | null {
  try {
    const m = location.hash.match(/#s=([A-Za-z0-9_-]+)/);
    if (!m) return null;
    const obj = JSON.parse(b64decode(m[1]));
    if (!obj || typeof obj.text !== 'string') return null;
    if (!ENGINE_KEYS.includes(obj.engine)) return null;
    return {
      text: obj.text.slice(0, 60),
      fontKey: typeof obj.fontKey === 'string' ? obj.fontKey : DEFAULT_STATE.fontKey,
      engine: obj.engine,
      params: {
        flourish: clamp01(obj.params?.flourish ?? 0.5),
        tightness: clamp01(obj.params?.tightness ?? 0.5),
        weight: clamp01(obj.params?.weight ?? 0.5),
      },
      color:
        obj.color?.type === 'gradient'
          ? { type: 'gradient', value: String(obj.color.value) }
          : { type: 'solid', value: String(obj.color?.value ?? '#17171c') },
      seal: {
        shape: ['square', 'circle', 'ellipse'].includes(obj.seal?.shape) ? obj.seal.shape : 'square',
        mode: obj.seal?.mode === 'bai' ? 'bai' : 'zhu',
        distress: obj.seal?.distress !== false,
      },
      bg: ['paper', 'dark', 'grid'].includes(obj.bg) ? obj.bg : 'paper',
    };
  } catch {
    return null;
  }
}

const clamp01 = (n: number) => Math.min(Math.max(Number(n) || 0, 0), 1);

export function writeHashState(s: AppState) {
  const h = `#s=${encodeState(s)}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}

export async function copyShareLink(s: AppState): Promise<string> {
  const url = `${location.origin}${location.pathname}#s=${encodeState(s)}`;
  await navigator.clipboard.writeText(url);
  return url;
}
