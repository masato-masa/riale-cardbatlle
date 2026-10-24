// Suno で作った曲を src/assets/bgm/ へ取り込む。audio-src/bgm-home.mp3 → home.mp3、audio-src/bgm-battle.mp3 → battle.mp3。
// スマホの通信量を抑えるため、ffmpeg（ffmpeg-static）で 96kbps・44.1kHz・ステレオに変換する（元は約 186kbps・48kHz）。
// 無い曲は取り込まない。使い方: node scripts/build-bgm.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ffmpeg = createRequire(import.meta.url)('ffmpeg-static');
const root = fileURLToPath(new URL('..', import.meta.url));
mkdirSync(`${root}src/assets/bgm`, { recursive: true });
for (const song of ['home', 'battle']) {
  const from = `${root}audio-src/bgm-${song}.mp3`;
  const to = `${root}src/assets/bgm/${song}.mp3`;
  if (!existsSync(from)) {
    console.log(`${song}: audio-src/bgm-${song}.mp3 が無いのでスキップ`);
    continue;
  }
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', from, '-map_metadata', '-1', '-ac', '2', '-ar', '44100', '-b:a', '96k', to]);
  console.log(`${song}.mp3: ${(statSync(from).size / 1e6).toFixed(2)}MB → ${(statSync(to).size / 1e6).toFixed(2)}MB`);
}
