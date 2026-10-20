// ChatGPT で作った数字の台座（art-src/pips-sheet.png、純マゼンタ地に 2×2）を、地を透かして
// src/assets/art/ui/ へ出す。左上=コイン / 右上=攻撃 / 左下=HP / 右下=クールタイム。
// 使い方: node scripts/slice-pips.mjs
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = `${root}art-src/pips-sheet.png`;
const out = `${root}src/assets/art/ui`;
const { width, height } = await sharp(src).metadata();
const w = Math.floor(width / 2);
const h = Math.floor(height / 2);

for (const [name, col, row] of [
  ['pip-coin', 0, 0],
  ['pip-atk', 1, 0],
  ['pip-hp', 0, 1],
  ['pip-cd', 1, 1],
]) {
  const { data, info } = await sharp(src)
    .extract({ left: col * w, top: row * h, width: w, height: h })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // マゼンタ（R・B が高く G が低い）を透明に。縁は距離でなめらかに、残るピンクの縁は除く。
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const m = Math.min(r, b) - g; // マゼンタらしさ
    if (m > 110) data[i + 3] = 0;
    else if (m > 50) {
      data[i + 3] = Math.round(255 * (1 - (m - 50) / 60));
      // ピンクがにじむぶんを抑える
      data[i] = Math.min(r, g + 40);
      data[i + 2] = Math.min(b, g + 40);
    }
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim()
    .resize(160, 160, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(`${out}/${name}.webp`);
  console.log(`${name}.webp`);
}
