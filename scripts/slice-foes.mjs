// ChatGPT で作った対戦相手の肖像（art-src/foes-sheet.png、3×3、紫の丸）を切って src/assets/art/ui/foe-*.webp へ。
// 並び: 毒・巨人・連撃 / 狙撃・割り込み・生贄 / 討伐・T一族・封印。丸の外の白は CSS の丸で隠す。
// 使い方: node scripts/slice-foes.mjs
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = `${root}art-src/foes-sheet.png`;
const names = ['poison', 'giant', 'combo', 'sniper', 'guard', 'sacrifice', 'hunter', 'clan', 'seal'];
const { width } = await sharp(src).metadata();
const cell = Math.floor(width / 3);
for (const [i, name] of names.entries()) {
  await sharp(src)
    .extract({ left: (i % 3) * cell, top: Math.floor(i / 3) * cell, width: cell, height: cell })
    .resize(240, 240)
    .webp({ quality: 88 })
    .toFile(`${root}src/assets/art/ui/foe-${name}.webp`);
  console.log(`foe-${name}.webp`);
}
