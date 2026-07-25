import { useRef } from 'react';
import {
  Flower2,
  Link2,
  Loader2,
  PenLine,
  Pencil,
  Shapes,
  Stamp,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { allFontMetas } from '@/lib/fonts';
import { ENGINES, ENGINE_KEYS, type EngineKey } from '@/lib/engines/index';
import { GRADIENT_PRESETS, SOLID_PRESETS } from '@/lib/paint';
import type { AppState } from '@/lib/share';

const ENGINE_ICONS: Record<EngineKey, typeof PenLine> = {
  business: PenLine,
  flourish: Flower2,
  minimal: Shapes,
  doodle: Pencil,
  seal: Stamp,
};

const CLS_TAG: Record<string, string> = { latn: '西文', han: '中文', arab: '阿文' };

interface ControlPanelProps {
  state: AppState;
  onPatch: (p: Partial<AppState>) => void;
  onEngine: (e: EngineKey) => void;
  onExport: (kind: 'svg' | 'png2' | 'png4' | 'smil' | 'webm') => void;
  onShare: () => void;
  onUploadFont: (f: File) => void;
  exporting: boolean;
  exportDisabled: boolean; // 场景生成中或已过期时禁止导出
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold tracking-widest text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function ControlPanel({
  state,
  onPatch,
  onEngine,
  onExport,
  onShare,
  onUploadFont,
  exporting,
  exportDisabled,
}: ControlPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const fonts = allFontMetas();

  return (
    <div className="space-y-6 p-5">
      <Section title="签名文本">
        <Textarea
          value={state.text}
          onChange={(e) => onPatch({ text: e.target.value.slice(0, 60) })}
          rows={2}
          placeholder="输入名字或昵称，支持中英文、符号、阿拉伯文混排"
          className="resize-none bg-background/60 text-base"
        />
      </Section>

      <Section title="风格">
        <div className="grid grid-cols-2 gap-2">
          {ENGINE_KEYS.map((key) => {
            const meta = ENGINES[key];
            const Icon = ENGINE_ICONS[key];
            const active = state.engine === key;
            return (
              <button
                key={key}
                onClick={() => onEngine(key)}
                className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 ring-1 ring-primary'
                    : 'border-border bg-background/40 hover:border-primary/50'
                }`}
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                <span>
                  <span className="block text-sm font-medium">{meta.name}</span>
                  <span className="block text-[11px] leading-tight text-muted-foreground">{meta.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="字体（混排时自动回退）">
        <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
          {fonts.map((f) => {
            const active = state.fontKey === f.key;
            return (
              <button
                key={f.key}
                onClick={() => onPatch({ fontKey: f.key })}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'border-primary bg-primary/10'
                    : 'border-transparent bg-background/40 hover:border-primary/40'
                }`}
              >
                <span className="font-medium">{f.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {f.cn} · {CLS_TAG[f.cls]}
                </span>
              </button>
            );
          })}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadFont(f);
            e.target.value = '';
          }}
        />
        <Button variant="outline" size="sm" className="w-full" onClick={() => fileRef.current?.click()}>
          <Upload className="mr-1.5 h-3.5 w-3.5" /> 上传自己的字体（ttf / otf / woff）
        </Button>
      </Section>

      <Section title="参数微调">
        {ENGINES[state.engine].sliders.map(({ key, label }) => (
          <div key={key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm">{label}</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.round(state.params[key] * 100)}
              </span>
            </div>
            <Slider
              value={[Math.round(state.params[key] * 100)]}
              onValueChange={([v]) =>
                onPatch({ params: { ...state.params, [key]: v / 100 } })
              }
              min={0}
              max={100}
              step={1}
            />
          </div>
        ))}
      </Section>

      <Section title="墨色">
        <div className="flex flex-wrap items-center gap-2">
          {SOLID_PRESETS.map((c) => (
            <button
              key={c.value}
              title={c.name}
              onClick={() => onPatch({ color: { type: 'solid', value: c.value } })}
              className={`h-7 w-7 rounded-full border transition-transform hover:scale-110 ${
                state.color.type === 'solid' && state.color.value === c.value
                  ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                  : 'border-border'
              }`}
              style={{ backgroundColor: c.value }}
            />
          ))}
          {GRADIENT_PRESETS.map((g) => (
            <button
              key={g.key}
              title={g.name}
              onClick={() => onPatch({ color: { type: 'gradient', value: g.key } })}
              className={`h-7 w-7 rounded-full border transition-transform hover:scale-110 ${
                state.color.type === 'gradient' && state.color.value === g.key
                  ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                  : 'border-border'
              }`}
              style={{
                background: `linear-gradient(135deg, ${g.stops[0][1]}, ${g.stops[g.stops.length - 1][1]})`,
              }}
            />
          ))}
          <label
            className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-dashed border-muted-foreground/50 transition-transform hover:scale-110"
            title="自定义颜色"
          >
            <input
              type="color"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              value={state.color.type === 'solid' ? state.color.value : '#17171c'}
              onChange={(e) => onPatch({ color: { type: 'solid', value: e.target.value } })}
            />
            <span className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">+</span>
          </label>
        </div>
      </Section>

      {state.engine === 'seal' && (
        <Section title="印章选项">
          <div className="space-y-3">
            <div className="flex gap-1 rounded-lg bg-background/60 p-1">
              {(
                [
                  ['square', '方章'],
                  ['circle', '圆章'],
                  ['ellipse', '椭圆章'],
                ] as const
              ).map(([shape, label]) => (
                <button
                  key={shape}
                  onClick={() => onPatch({ seal: { ...state.seal, shape } })}
                  className={`flex-1 rounded-md px-2 py-1.5 text-sm transition-colors ${
                    state.seal.shape === shape
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-lg bg-background/60 p-1">
              {(
                [
                  ['zhu', '朱文（红字）'],
                  ['bai', '白文（挖空）'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => onPatch({ seal: { ...state.seal, mode } })}
                  className={`flex-1 rounded-md px-2 py-1.5 text-sm transition-colors ${
                    state.seal.mode === mode
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">做旧质感</Label>
              <Switch
                checked={state.seal.distress}
                onCheckedChange={(v) => onPatch({ seal: { ...state.seal, distress: v } })}
              />
            </div>
          </div>
        </Section>
      )}

      <Separator />

      <Section title="导出与分享">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" disabled={exporting || exportDisabled} onClick={() => onExport('svg')}>
            SVG 矢量
          </Button>
          <Button variant="outline" size="sm" disabled={exporting || exportDisabled} onClick={() => onExport('png2')}>
            PNG ×2
          </Button>
          <Button variant="outline" size="sm" disabled={exporting || exportDisabled} onClick={() => onExport('png4')}>
            PNG ×4
          </Button>
          <Button variant="outline" size="sm" disabled={exporting || exportDisabled} onClick={() => onExport('smil')}>
            SVG 书写动画
          </Button>
          <Button variant="outline" size="sm" disabled={exporting || exportDisabled} onClick={() => onExport('webm')}>
            {exporting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            WebM 视频
          </Button>
          <Button variant="outline" size="sm" onClick={onShare}>
            <Link2 className="mr-1 h-3.5 w-3.5" /> 复制分享链接
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          SVG/PNG 为矢量与高分辨率位图，适合设计稿与二次加工；正式印刷或刻章前，请在专业软件中展开描边、转曲并核对物理尺寸与色彩。动画
          SVG 用浏览器打开即可播放；WebM 为白底视频（印章做旧在视频中为噪声近似）。
        </p>
      </Section>
    </div>
  );
}
