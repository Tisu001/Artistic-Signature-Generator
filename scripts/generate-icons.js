// 从 assets/branding/app-icon.svg 生成 exe 多尺寸 ICO
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcSvg = join(root, 'assets', 'branding', 'app-icon.svg');
const outDir = join(root, 'assets', 'branding');
const icoPath = join(outDir, 'app-icon.ico');

async function main() {
  await mkdir(outDir, { recursive: true });

  // 多尺寸 ICO：16,24,32,48,64,128,256
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = await Promise.all(
    sizes.map(async (size) => sharp(srcSvg).resize(size, size, { fit: 'contain', background: 'transparent' }).png().toBuffer())
  );
  const icoBuf = await pngToIco(pngs);
  await writeFile(icoPath, icoBuf);

  console.log(`Generated ${icoPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
