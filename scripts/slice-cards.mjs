// ChatGPT で作ったカード絵のシート（art-src/cards-sheet-1..4.png。1〜3 は 3×3、4 は 3 列×2 行）を 1 枚ずつに切って
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
  // 追加の 40 枚（シート 5〜9。3×3）
  5: ['recruit', 'footman', 'lancer', 'knight', 'captain', 'warlord', 'champion', 'ogre', 'dragoon'].map((n) => `cards/${n}`),
  6: ['needle', 'medic', 'bulwark', 'creeper', 'marksman', 'twin', 'bloody', 'bard', 'sealer'].map((n) => `cards/${n}`),
  7: ['binder', 'poisoner', 'stalwart', 'drummer', 'duelist', 'sniper', 'priest', 'bloodknight', 'hexer'].map((n) => `cards/${n}`),
  8: [
    ...['raider', 'martyr', 'warden', 'ironwall', 'banner', 'reaper'].map((n) => `cards/${n}`),
    ...['infirmary', 'altar', 'forge'].map((n) => `buildings/${n}`),
  ],
  9: [...['rain', 'warcry', 'miasma', 'edict'].map((n) => `spells/${n}`), null, null, null, null, null],
  10: ['warder', 'shieldmaid', 'ambusher', 'gatekeeper', 'diehard', 'berserk', 'offering', 'bomber', 'heir'].map((n) => `cards/${n}`),
  11: [...['phoenix', 'usurper', 'conqueror'].map((n) => `cards/${n}`), 'spells/parry', null, null, null, null, null],
  12: [...['trickster', 'monarch', 'riposte', 'avenger'].map((n) => `cards/${n}`), null, null, null, null, null],
  13: [...['hunter', 'slayer'].map((n) => `cards/${n}`), null, null, null, null, null, null, null],
  14: [...['vampire', 'plunderer'].map((n) => `cards/${n}`), null, null, null, null, null, null, null],
  15: [...['sentinel', 'swindler'].map((n) => `cards/${n}`), null, null, null, null, null, null, null],
  16: ['spells/ambush', 'cards/militia', null, null, null, null, null, null, null],
  // 3 列×2 行（縦長のマス）。切り札ユニット 5 人と予備 1 枚
  4: {
    cols: 3,
    rows: 2,
    cells: ['cards/veteran', 'cards/executioner', 'cards/strategist', 'cards/colossus', 'cards/archmage', null],
  },
};

for (const [n, def] of Object.entries(SHEETS)) {
  const { cols, rows, cells } = Array.isArray(def) ? { cols: 3, rows: 3, cells: def } : def;
  const src = `${root}art-src/cards-sheet-${n}.png`;
  let meta;
  try {
    meta = await sharp(src).metadata();
  } catch {
    console.log(`sheet ${n}: なし（スキップ）`);
    continue;
  }
  const cw = meta.width / cols;
  const ch = meta.height / rows;
  const mx = Math.round(cw * 0.03);
  const my = Math.round(ch * 0.03);
  for (let i = 0; i < cols * rows; i++) {
    const out = cells[i];
    if (!out) continue;
    const left = Math.round((i % cols) * cw) + mx;
    const top = Math.round(Math.floor(i / cols) * ch) + my;
    const file = `${root}src/assets/art/${out}.webp`;
    await mkdir(dirname(file), { recursive: true });
    await sharp(src)
      .extract({ left, top, width: Math.round(cw) - mx * 2, height: Math.round(ch) - my * 2 })
      // 縦長のマス（3 列×2 行のシート）は 4:5 のまま、顔のある上寄りを残して切る
      .resize(400, ch > cw * 1.2 ? 500 : 400, { fit: 'cover', position: ch > cw * 1.2 ? 'north' : 'centre' })
      .webp({ quality: 86 })
      .toFile(file);
    console.log(`sheet ${n} #${i + 1} -> ${out}.webp`);
  }
}
