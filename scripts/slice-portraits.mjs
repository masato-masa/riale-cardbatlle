// ChatGPT で作った肖像の一枚絵（art-src/portraits-sheet.png、左=自分・右=相手）を、
// 正方形に切って src/assets/art/ui/ へ出す。円の外側の白は CSS の丸で隠すので、ここでは切るだけ。
// 使い方: node scripts/slice-portraits.mjs
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = `${root}art-src/portraits-sheet.png`;
const out = `${root}src/assets/art/ui`;
await mkdir(out, { recursive: true });

const { width, height } = await sharp(src).metadata();
// 左右に 1 人ずつ。幅の半分を一辺にして、円の中心が真ん中に来る
const side = Math.round(width / 2);
const top = Math.max(0, Math.round((height - side) / 2));
for (const [name, left] of [
  ['hero-me', 0],
  ['hero-foe', side],
]) {
  await sharp(src)
    .extract({ left, top, width: side, height: Math.min(side, height - top) })
    .resize(240, 240)
    .webp({ quality: 88 })
    .toFile(`${out}/${name}.webp`);
  console.log(`${name}.webp`);
}
