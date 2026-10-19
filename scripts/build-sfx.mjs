// ElevenLabs で生成した効果音（audio-src/<名前>-<番号>.wav、48kHz ステレオ）を、ゲーム用に軽くして
// src/assets/sfx/ へ出す。頭と尻の無音を切り、ピークをそろえ、音ごとの最大の長さで切って、24kHz モノラルにする。
// 使い方: node scripts/build-sfx.mjs
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = `${root}audio-src/`;
const out = `${root}src/assets/sfx/`;
mkdirSync(out, { recursive: true });

/** 音ごとの最大の長さ（秒）。 */
const MAX_S = {
  tap: 0.35, select: 0.6, summonSmall: 1.0, summonBig: 1.6, hitUnit: 0.8, hitBlocker: 0.9, hitPlayer: 1.3,
  death: 1.2, ready: 0.9, heal: 1.4, barrier: 0.9, horn: 2.0, win: 4.0, lose: 4.0, battleStart: 2.2, spellCast: 1.6,
};
/** 音ごとの目標の実効音量（dBFS）。UI は小さく、命中・勝敗は大きく。合成音の検査（audio lab）と同じ物差し。 */
const TARGET_RMS_DB = {
  tap: -30, select: -29, summonSmall: -25, summonBig: -22, hitUnit: -25, hitBlocker: -26, hitPlayer: -22,
  death: -27, ready: -29, heal: -27, barrier: -28, horn: -26, win: -21, lose: -25, battleStart: -22, spellCast: -28,
};
/** 取り込んだファイル名 → ゲームの音の名前。 */
const RENAME = { spell: 'spellCast' };

function readWav(buf) {
  let p = 12;
  let fmt = null;
  let data = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: buf.readUInt16LE(p + 10), sr: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) };
    if (id === 'data') data = buf.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size % 2);
  }
  if (!fmt || !data || fmt.bits !== 16) throw new Error('16bit PCM の WAV ではありません');
  const frames = Math.floor(data.length / (2 * fmt.ch));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < fmt.ch; c++) s += data.readInt16LE((i * fmt.ch + c) * 2) / 32768;
    mono[i] = s / fmt.ch;
  }
  return { sr: fmt.sr, mono };
}

function writeWav(path, samples, sr) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  writeFileSync(path, buf);
}

let count = 0;
for (const f of readdirSync(src).filter((x) => x.endsWith('.wav')).sort()) {
  const m = /^(\w+)-(\d+)\.wav$/.exec(f);
  if (!m) continue;
  const name = RENAME[m[1]] ?? m[1];
  const { sr, mono } = readWav(readFileSync(src + f));
  // 24kHz にする（2 サンプルずつ平均。48kHz のとき）
  const k = Math.max(1, Math.round(sr / 24000));
  const down = new Float32Array(Math.floor(mono.length / k));
  for (let i = 0; i < down.length; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += mono[i * k + j];
    down[i] = s / k;
  }
  const rate = Math.round(sr / k);
  let peak = 0;
  for (const v of down) peak = Math.max(peak, Math.abs(v));
  if (peak <= 0) continue;
  const th = peak * 0.02;
  let a = 0;
  while (a < down.length && Math.abs(down[a]) < th) a++;
  a = Math.max(0, a - Math.floor(rate * 0.004));
  let b = down.length;
  while (b > a && Math.abs(down[b - 1]) < th * 0.5) b--;
  const maxLen = Math.floor(rate * (MAX_S[name] ?? 1.5));
  const len = Math.max(1, Math.min(b - a, maxLen));
  const o = new Float32Array(len);
  for (let i = 0; i < len; i++) o[i] = down[a + i] / peak;
  // 実効音量（RMS）を目標にそろえる。ピークは 0.95 を超えない（超えるぶんは下げる）
  let sum = 0;
  for (let i = 0; i < len; i++) sum += o[i] * o[i];
  const rms = Math.sqrt(sum / len);
  const target = Math.pow(10, (TARGET_RMS_DB[name] ?? -26) / 20);
  const gain = Math.min(target / Math.max(rms, 1e-6), 0.95);
  for (let i = 0; i < len; i++) o[i] *= gain;
  // 終わりのフェード（切り口のプツ音を消す。長さで切ったときは長め）
  const fade = Math.min(len, Math.floor(rate * (b - a > maxLen ? 0.12 : 0.02)));
  for (let i = 0; i < fade; i++) o[len - 1 - i] *= i / fade;
  writeWav(`${out}${name}-${m[2]}.wav`, o, rate);
  count++;
}
console.log(`${count} 個を src/assets/sfx/ へ`);
