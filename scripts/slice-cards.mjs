// ChatGPT で作ったカード絵のシート（art-src/cards-sheet-1..3.png、それぞれ 3×3）を 1 枚ずつに切って
// src/assets/art/ 以下へ出す。マスの順は左→右・上→下。境目のにじみを避けるため、各マスの内側 94% を使う。
// 使い方: node scripts/slice-cards.mjs
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));

/** シートごとの 9 マス。null は使わないマス。 */
const SHEETS = {
  1: [
    'cards/herald',
    'cards/miner',
    'cards/usurer',
    'cards/spy',
    'cards/craftsman',
    'cards/guard',
    'cards/banker',
    'cards/informer',
    'cards/taxman',
  ],
  2: [
    'cards/double',
    'cards/inspector',
    'cards/blockader',
    'cards/architect',
    'cards/boss',
    'cards/clerk',
    'buildings/wall',
    'buildings/exchange',
    'buildings/tradingHouse',
  ],
  3: [
    'buildings/factory',
    'buildings/cathedral',
    'buildings/fortress',
    'spells/quarry',
    'spells/quake',
    'spells/roadblock',
    'spells/festival',
    null,
    null,
  ],
};

for (const [n, cells] of Object.entries(SHEETS)) {
  const src = `${root}art-src/cards-sheet-${n}.png`;
  let meta;
  try {
    meta = await sharp(src).metadata();
  } catch {
    console.log(`sheet ${n}: なし（スキップ）`);
    continue;
  }
  const cw = meta.width / 3;
  const ch = meta.height / 3;
  const mx = Math.round(cw * 0.03);
  const my = Math.round(ch * 0.03);
  for (let i = 0; i < 9; i++) {
    const out = cells[i];
    if (!out) continue;
    const left = Math.round((i % 3) * cw) + mx;
    const top = Math.round(Math.floor(i / 3) * ch) + my;
    const file = `${root}src/assets/art/${out}.webp`;
    await mkdir(dirname(file), { recursive: true });
    await sharp(src)
      .extract({ left, top, width: Math.round(cw) - mx * 2, height: Math.round(ch) - my * 2 })
      .resize(400, 400, { fit: 'cover' })
      .webp({ quality: 86 })
      .toFile(file);
    console.log(`sheet ${n} #${i + 1} -> ${out}.webp`);
  }
}
