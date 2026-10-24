// ChatGPT で作った結果画面の素材（art-src/result-sheet.png、純マゼンタ地に 2×2）を、地を透かして src/assets/art/ui/ へ出す。
// 左上=光る星 / 右上=くすんだ星 / 左下=勝ちのリボン（青）/ 右下=負けのリボン（赤紫）。
// 赤紫のリボンはマゼンタに近いので、slice-pips.mjs の「マゼンタらしさ」ではなく、純マゼンタからの色の距離で透かす。
// 使い方: node scripts/slice-result.mjs
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = `${root}art-src/result-sheet.png`;
const out = `${root}src/assets/art/ui`;
const { width, height } = await sharp(src).metadata();
const w = Math.floor(width / 2);
const h = Math.floor(height / 2);

for (const [name, col, row, size] of [
  ['star-on', 0, 0, [128, 128]],
  ['star-off', 1, 0, [128, 128]],
  ['ribbon-win', 0, 1, [480, 200]],
  ['ribbon-lose', 1, 1, [480, 200]],
]) {
  const { data, info } = await sharp(src)
    .extract({ left: col * w, top: row * h, width: w, height: h })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const d = 255 - data[i] + data[i + 1] + (255 - data[i + 2]); // 純マゼンタからの距離
    if (d < 90) data[i + 3] = 0;
    else if (d < 160) data[i + 3] = Math.round((255 * (d - 90)) / 70);
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim()
    .resize(size[0], size[1], { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(`${out}/${name}.webp`);
  console.log(`${name}.webp`);
}
