// ChatGPT で作った宝箱（art-src/chest-sheet.png、純マゼンタ地に左=閉じた箱 / 右=開いた箱）を、
// 地を透かして src/assets/art/ui/ へ出す。使い方: node scripts/slice-chest.mjs
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = `${root}art-src/chest-sheet.png`;
const out = `${root}src/assets/art/ui`;
const { width, height } = await sharp(src).metadata();
const w = Math.floor(width / 2);

for (const [name, col] of [
  ['chest-closed', 0],
  ['chest-open', 1],
]) {
  const { data, info } = await sharp(src).extract({ left: col * w, top: 0, width: w, height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const m = Math.min(r, b) - g; // マゼンタらしさ（黄色い光の縁は G も高いので残る）
    if (m > 120) data[i + 3] = 0;
    else if (m > 60) {
      data[i + 3] = Math.round(255 * (1 - (m - 60) / 60));
    }
    // 残るピンク・紫のにじみは、緑に寄せて（光は黄色くなる）消す
    if (m > 12 && data[i + 3] > 0) {
      data[i] = Math.min(r, g + 12);
      data[i + 2] = Math.min(b, g + 12);
    }
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim()
    .resize(300, 300, { fit: 'inside' })
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(`${out}/${name}.webp`);
  console.log(`${name}.webp`);
}
