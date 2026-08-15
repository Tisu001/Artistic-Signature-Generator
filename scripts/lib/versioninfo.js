export function makeVersionInfoJSON(version) {
  const [major, minor, patch = 0] = version.split('.').map((n) => parseInt(n, 10));
  const build = 0;
  const fileVersion = `${major}.${minor}.${patch}.${build}`;
  return JSON.stringify({
    FixedFileInfo: {
      FileVersion: { Major: major, Minor: minor, Patch: patch, Build: build },
      ProductVersion: { Major: major, Minor: minor, Patch: patch, Build: build },
      FileFlagsMask: '3f',
      FileFlags: '00',
      FileOS: '040004',
      FileType: '01',
      FileSubType: '00'
    },
    StringFileInfo: {
      Comments: '艺术签名生成器 - 纯前端字体轮廓特效器',
      CompanyName: '',
      FileDescription: '艺术签名生成器',
      FileVersion: fileVersion,
      InternalName: '艺术签名生成器',
      LegalCopyright: '',
      LegalTrademarks: '',
      OriginalFilename: '艺术签名生成器.exe',
      PrivateBuild: '',
      ProductName: '艺术签名生成器',
      ProductVersion: version,
      SpecialBuild: ''
    },
    VarFileInfo: {
      Translation: {
        LangID: '0804',
        CharsetID: '04B0'
      }
    },
    IconPath: '../../assets/branding/app-icon.ico',
    ManifestPath: ''
  }, null, 2);
}
