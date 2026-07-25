// HarfBuzz WASM 封装（vendored，避免预打包破坏 wasm 加载）

// vendored harfbuzzjs 的最小类型声明（仅覆盖本项目用到的 API）
export interface HBGlyphJson {
  type: string;
  values: number[];
}

export interface HBFont {
  setScale(x: number, y: number): void;
  glyphToJson(gid: number): HBGlyphJson[];
}

export interface HBFace {
  upem: number;
  collectUnicodes(): Uint32Array;
}

export interface HBBuffer {
  addText(text: string): void;
  guessSegmentProperties(): void;
  setDirection(dir: number): void;
  setScript(script: string): void;
  getGlyphInfosAndPositions(): {
    codepoint: number;
    cluster: number;
    xAdvance: number;
    yAdvance: number;
    xOffset: number;
    yOffset: number;
  }[];
}

export interface HBModule {
  Blob: new (data: ArrayBuffer) => unknown;
  Face: new (blob: unknown, index: number) => HBFace;
  Font: new (face: HBFace) => HBFont;
  Buffer: new () => HBBuffer;
  shape(font: HBFont, buffer: HBBuffer): void;
}

let hbPromise: Promise<HBModule> | null = null;

export function getHB(): Promise<HBModule> {
  if (!hbPromise) {
    // @ts-expect-error - vendored mjs 无类型声明，运行时结构与 HBModule 一致
    hbPromise = import('./vendor/harfbuzz/index.mjs') as Promise<HBModule>;
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
