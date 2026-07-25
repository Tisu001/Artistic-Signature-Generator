// HarfBuzz WASM 封装（vendored，避免预打包破坏 wasm 加载）
let hbPromise: Promise<any> | null = null;

export function getHB(): Promise<any> {
  if (!hbPromise) {
    // @ts-ignore - vendored mjs 无类型声明
    hbPromise = import('./vendor/harfbuzz/index.mjs');
  }
  return hbPromise;
}

export interface ShapedGlyph {
  gid: number;
  cluster: number;
  ax: number;
  ay: number;
  dx: number;
  dy: number;
}
