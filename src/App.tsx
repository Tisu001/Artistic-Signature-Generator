import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Play, Share2, Stamp } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ControlPanel } from '@/components/ControlPanel';
import { Preview } from '@/components/Preview';
import { type EngineKey, type Scene } from '@/lib/engines/index';
import { exportPNG, exportSMIL, exportSVG, exportWebM } from '@/lib/exporter';
import { registerUpload } from '@/lib/fonts';
import { paintDefs } from '@/lib/paint';
import {
  copyShareLink,
  DEFAULT_STATE,
  readHashState,
  writeHashState,
  type AppState,
} from '@/lib/share';

function useScene(state: AppState) {
  const [scene, setScene] = useState<Scene | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let worker: Worker | null = null;
    let watchdog = 0;
    setLoading(true);
    const timer = setTimeout(() => {
      if (!state.text.trim()) {
        if (alive) {
          setScene(null);
          setMissing([]);
          setError(null);
          setLoading(false);
        }
        return;
      }
      worker = new Worker(new URL('./lib/scene.worker.ts', import.meta.url), { type: 'module' });
      watchdog = window.setTimeout(() => {
        worker?.terminate();
        if (alive) {
          setError('构建超时（已终止后台任务，请调整参数重试）');
          setLoading(false);
        }
      }, 10000);
      worker.onmessage = (ev) => {
        const m = ev.data;
        if (m.type === 'progress') {
          if (alive) setStage(m.stage);
          return;
        }
        window.clearTimeout(watchdog);
        worker?.terminate();
        if (!alive) return;
        if (m.type === 'result') {
          setScene(m.scene);
          setMissing(m.missing);
          setError(null);
        } else {
          setError(String(m.error));
        }
        setLoading(false);
      };
      worker.onerror = (e) => {
        window.clearTimeout(watchdog);
        worker?.terminate();
        if (alive) {
          setError(`后台任务异常：${e.message ?? '未知错误'}`);
          setLoading(false);
        }
      };
      worker.postMessage({
        id: Date.now(),
        base: document.baseURI,
        text: state.text,
        fontKey: state.fontKey,
        engine: state.engine,
        params: state.params,
        paint: state.color.type === 'solid' ? state.color.value : 'url(#ink-grad)',
        seal: state.seal,
        spacing: 1 - state.params.tightness * 0.1,
      });
    }, 220);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.clearTimeout(watchdog);
      worker?.terminate();
    };
  }, [state]);
  return { scene, missing, loading, stage, error };
}

export default function App() {
  const [state, setState] = useState<AppState>(() => readHashState() ?? DEFAULT_STATE);
  const [playToken, setPlayToken] = useState(0);
  const [exporting, setExporting] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const deferred = useDeferredValue(state);
  const { scene, missing, loading, stage, error } = useScene(deferred);
  const defsMarkup = useMemo(() => paintDefs(state.color), [state.color]);

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

  const onExport = async (kind: 'svg' | 'png2' | 'png4' | 'smil' | 'webm') => {
    if (!scene) {
      toast.error('请先输入签名内容');
      return;
    }
    const name = (state.text.trim() || 'signature').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40);
    try {
      setExporting(true);
      if (kind === 'svg') {
        if (svgRef.current) exportSVG(svgRef.current, name);
      } else if (kind === 'png2' || kind === 'png4') {
        if (svgRef.current) await exportPNG(svgRef.current, name, kind === 'png2' ? 2 : 4);
      } else if (kind === 'smil') {
        exportSMIL(scene, defsMarkup, name);
      } else if (kind === 'webm') {
        await exportWebM(scene, name, (m) => toast.error(m));
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
      await copyShareLink(state);
      toast.success('分享链接已复制，打开即得同款设计');
    } catch {
      toast.error('复制失败，请手动复制地址栏链接');
    }
  };

  const onUploadFont = async (file: File) => {
    try {
      const meta = await registerUpload(file);
      patch({ fontKey: meta.key });
      toast.success(`已加载字体「${meta.name}」`);
    } catch (e) {
      toast.error('字体解析失败：' + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Toaster position="top-center" richColors />
      <header className="flex items-center justify-between border-b px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-700">
            <Stamp className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">Artistic-Signature-Generator</h1>
            <p className="text-[11px] leading-tight text-muted-foreground">艺术签名设计 · 纯前端规则引擎</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPlayToken((t) => t + 1)} disabled={!scene}>
            <Play className="mr-1 h-3.5 w-3.5" /> 书写动画
          </Button>
          <Button variant="outline" size="sm" onClick={onShare}>
            <Share2 className="mr-1 h-3.5 w-3.5" /> 分享
          </Button>
        </div>
      </header>

      <main className="grid flex-1 lg:grid-cols-[1fr_380px]">
        <section className="preview-bg relative min-h-[54vh] p-4 lg:min-h-0 lg:p-6">
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
            className={`h-full w-full overflow-hidden rounded-xl p-4 transition-colors lg:p-8 ${
              state.bg === 'paper'
                ? 'bg-[#f7f4ec] shadow-[inset_0_2px_18px_rgba(0,0,0,0.12),0_8px_32px_rgba(0,0,0,0.4)]'
                : state.bg === 'dark'
                  ? 'border border-border bg-zinc-950'
                  : 'checker-bg border border-border'
            }`}
          >
            <Preview scene={scene} playToken={playToken} svgRef={svgRef} defsMarkup={defsMarkup} />
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
          />
        </aside>
      </main>
    </div>
  );
}
