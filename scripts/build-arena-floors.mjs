// アリーナごとの盤面の地を作る。元の盤面（src/assets/art/arena.webp: 壁・松明・旗・金の帯・赤い敵陣/青い自陣）の
// 床の部分だけを、ChatGPT で作ったテーマ違いの床（art-src/floor-2..5.png）に差し替える。
// 壁と金の帯は元の絵のまま残し、新しい床には敵陣=赤み・自陣=青みを掛けて、どちらの陣地かの区別を保つ。
// 出力: src/assets/art/arena-2..5.webp。使い方: node scripts/build-arena-floors.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const W = 800;
const H = 1200;
/** 床の内側（壁を除く）と、残す金の帯の上下。元の絵の実測。 */
const IN = { left: 44, top: 36, right: 756, bottom: 1148 };
const BAND = { top: 492, bottom: 582 };
const MID = 540;

/** 床の差し替えに使う不透明度の型（内側の長方形を少しぼかし、帯の部分は抜く）。 */
async function mask() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><filter id="b"><feGaussianBlur stdDeviation="6"/></filter></defs>
    <g filter="url(#b)">
      <rect x="${IN.left}" y="${IN.top}" width="${IN.right - IN.left}" height="${BAND.top - IN.top}" fill="#fff"/>
      <rect x="${IN.left}" y="${BAND.bottom}" width="${IN.right - IN.left}" height="${IN.bottom - BAND.bottom}" fill="#fff"/>
      <!-- 四隅の松明の台は元の絵のまま残す -->
      <rect x="0" y="0" width="118" height="140" fill="#000"/>
      <rect x="${W - 118}" y="0" width="118" height="140" fill="#000"/>
      <rect x="0" y="${H - 190}" width="118" height="190" fill="#000"/>
      <rect x="${W - 118}" y="${H - 190}" width="118" height="190" fill="#000"/>
      <!-- 上下の中央の旗の台も残す -->
      <rect x="330" y="0" width="140" height="70" fill="#000"/>
      <rect x="330" y="${H - 90}" width="140" height="90" fill="#000"/>
    </g></svg>`;
  return sharp(Buffer.from(svg)).extractChannel(0).raw().toBuffer();
}

const alpha = await mask();
for (const n of [2, 3, 4, 5]) {
  const floor = await sharp(`${root}art-src/floor-${n}.png`).resize(W, H, { fit: 'cover' }).removeAlpha().toBuffer();
  // 敵陣（上）は赤み、自陣（下）は青みを掛ける（乗算）
  const tint = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${MID}" fill="rgb(245,182,172)"/>
      <rect y="${MID}" width="${W}" height="${H - MID}" fill="rgb(178,196,236)"/>
    </svg>`,
  );
  const tinted = await sharp(floor).composite([{ input: tint, blend: 'multiply' }]).removeAlpha().raw().toBuffer();
  // 不透明度の型を付けて、元の盤面の上に重ねる
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4] = tinted[i * 3];
    rgba[i * 4 + 1] = tinted[i * 3 + 1];
    rgba[i * 4 + 2] = tinted[i * 3 + 2];
    rgba[i * 4 + 3] = alpha[i];
  }
  const layer = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  await sharp(`${root}src/assets/art/arena.webp`).composite([{ input: layer }]).webp({ quality: 84 }).toFile(`${root}src/assets/art/arena-${n}.webp`);
  console.log(`arena-${n}.webp`);
}
