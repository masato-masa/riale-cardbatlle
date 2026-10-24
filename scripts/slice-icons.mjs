// ChatGPT で作った UI アイコン（art-src/icons-sheet.png、純マゼンタ地に 2×2）を、地を透かして src/assets/art/ui/ へ出す。
// 左上=トロフィー / 右上=巻物（ミッション）/ 左下=本（戦績）/ 右下=盾の紋章（アリーナ）。透かし方は slice-pips.mjs と同じ。
// 使い方: node scripts/slice-icons.mjs
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = `${root}art-src/icons-sheet.png`;
const out = `${root}src/assets/art/ui`;
const { width, height } = await sharp(src).metadata();
const w = Math.floor(width / 2);
const h = Math.floor(height / 2);

for (const [name, col, row] of [
  ['icon-trophy', 0, 0],
  ['icon-mission', 1, 0],
  ['icon-stats', 0, 1],
  ['icon-arena', 1, 1],
]) {
  const { data, info } = await sharp(src)
    .extract({ left: col * w, top: row * h, width: w, height: h })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const m = Math.min(r, b) - g; // マゼンタらしさ
    if (m > 110) data[i + 3] = 0;
    else if (m > 50) {
      data[i + 3] = Math.round(255 * (1 - (m - 50) / 60));
      data[i] = Math.min(r, g + 40);
      data[i + 2] = Math.min(b, g + 40);
    }
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim()
    .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(`${out}/${name}.webp`);
  console.log(`${name}.webp`);
}
