// ChatGPT で作ったエフェクトの一枚絵（art-src/effects-sheet.png、純黒の地に 2×2）を 4 枚に切って
// src/assets/art/fx/ へ出す。地が黒なので、CSS の mix-blend-mode: screen で重ねる（透過は持たない）。
// 左上=斬撃 / 右上=爆発 / 左下=氷 / 右下=魔法陣。
// 使い方: node scripts/slice-effects.mjs
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = `${root}art-src/effects-sheet.png`;
const out = `${root}src/assets/art/fx`;
await mkdir(out, { recursive: true });

const { width, height } = await sharp(src).metadata();
const w = Math.floor(width / 2);
const h = Math.floor(height / 2);
for (const [name, col, row] of [
  ['slash', 0, 0],
  ['blast', 1, 0],
  ['ice', 0, 1],
  ['circle', 1, 1],
]) {
  await sharp(src)
    .extract({ left: col * w, top: row * h, width: w, height: h })
    .resize(384, 384, { fit: 'cover' })
    .webp({ quality: 85 })
    .toFile(`${out}/${name}.webp`);
  console.log(`${name}.webp`);
}
