// Rasterize src/assets/giraffe.svg into the four MV3 toolbar PNGs
// (Chrome's manifest icons must be PNG, not SVG). Run with `pnpm icons`
// after editing the source SVG.

import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcSvg = path.join(root, 'src/assets/giraffe.svg');
const outDir = path.join(root, 'icons');
mkdirSync(outDir, { recursive: true });

const svg = readFileSync(srcSvg);
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const out = path.join(outDir, `icon-${size}.png`);
  await sharp(svg, { density: Math.max(72, size * 6) })
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`wrote ${path.relative(root, out)}`);
}
