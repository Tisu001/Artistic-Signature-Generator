import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Play, Share2, Stamp } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ControlPanel } from '@/components/ControlPanel';
import { Preview } from '@/components/Preview';
import { type EngineKey, type Scene } from '@/lib/engines/index';
import { exportPNG, exportSMIL, exportSVG, exportWebM } from '@/lib/exporter';
import { persistUpload, registerUpload, restoreUploads, resolveFontKey, serializeUploads } from '@/lib/fonts';
import { paintDefs } from '@/lib/paint';
import type { BuildRequest } from '@/lib/scene.worker';
import {
  copyShareLink,
  DEFAULT_STATE,
  readHashState,
  reqSig,
  writeHashState,
  type AppState,
} from '@/lib/share';

interface BuiltScene {
  scene: Scene;
  text: string; // 生成时使用的文本：导出文件名以此为准，避免"旧签名、新文件名"
  sig: string; // 生成时状态的签名：与当前状态不一致时禁止导出
}

type BuildHandler = (m: { type: string; stage?: string; scene?: Scene; missing?: string[]; text?: string; error?: string }) => void;

// 常驻 Worker：字体与 HarfBuzz 缓存跨构建保留；超时/异常时才销毁重建
function useSceneBuilder() {
  const workerRef = useRef<Worker | null>(null);
  const handlersRef = useRef(new Map<number, BuildHandler>());
  const syncedSigRef = useRef<string | null>(null); // 当前 Worker 实例已同步的上传字体签名（null=未同步）

  const ensureWorker = (): Worker => {
    if (!workerRef.current) {
      const w = new Worker(new URL('./lib/scene.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev) => {
        const m = ev.data;
        handlersRef.current.get(m.id)?.(m);
      };
      workerRef.current = w;
      syncedSigRef.current = null;
    }
    return workerRef.current;
  };

  const killWorker = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    syncedSigRef.current = null;
  };

  const build = (req: BuildRequest, handler: BuildHandler) => {
    const w = ensureWorker();
    // 上传字体集合有变化才重新同步（新上传的字体必须送达 Worker）
    const uploads = serializeUploads();
    const sig = uploads.map((u) => u.key).join(',');
    if (sig !== syncedSigRef.current) {
      w.postMessage({ kind: 'init', base: document.baseURI, uploads });
      syncedSigRef.current = sig;
    }
    handlersRef.current.set(req.id, handler);
    w.postMessage({ kind: 'build', req });
  };

  const cancel = (id: number) => {
    handlersRef.current.delete(id);
  };

  return { build, cancel, killWorker };
}

function useScene(state: AppState, fontsReady: boolean, fontRevision: number) {
  const [built, setBuilt] = useState<BuiltScene | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const builder = useSceneBuilder();
  const idRef = useRef(0);

  useEffect(() => {
    if (!fontsReady) return;
    let alive = true;
    let watchdog = 0;
    let id = 0;
    setLoading(true);
    const timer = setTimeout(() => {
      if (!state.text.trim()) {
        if (alive) {
          setBuilt(null);
          setMissing([]);
          setError(null);
          setLoading(false);
        }
        return;
      }
      id = ++idRef.current;
      const sig = reqSig(state);
      watchdog = window.setTimeout(() => {
        builder.cancel(id);
        builder.killWorker(); // 疑似死循环：销毁重建，字体缓存随之重新加载
        if (alive) {
          setError('构建超时（已终止后台任务，请调整参数重试）');
          setLoading(false);
        }
      }, 10000);
      builder.build(
        {
          id,
          text: state.text,
          fontKey: state.fontKey,
          engine: state.engine,
          params: state.params,
          paint: state.color.type === 'solid' ? state.color.value : 'url(#ink-grad)',
          seal: state.seal,
          spacing: 1 - state.params.tightness * 0.1,
        },
        (m) => {
          if (!alive) return;
          if (m.type === 'progress') {
            setStage(m.stage ?? '');
            return;
          }
          window.clearTimeout(watchdog);
          builder.cancel(id);
          if (m.type === 'result') {
            setBuilt({ scene: m.scene!, text: m.text ?? state.text, sig });
            setMissing(m.missing ?? []);
            setError(null);
            // E2E 测试钩子：场景版本号
            (window as unknown as { __sceneRev?: number }).__sceneRev = id;
          } else {
            setError(String(m.error));
          }
          setLoading(false);
        }
      );
    }, 220);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.clearTimeout(watchdog);
      if (id) builder.cancel(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, fontsReady, fontRevision]);

  return { built, missing, loading, stage, error };
}

export default function App() {
  const [state, setState] = useState<AppState>(() => readHashState() ?? DEFAULT_STATE);
  const [playToken, setPlayToken] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [fontRevision, setFontRevision] = useState(0);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const deferred = useDeferredValue(state);
  const { built, missing, loading, stage, error } = useScene(deferred, fontsReady, fontRevision);
  const defsMarkup = useMemo(() => paintDefs(deferred.color), [deferred.color]);

  // 启动：从 IndexedDB 恢复上传字体；hash 引用了不存在的字体则回退默认
  useEffect(() => {
    void restoreUploads().then(() => {
      setState((s) => {
        const resolved = resolveFontKey(s.fontKey, DEFAULT_STATE.fontKey);
        if (resolved === s.fontKey) return s;
        toast.warning(`字体「${s.fontKey}」在本机不存在，已回退到默认字体`);
        return { ...s, fontKey: resolved };
      });
      setFontsReady(true);
    });
  }, []);

  useEffect(() => {
    writeHashState(state);
  }, [state]);

  const patch = (p: Partial<AppState>) => setState((s) => ({ ...s, ...p }));

  const onEngine = (engine: EngineKey) =>
    setState((s) => {
      const next = { ...s, engine };
      // 印章默认朱红
      if (engine === 'seal' && s.color.type === 'solid' && s.color.value === '#17171c')
        next.color = { type: 'solid', value: '#c0392b' };
      return next;
    });

  // revision 绑定：场景与当前(deferred)状态签名不一致即视为过期，禁止导出
  const canExport =
    !!built && !loading && !exporting && built.sig === reqSig(deferred) && reqSig(state) === reqSig(deferred);

  const onExport = async (kind: 'svg' | 'png2' | 'png4' | 'smil' | 'webm') => {
    if (!built || loading || built.sig !== reqSig(deferred)) {
      toast.error('场景尚未生成完成，请稍候');
      return;
    }
    // 文件名以"生成时的文本"为准，保证所见即所得
    const name = (built.text.trim() || 'signature').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40);
    try {
      setExporting(true);
      if (kind === 'svg') {
        if (svgRef.current) exportSVG(svgRef.current, name);
      } else if (kind === 'png2' || kind === 'png4') {
        if (svgRef.current) await exportPNG(svgRef.current, name, kind === 'png2' ? 2 : 4);
      } else if (kind === 'smil') {
        exportSMIL(built.scene, defsMarkup, name);
      } else if (kind === 'webm') {
        await exportWebM(built.scene, deferred.color, name);
      }
      if (kind !== 'webm') toast.success('已导出');
    } catch (e) {
      toast.error('导出失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExporting(false);
    }
  };

  const onShare = async () => {
    try {
      if (state.fontKey.startsWith('up-')) {
        toast.warning('链接无法携带上传的字体文件，对方打开时将回退到内置字体');
      }
      await copyShareLink(state);
      toast.success('分享链接已复制，打开即得同款设计');
    } catch {
      toast.error('复制失败，请手动复制地址栏链接');
    }
  };

  const onUploadFont = async (file: File) => {
    try {
      const meta = await registerUpload(file);
      void persistUpload(meta);
      setFontRevision((v) => v + 1);
      patch({ fontKey: meta.key });
      toast.success(`已加载字体「${meta.name}」`);
    } catch (e) {
      toast.error('字体解析失败：' + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Toaster position="top-center" richColors />
      <header className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-700">
            <Stamp className="h-4.5 w-4.5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold leading-tight">Artistic-Signature-Generator</h1>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">艺术签名生成器 · 纯前端规则引擎</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPlayToken((t) => t + 1)}
            disabled={!built || loading}
            className="px-2 sm:px-3"
            aria-label="书写动画"
          >
            <Play className="h-3.5 w-3.5 sm:mr-1" aria-hidden="true" />{' '}
            <span className="hidden sm:inline">书写动画</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onShare} className="px-2 sm:px-3" aria-label="分享">
            <Share2 className="h-3.5 w-3.5 sm:mr-1" aria-hidden="true" /> <span className="hidden sm:inline">分享</span>
          </Button>
        </div>
      </header>

      <main className="grid flex-1 lg:grid-cols-[1fr_380px]">
        <section className="preview-bg relative min-h-[54vh] min-w-0 p-4 lg:min-h-0 lg:p-6">
          <div className="absolute right-7 top-7 z-20 flex gap-1 rounded-lg border bg-card/90 p-1 backdrop-blur">
            {(
              [
                ['paper', '纸白'],
                ['dark', '暗夜'],
                ['grid', '透明'],
              ] as const
            ).map(([bg, label]) => (
              <button
                key={bg}
                onClick={() => patch({ bg })}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  state.bg === bg
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground shadow">
                <Loader2 className="h-4 w-4 animate-spin" /> {stage || '准备中'}…
              </div>
            </div>
          )}
          {error && (
            <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div
            className={`relative h-full w-full overflow-hidden rounded-xl transition-colors ${
              state.bg === 'paper'
                ? 'bg-[#f7f4ec] shadow-[inset_0_2px_18px_rgba(0,0,0,0.12),0_8px_32px_rgba(0,0,0,0.4)]'
                : state.bg === 'dark'
                  ? 'border border-border bg-zinc-950'
                  : 'checker-bg border border-border'
            }`}
          >
            <div className="absolute inset-0 p-4 lg:p-8">
              <Preview scene={built?.scene ?? null} playToken={playToken} svgRef={svgRef} defsMarkup={defsMarkup} />
            </div>
          </div>
          {missing.length > 0 && (
            <div className="absolute bottom-4 left-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
              {missing.length} 个字符无可用字形：{[...new Set(missing)].slice(0, 8).join(' ')}
              {missing.length > 8 ? '…' : ''}（可上传含这些字的字体）
            </div>
          )}
        </section>

        <aside className="max-h-none overflow-y-auto border-t bg-card/40 lg:max-h-[calc(100vh-57px)] lg:border-l lg:border-t-0">
          <ControlPanel
            state={state}
            onPatch={patch}
            onEngine={onEngine}
            onExport={onExport}
            onShare={onShare}
            onUploadFont={onUploadFont}
            exporting={exporting}
            exportDisabled={!canExport}
          />
        </aside>
      </main>
    </div>
  );
}
