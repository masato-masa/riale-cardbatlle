// ChatGPT で作った UI アイコン（art-src/icons-sheet.png、純マゼンタ地に 2×2）を、地を透かして src/assets/art/ui/ へ出す。
// icons-sheet: トロフィー・巻物（ミッション）・本（戦績）・盾の紋章（アリーナ）。tabs-sheet: タブ 3 つと一時停止。透かし方は slice-pips.mjs と同じ。
// 使い方: node scripts/slice-icons.mjs
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}src/assets/art/ui`;

/** シートと、2×2 のマスの名前（左上・右上・左下・右下）。tabs-sheet はタブ（デッキ・バトル・設定）と一時停止。 */
const SHEETS = {
  'icons-sheet': ['icon-trophy', 'icon-mission', 'icon-stats', 'icon-arena'],
  'tabs-sheet': ['tab-deck', 'tab-battle', 'tab-settings', 'icon-pause'],
};

for (const [sheet, names] of Object.entries(SHEETS)) {
const src = `${root}art-src/${sheet}.png`;
const { width, height } = await sharp(src).metadata();
const w = Math.floor(width / 2);
const h = Math.floor(height / 2);
for (const [k, name] of names.entries()) {
  const col = k % 2;
  const row = Math.floor(k / 2);
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
}
