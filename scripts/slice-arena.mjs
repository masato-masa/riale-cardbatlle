// ChatGPT で作った盤面の床（art-src/arena-sheet.png、縦長 2:3）を軽くして src/assets/art/arena.webp に出す。
// 金の帯（仕切り）は縦 44% あたり。絵を差し替えたら Game.tsx の FLOOR_W / FLOOR_H / FLOOR_BAND を測り直す。
// 使い方: node scripts/slice-arena.mjs
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
await sharp(`${root}art-src/arena-sheet.png`)
  .resize(800, 1200, { fit: 'cover' })
  .webp({ quality: 82 })
  .toFile(`${root}src/assets/art/arena.webp`);
console.log('arena.webp 800x1200');

// デッキ編成画面の背景（軍の作戦室。art-src/deck-bg-sheet.png、縦長 2:3）
await sharp(`${root}art-src/deck-bg-sheet.png`)
  .resize(800, 1200, { fit: 'cover' })
  .webp({ quality: 80 })
  .toFile(`${root}src/assets/art/deck-bg.webp`);
console.log('deck-bg.webp 800x1200');
