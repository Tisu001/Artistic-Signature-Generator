import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { copyFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const launcherSrc = join(root, 'cmd', 'launcher');
const stagingDir = join(root, 'release', 'staging');
const exeName = '艺术签名生成器.exe';

const pkg = JSON.parse(await readFile(join(root, 'package.json')));
const version = pkg.version;

function readFile(path) {
  return import('node:fs/promises').then((m) => m.readFile(path, 'utf8'));
}

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });
}

function checkCommand(cmd, hint) {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${which} ${cmd}`, { cwd: root, stdio: 'ignore' });
  } catch {
    throw new Error(`缺少命令: ${cmd}\n${hint}`);
  }
}

function makeVersionInfoJSON(version) {
  const [major, minor, patch = '0'] = version.split('.').map((n) => parseInt(n, 10));
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

checkCommand('go', '请安装 Go 并加入 PATH');
checkCommand('goversioninfo', '请安装 goversioninfo: go install github.com/josephspurrier/goversioninfo/cmd/goversioninfo@latest');

// Resolve and record transitive dependencies before compiling the launcher.
run('go mod tidy', { cwd: launcherSrc });

run('node scripts/generate-icons.js');
await copyFile(join(root, 'assets', 'branding', 'app-icon.ico'), join(launcherSrc, 'app-icon.ico'));
await writeFile(join(launcherSrc, 'versioninfo.json'), makeVersionInfoJSON(version));
run('goversioninfo -64 -o rsrc_windows_amd64.syso versioninfo.json', { cwd: launcherSrc });

mkdirSync(stagingDir, { recursive: true });
run(`go build -mod=mod -ldflags="-H windowsgui -s -w" -o "${join(stagingDir, exeName)}" .`, { cwd: launcherSrc });

try { await rm(join(launcherSrc, 'app-icon.ico')); } catch {}
try { await rm(join(launcherSrc, 'rsrc_windows_amd64.syso')); } catch {}

console.log(`启动器已编译: ${join(stagingDir, exeName)}`);
