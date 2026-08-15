import assert from 'node:assert';
import { describe, it } from 'node:test';
import { makeVersionInfoJSON } from './versioninfo.js';

describe('makeVersionInfoJSON', () => {
  it('转换三位版本号', () => {
    const info = JSON.parse(makeVersionInfoJSON('0.3.0'));
    assert.strictEqual(info.FixedFileInfo.FileVersion.Major, 0);
    assert.strictEqual(info.FixedFileInfo.FileVersion.Minor, 3);
    assert.strictEqual(info.FixedFileInfo.FileVersion.Patch, 0);
    assert.strictEqual(info.FixedFileInfo.FileVersion.Build, 0);
    assert.strictEqual(info.StringFileInfo.FileVersion, '0.3.0.0');
    assert.strictEqual(info.StringFileInfo.ProductVersion, '0.3.0');
  });

  it('转换带补丁号的版本', () => {
    const info = JSON.parse(makeVersionInfoJSON('1.2.3'));
    assert.strictEqual(info.FixedFileInfo.FileVersion.Major, 1);
    assert.strictEqual(info.FixedFileInfo.FileVersion.Minor, 2);
    assert.strictEqual(info.FixedFileInfo.FileVersion.Patch, 3);
    assert.strictEqual(info.StringFileInfo.FileVersion, '1.2.3.0');
  });

  it('缺少补丁号时默认补 0', () => {
    const info = JSON.parse(makeVersionInfoJSON('2.5'));
    assert.strictEqual(info.FixedFileInfo.FileVersion.Major, 2);
    assert.strictEqual(info.FixedFileInfo.FileVersion.Minor, 5);
    assert.strictEqual(info.FixedFileInfo.FileVersion.Patch, 0);
    assert.strictEqual(info.StringFileInfo.FileVersion, '2.5.0.0');
  });
});
