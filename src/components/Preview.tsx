import { useEffect, type RefObject } from 'react';
import type { Scene } from '@/lib/engines/index';

interface PreviewProps {
  scene: Scene | null;
  playToken: number;
  svgRef: RefObject<SVGSVGElement | null>;
  defsMarkup: string;
}

export function Preview({ scene, playToken, svgRef, defsMarkup }: PreviewProps) {
  useEffect(() => {
    const svg = svgRef.current;
    if (!playToken || !scene || !svg) return;
    const paths = Array.from(svg.querySelectorAll<SVGPathElement>('path[data-i]'));
    const byIdx = new Map<number, SVGPathElement>();
    paths.forEach((p) => byIdx.set(Number(p.dataset.i), p));
    const anims: Animation[] = [];

    const strokeIdx = scene.animOrder.filter((i) => {
      const e = scene.els[i];
      return e && e.stroke && !e.ghost && byIdx.has(i);
    });
    const doms = strokeIdx.map((i) => byIdx.get(i)!);
    const lens = doms.map((d) => {
      try {
        return Math.max(d.getTotalLength(), 1);
      } catch {
        return 100;
      }
    });
    const totalLen = lens.reduce((a, b) => a + b, 0) || 1;
    const T = strokeIdx.length ? Math.min(Math.max(totalLen / 900, 1.2), 7) : 0;

    let acc = 0;
    doms.forEach((d, k) => {
      d.setAttribute('pathLength', '1');
      d.style.strokeDasharray = '1';
      d.style.strokeDashoffset = '1';
      const dur = (T * lens[k]) / totalLen;
      anims.push(
        d.animate([{ strokeDashoffset: '1' }, { strokeDashoffset: '0' }], {
          duration: Math.max(dur, 0.05) * 1000,
          delay: acc * 1000,
          fill: 'forwards',
          easing: 'cubic-bezier(.42,0,.3,1)',
        })
      );
      acc += dur;
    });

    const fillIdx = scene.els
      .map((e, i) => ({ e, i }))
      .filter(({ e, i }) => e.fill && !e.ghost && byIdx.has(i))
      .map(({ i }) => i);
    const groups = [...new Set(fillIdx.map((i) => scene.els[i].group))].sort((a, b) => a - b);
    const fadeStart = strokeIdx.length ? acc * 0.92 : 0;
    const fadeSpan = strokeIdx.length
      ? Math.max(T * 0.08, 0.45)
      : Math.min(Math.max(groups.length * 0.32, 0.8), 4);
    groups.forEach((g, gi) => {
      const begin = fadeStart + (fadeSpan * gi) / Math.max(groups.length, 1);
      const dur = Math.max(fadeSpan / Math.max(groups.length, 1), 0.25);
      for (const i of fillIdx) {
        if (scene.els[i].group !== g) continue;
        const d = byIdx.get(i)!;
        const target = scene.els[i].opacity ?? 1;
        d.style.opacity = '0';
        anims.push(
          d.animate([{ opacity: 0 }, { opacity: target }], {
            duration: dur * 1000,
            delay: begin * 1000,
            fill: 'forwards',
          })
        );
      }
    });

    return () => {
      anims.forEach((a) => a.cancel());
      doms.forEach((d) => {
        d.style.strokeDasharray = '';
        d.style.strokeDashoffset = '';
        d.removeAttribute('pathLength');
      });
      fillIdx.forEach((i) => {
        const d = byIdx.get(i);
        if (d) d.style.opacity = '';
      });
    };
  }, [playToken, scene, svgRef]);

  if (!scene) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground">
        在右侧输入名字，开始设计你的签名
      </div>
    );
  }
  return (
    <svg
      ref={svgRef}
      viewBox={scene.viewBox}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs dangerouslySetInnerHTML={{ __html: defsMarkup + (scene.defs ?? '') }} />
      <g filter={scene.filter}>
        {scene.els.map((e, i) =>
          e.ghost ? null : (
            <path
              key={i}
              data-i={i}
              d={e.d}
              fill={e.fill ?? 'none'}
              stroke={e.stroke ?? 'none'}
              strokeWidth={e.sw}
              strokeLinecap={(e.cap as 'round' | 'butt' | 'square' | undefined) ?? 'round'}
              strokeLinejoin={(e.join as 'round' | 'miter' | 'bevel' | undefined) ?? 'round'}
              opacity={e.opacity}
              fillRule={e.rule}
              mask={e.mask}
            />
          )
        )}
      </g>
    </svg>
  );
}
