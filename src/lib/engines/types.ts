import type { LayoutResult } from '../layout';

export interface EngineParams {
  flourish: number; // 飘逸程度 0..1
  tightness: number; // 连笔紧密度 0..1
  weight: number; // 笔画粗细 0..1
}

export interface SealOpts {
  shape: 'square' | 'circle' | 'ellipse';
  mode: 'zhu' | 'bai'; // 朱文 / 白文
  distress: boolean; // 做旧
}

export interface EngineInput {
  layout: LayoutResult;
  params: EngineParams;
  paint: string; // 已解析的填充值（纯色或 url(#渐变)）
  seed: number;
  seal: SealOpts;
}

export interface SceneEl {
  d: string;
  fill?: string;
  stroke?: string;
  sw?: number;
  opacity?: number;
  rule?: 'nonzero' | 'evenodd';
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
  mask?: string;
  ghost?: boolean; // 不渲染，仅供导出器做合成运算（如白文挖空）
  group: number; // 动画分组（字形序号）
}

export interface Scene {
  els: SceneEl[];
  viewBox: string;
  defs?: string;
  filter?: string;
  animOrder: number[]; // 描边元素的动画顺序（el 下标）
}

export type EngineRun = (input: EngineInput) => Scene;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
