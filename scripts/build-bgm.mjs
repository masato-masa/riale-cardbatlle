// Suno で作った曲を src/assets/bgm/ へ取り込む。audio-src/bgm-home.mp3 → home.mp3、audio-src/bgm-battle.mp3 → battle.mp3。
// 無い曲は取り込まない（ゲームは合成の曲で流す）。使い方: node scripts/build-bgm.mjs
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
mkdirSync(`${root}src/assets/bgm`, { recursive: true });
for (const song of ['home', 'battle']) {
  const from = `${root}audio-src/bgm-${song}.mp3`;
  if (existsSync(from)) {
    copyFileSync(from, `${root}src/assets/bgm/${song}.mp3`);
    console.log(`${song}.mp3 を取り込みました`);
  } else console.log(`${song}: audio-src/bgm-${song}.mp3 が無いのでスキップ`);
}
