// 应用状态与 URL 分享（hash 编码）
import type { EngineKey, EngineParams, SealOpts } from './engines/index';
import { ENGINE_KEYS } from './engines/index';
import { GRADIENT_PRESETS, type ColorSpec } from './paint';

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

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const FONT_KEY = /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/;

function sanitizeColor(c: unknown): ColorSpec {
  const o = c as { type?: unknown; value?: unknown } | null;
  if (o?.type === 'gradient' && typeof o.value === 'string' && GRADIENT_PRESETS.some((g) => g.key === o.value)) {
    return { type: 'gradient', value: o.value };
  }
  if (typeof o?.value === 'string' && HEX_COLOR.test(o.value)) {
    return { type: 'solid', value: o.value };
  }
  return DEFAULT_STATE.color;
}

// 运行时 schema 校验：hash 可被人为构造，所有字段过白名单
export function sanitizeState(obj: unknown): AppState | null {
  const o = obj as Record<string, unknown> | null;
  if (!o || typeof o.text !== 'string') return null;
  if (!ENGINE_KEYS.includes(o.engine as EngineKey)) return null;
  const params = o.params as Record<string, unknown> | undefined;
  const seal = o.seal as Record<string, unknown> | undefined;
  return {
    // eslint-disable-next-line no-control-regex -- 有意剥离控制字符，防止日志/终端注入
    text: o.text.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 60),
    // 上传字体无法随链接携带，接收方若恰好有同名上传字体会发生静默碰撞，因此分享状态一律回退内置字体
    fontKey:
      typeof o.fontKey === 'string' && FONT_KEY.test(o.fontKey) && !o.fontKey.startsWith('up-')
        ? o.fontKey
        : DEFAULT_STATE.fontKey,
    engine: o.engine as EngineKey,
    params: {
      flourish: clamp01(params?.flourish ?? 0.5),
      tightness: clamp01(params?.tightness ?? 0.5),
      weight: clamp01(params?.weight ?? 0.5),
    },
    color: sanitizeColor(o.color),
    seal: {
      shape: ['square', 'circle', 'ellipse'].includes(seal?.shape as string)
        ? (seal!.shape as SealOpts['shape'])
        : 'square',
      mode: seal?.mode === 'bai' ? 'bai' : 'zhu',
      distress: seal?.distress !== false,
    },
    bg: ['paper', 'dark', 'grid'].includes(o.bg as string) ? (o.bg as AppState['bg']) : 'paper',
  };
}

const MAX_HASH_LEN = 4096;

export function readHashState(): AppState | null {
  try {
    const m = location.hash.match(/#s=([A-Za-z0-9_-]+)/);
    if (!m || m[1].length > MAX_HASH_LEN) return null;
    return sanitizeState(JSON.parse(b64decode(m[1])));
  } catch {
    return null;
  }
}

const clamp01 = (n: unknown) => Math.min(Math.max(Number(n) || 0, 0), 1);

export function writeHashState(s: AppState) {
  const h = `#s=${encodeState(s)}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}

export async function copyShareLink(s: AppState): Promise<string> {
  const url = `${location.origin}${location.pathname}#s=${encodeState(s)}`;
  await navigator.clipboard.writeText(url);
  return url;
}
