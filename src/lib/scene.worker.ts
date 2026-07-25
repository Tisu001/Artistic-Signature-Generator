// 场景构建 Worker：排版 + 风格引擎全部在后台线程执行
import { ENGINES, type EngineKey, type EngineParams, type SealOpts } from './engines/index';
import { setFontBase } from './fonts';
import { layoutText } from './layout';
import { hashString } from './rng';

export interface BuildRequest {
  id: number;
  base: string;
  text: string;
  fontKey: string;
  engine: EngineKey;
  params: EngineParams;
  paint: string;
  seal: SealOpts;
  spacing: number;
}

self.onmessage = async (ev: MessageEvent<BuildRequest>) => {
  const { id, base, text, fontKey, engine, params, paint, seal, spacing } = ev.data;
  try {
    setFontBase(base);
    (self as unknown as Worker).postMessage({ id, type: 'progress', stage: '文字整形与字体回退' });
    const layout = await layoutText(text, fontKey, spacing);
    (self as unknown as Worker).postMessage({ id, type: 'progress', stage: `风格引擎：${ENGINES[engine].name}` });
    const scene = ENGINES[engine].run({
      layout,
      params,
      paint,
      seed: hashString(text + '|' + engine),
      seal,
    });
    (self as unknown as Worker).postMessage({ id, type: 'result', scene, missing: layout.missing });
  } catch (e) {
    (self as unknown as Worker).postMessage({
      id,
      type: 'error',
      error: e instanceof Error ? e.message : String(e),
    });
  }
};
