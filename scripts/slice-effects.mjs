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

// 2 枚目（art-src/effects-sheet-2.png、3×3）: 毒・回復・強化・封印・吸血・貫通・交差斬り・金貨・盾。
const src2 = `${root}art-src/effects-sheet-2.png`;
const m2 = await sharp(src2).metadata();
const w2 = Math.floor(m2.width / 3);
const h2 = Math.floor(m2.height / 3);
['poison', 'heal', 'buff', 'seal', 'drain', 'pierce', 'cross', 'coin', 'guard'].forEach(async (name, i) => {
  await sharp(src2)
    .extract({ left: (i % 3) * w2, top: Math.floor(i / 3) * h2, width: w2, height: h2 })
    .resize(384, 384, { fit: 'cover' })
    .webp({ quality: 85 })
    .toFile(`${out}/${name}.webp`);
  console.log(`${name}.webp`);
});
