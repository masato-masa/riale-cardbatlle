// ChatGPT で作った対戦相手の肖像（art-src/foes-sheet.png、3×3、紫の丸）を切って src/assets/art/ui/foe-*.webp へ。
// 並び: 毒・巨人・連撃 / 狙撃・割り込み・生贄 / 討伐・T一族・封印。丸の外の白は CSS の丸で隠す。
// 使い方: node scripts/slice-foes.mjs
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
/** シートと並び。foes-sheet-2（2×2）: 城塞の将軍・呪術師・死霊使い・聖騎士。 */
const SHEETS = {
  'foes-sheet': { cols: 3, names: ['poison', 'giant', 'combo', 'sniper', 'guard', 'sacrifice', 'hunter', 'clan', 'seal'] },
  'foes-sheet-2': { cols: 2, names: ['fortress', 'sorcerer', 'necro', 'paladin'] },
};
for (const [sheet, { cols, names }] of Object.entries(SHEETS)) {
const src = `${root}art-src/${sheet}.png`;
const { width } = await sharp(src).metadata();
const cell = Math.floor(width / cols);
for (const [i, name] of names.entries()) {
  await sharp(src)
    .extract({ left: (i % cols) * cell, top: Math.floor(i / cols) * cell, width: cell, height: cell })
    .resize(240, 240)
    .webp({ quality: 88 })
    .toFile(`${root}src/assets/art/ui/foe-${name}.webp`);
  console.log(`foe-${name}.webp`);
}
}
