import { businessRun } from './business';
import { doodleRun } from './doodle';
import { flourishRun } from './flourish';
import { minimalRun } from './minimal';
import { sealRun } from './seal';
import type { EngineRun } from './types';

export interface EngineMeta {
  key: EngineKey;
  name: string;
  desc: string;
  icon: string; // lucide 图标名（UI 层映射）
  run: EngineRun;
}

export type EngineKey = 'business' | 'flourish' | 'minimal' | 'doodle' | 'seal';

export const ENGINES: Record<EngineKey, EngineMeta> = {
  business: { key: 'business', name: '商务连笔', desc: '中心线均匀描边，字母平滑桥接', icon: 'pen-line', run: businessRun },
  flourish: { key: 'flourish', name: '花体飘逸', desc: '波浪扰动 + 藤蔓卷曲收尾', icon: 'flower-2', run: flourishRun },
  minimal: { key: 'minimal', name: '极简几何', desc: '曲线抽直，角度吸附', icon: 'shapes', run: minimalRun },
  doodle: { key: 'doodle', name: '涂鸦手绘', desc: '手抖质感，多重描边', icon: 'pencil', run: doodleRun },
  seal: { key: 'seal', name: '印章', desc: '方圆椭圆外框，朱白文可选', icon: 'stamp', run: sealRun },
};

export const ENGINE_KEYS: EngineKey[] = ['business', 'flourish', 'minimal', 'doodle', 'seal'];

export type { EngineParams, Scene, SceneEl, SealOpts } from './types';
