// ChatGPT で作った UI アイコンのシート（純マゼンタ地）を、地を透かして src/assets/art/ui/ へ出す。
// icons-sheet（2×2）: トロフィー・巻物（ミッション）・本（戦績）・盾の紋章（アリーナ）。
// tabs-sheet（2×2）: タブ（デッキ・バトル・設定）と一時停止。
// states-sheet（3×3、8 つ）: カードの状態（ブロッカー・結界・ステルス・遅延・毒・封印・攻撃不能・不屈）。
// 紫やピンクを含むアイコンもあるので、純マゼンタからの色の距離で透かす（slice-result.mjs と同じ）。
// 使い方: node scripts/slice-icons.mjs
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}src/assets/art/ui`;

/** シートと、マスの名前（左上から右へ、上から下へ）。null は使わないマス。 */
const SHEETS = {
  'icons-sheet': { cols: 2, size: 128, names: ['icon-trophy', 'icon-mission', 'icon-stats', 'icon-arena'] },
  'tabs-sheet': { cols: 2, size: 128, names: ['tab-deck', 'tab-battle', 'tab-settings', 'icon-pause'] },
  'states-sheet': {
    cols: 3,
    size: 96,
    names: ['state-blocker', 'state-barrier', 'state-stealth', 'state-stun', 'state-poison', 'state-seal', 'state-disarm', 'state-diehard', null],
  },
};

for (const [sheet, { cols, size, names }] of Object.entries(SHEETS)) {
  const src = `${root}art-src/${sheet}.png`;
  const { width, height } = await sharp(src).metadata();
  const w = Math.floor(width / cols);
  const h = Math.floor(height / cols);
  for (const [k, name] of names.entries()) {
    if (!name) continue;
    const { data, info } = await sharp(src)
      .extract({ left: (k % cols) * w, top: Math.floor(k / cols) * h, width: w, height: h })
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
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90, alphaQuality: 100 })
      .toFile(`${out}/${name}.webp`);
    console.log(`${name}.webp`);
  }
}
