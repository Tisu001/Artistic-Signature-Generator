import AdmZip from 'adm-zip';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const releaseDir = join(root, 'release');
const stagingDir = join(releaseDir, 'staging');
const appDirName = '艺术签名生成器';
const packageDir = join(stagingDir, appDirName);
const exeName = '艺术签名生成器.exe';
const launcherSrc = join(root, 'cmd', 'launcher');

const pkg = JSON.parse(await readFile(join(root, 'package.json')));
const version = pkg.version;
const zipName = `Artistic-Signature-Generator-v${version}-windows-x64.zip`;

function readFile(path) {
  return import('node:fs/promises').then((m) => m.readFile(path, 'utf8'));
}

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

async function clean(dir) {
  if (existsSync(dir)) {
    await rm(dir, { recursive: true, force: true });
  }
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

// 1. 生成图标
console.log('[1/6] 生成图标...');
run('node scripts/generate-icons.js');

// 2. 检查依赖
console.log('[2/6] 检查构建依赖...');
checkCommand('go', '请安装 Go 并加入 PATH');
checkCommand('goversioninfo', '请安装 goversioninfo: go install github.com/josephspurrier/goversioninfo/cmd/goversioninfo@latest');

// Resolve transitive module go.mod checksums before the Windows build.
run('go mod download', { cwd: launcherSrc });

// 3. 前端构建
console.log('[3/6] 构建前端 dist...');
run('npm run build');

// 4. 准备启动器资源
console.log('[4/6] 准备启动器资源...');
await copyFile(join(root, 'assets', 'branding', 'app-icon.ico'), join(launcherSrc, 'app-icon.ico'));

// 5. 生成 Windows 版本信息 .syso
console.log('[5/6] 生成 Windows 版本信息...');
await writeFile(join(launcherSrc, 'versioninfo.json'), makeVersionInfoJSON(version));
run('goversioninfo -64 -o rsrc_windows_amd64.syso versioninfo.json', { cwd: launcherSrc });

// 6. 编译 Go 启动器
console.log('[6/6] 编译并组装便携包...');
// 清理整个 staging，避免 build:launcher 遗留的单独 exe 被误打包
await clean(stagingDir);
ensureDir(packageDir);
run(`go build -ldflags="-H windowsgui -s -w" -o "${join(packageDir, exeName)}" .`, { cwd: launcherSrc });

// 复制 dist 到 app/
await copyDir(join(root, 'dist'), join(packageDir, 'app'));

// 清理中间产物
try { await rm(join(launcherSrc, 'app-icon.ico')); } catch {}
try { await rm(join(launcherSrc, 'rsrc_windows_amd64.syso')); } catch {}

// 打 ZIP
ensureDir(releaseDir);
const zipPath = join(releaseDir, zipName);
if (existsSync(zipPath)) rmSync(zipPath);
const zip = new AdmZip();
zip.addLocalFolder(packageDir, appDirName);
zip.writeZip(zipPath);

console.log('\n打包完成:');
console.log(`  目录: ${packageDir}`);
console.log(`  ZIP:  ${zipPath}`);
