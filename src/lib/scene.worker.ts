// 场景构建 Worker：常驻线程，字体缓存跨构建保留；新请求自动作废旧请求
import { ENGINES, type EngineKey, type EngineParams, type SealOpts } from './engines/index';
import { registerUploadData, setFontBase, type UploadPayload } from './fonts';
import { layoutText } from './layout';
import { hashString } from './rng';

export interface BuildRequest {
  id: number;
  text: string;
  fontKey: string;
  engine: EngineKey;
  params: EngineParams;
  paint: string;
  seal: SealOpts;
  spacing: number;
}

export type WorkerInMsg =
  | { kind: 'init'; base: string; uploads: UploadPayload[] }
  | { kind: 'build'; req: BuildRequest };

let latest: BuildRequest | null = null;
let busy = false;

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

self.onmessage = (ev: MessageEvent<WorkerInMsg>) => {
  const m = ev.data;
  if (m.kind === 'init') {
    setFontBase(m.base);
    for (const u of m.uploads) registerUploadData(u);
    return;
  }
  if (m.kind === 'build') {
    latest = m.req;
    void pump();
  }
};

async function pump() {
  if (busy) return;
  busy = true;
  try {
    while (latest) {
      const req = latest;
      latest = null;
      await build(req);
    }
  } finally {
    busy = false;
  }
}

async function build(req: BuildRequest) {
  const { id, text, fontKey, engine, params, paint, seal, spacing } = req;
  try {
    post({ id, type: 'progress', stage: '文字整形与字体回退' });
    const layout = await layoutText(text, fontKey, spacing);
    post({ id, type: 'progress', stage: `风格引擎：${ENGINES[engine].name}` });
    const scene = ENGINES[engine].run({
      layout,
      params,
      paint,
      seed: hashString(text + '|' + engine),
      seal,
    });
    // 构建期间来了更新的请求：结果已过期，直接丢弃
    if (latest) return;
    post({ id, type: 'result', scene, missing: layout.missing, text });
  } catch (e) {
    if (latest) return; // 过期请求的错误不必上报
    post({ id, type: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}
