// 集成测试：覆盖字体持久化/恢复、分享链接处理、导出状态签名
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allFontMetas, persistUpload, registerUploadData, restoreUploads, resolveFontKey, uploadedMetas } from '../fonts';
import { copyShareLink, DEFAULT_STATE, encodeState, readHashState, reqSig, sanitizeState } from '../share';

describe('上传字体持久化与恢复', () => {
  beforeEach(async () => {
    uploadedMetas.length = 0;
    await new Promise<void>((res, rej) => {
      const req = indexedDB.deleteDatabase('artistic-signature-generator');
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
      req.onblocked = () => res(); // 其他连接持有中仍继续
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('持久化并恢复上传字体，恢复后字体列表包含该字体', async () => {
    const meta = registerUploadData({
      key: 'up-1',
      name: 'Test Font',
      cls: 'latn',
      sizeAdjust: 1,
      buf: new ArrayBuffer(8),
    });
    await persistUpload(meta);

    // 模拟页面刷新：清空内存中的上传字体
    uploadedMetas.length = 0;
    expect(allFontMetas().some((f) => f.key === 'up-1')).toBe(false);

    const restored = await restoreUploads();
    expect(restored.some((f) => f.key === 'up-1')).toBe(true);
    expect(allFontMetas().some((f) => f.key === 'up-1')).toBe(true);
  });

  it('本地 hash 中的上传字体在恢复后保持选中', async () => {
    registerUploadData({
      key: 'up-1',
      name: 'Test Font',
      cls: 'latn',
      sizeAdjust: 1,
      buf: new ArrayBuffer(8),
    });
    await persistUpload(allFontMetas().find((f) => f.key === 'up-1')!);

    uploadedMetas.length = 0;
    await restoreUploads();

    const encoded = encodeState({ ...DEFAULT_STATE, fontKey: 'up-1' });
    vi.stubGlobal('location', { hash: `#s=${encoded}`, origin: 'http://localhost', pathname: '/' });
    const state = readHashState();
    expect(state?.fontKey).toBe('up-1');
    expect(resolveFontKey(state!.fontKey, DEFAULT_STATE.fontKey)).toBe('up-1');
  });
});

describe('分享链接字体处理', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('上传字体的分享链接会替换为默认内置字体', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });
    vi.stubGlobal('location', { origin: 'http://localhost', pathname: '/' });

    const url = await copyShareLink({ ...DEFAULT_STATE, fontKey: 'up-1' });
    const m = url.match(/#s=([A-Za-z0-9_-]+)/);
    expect(m).not.toBeNull();
    const decoded = JSON.parse(Buffer.from(m![1], 'base64url').toString('utf8'));
    expect(sanitizeState(decoded)?.fontKey).toBe(DEFAULT_STATE.fontKey);
  });

  it('未知内置字体链接在本地恢复时回退到默认字体', () => {
    const encoded = encodeState({ ...DEFAULT_STATE, fontKey: 'does-not-exist' });
    vi.stubGlobal('location', { hash: `#s=${encoded}`, origin: 'http://localhost', pathname: '/' });
    const state = readHashState();
    expect(state?.fontKey).toBe('does-not-exist');
    expect(resolveFontKey(state!.fontKey, DEFAULT_STATE.fontKey)).toBe(DEFAULT_STATE.fontKey);
  });
});

describe('参数变化期间禁止导出旧场景', () => {
  it('状态签名随内容字段变化而变化', () => {
    const base = reqSig(DEFAULT_STATE);
    expect(reqSig({ ...DEFAULT_STATE, params: { ...DEFAULT_STATE.params, flourish: 0.9 } })).not.toBe(base);
    expect(reqSig({ ...DEFAULT_STATE, text: 'Changed' })).not.toBe(base);
    expect(reqSig({ ...DEFAULT_STATE, color: { type: 'solid', value: '#ff0000' } })).not.toBe(base);
  });

  it('相同状态产生相同签名', () => {
    expect(reqSig(DEFAULT_STATE)).toBe(reqSig({ ...DEFAULT_STATE }));
  });
});
