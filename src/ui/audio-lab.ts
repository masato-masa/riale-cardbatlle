// 開発用の音の検査（DEV のときだけ読み込む。window.__audioLab に生える）。
// 効果音・BGM を OfflineAudioContext で書き出し、ピーク・実効音量・余韻・高音の割合などを数える。
// 耳で確かめられないとき（自動の検査）に、「割れていないか・うるさくないか・刺さらないか」を数字で見る。

import { makeImpulse } from './audio-graph';
import { renderSong } from './bgm';
import { VOICES, VOICE_TRIM_DB, type VoiceName } from './sfx-voices';
import { dbToGain } from './sound-plan';
import type { SongId } from './sound-plan';

export interface Report {
  name: string;
  /** 全体のピーク（dBFS） */
  peakDb: number;
  /** 音のある部分の実効音量（dBFS） */
  rmsDb: number;
  /** ピークから -50dB まで落ちるのにかかる時間（秒） */
  tailS: number;
  /** ピークの 90% に届くまで（ms）。小さいほど鋭い。 */
  attackMs: number;
  /** スペクトルの重心（Hz）。高いほど明るい（耳に刺さりやすい）。 */
  centroidHz: number;
  /** 6kHz 以上のエネルギーの割合（%）。 */
  highPct: number;
  /** 200Hz 以下のエネルギーの割合（%）。 */
  lowPct: number;
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export function analyze(name: string, data: Float32Array, sr: number): Report {
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]!));
  const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));
  // 10ms ごとの実効値の並びから、音のある範囲と余韻を求める
  const win = Math.floor(sr * 0.01);
  const rmsSeries: number[] = [];
  for (let i = 0; i + win <= data.length; i += win) {
    let s = 0;
    for (let k = 0; k < win; k++) s += data[i + k]! * data[i + k]!;
    rmsSeries.push(Math.sqrt(s / win));
  }
  const maxR = Math.max(...rmsSeries, 1e-9);
  const floor = maxR * Math.pow(10, -50 / 20);
  let first = rmsSeries.findIndex((r) => r > floor);
  let last = rmsSeries.length - 1;
  while (last > 0 && rmsSeries[last]! <= floor) last--;
  if (first < 0) first = 0;
  let sum = 0;
  let cnt = 0;
  for (let i = first; i <= last; i++) {
    sum += rmsSeries[i]! * rmsSeries[i]!;
    cnt++;
  }
  const rms = Math.sqrt(sum / Math.max(1, cnt));
  const tailS = ((last + 1) * win) / sr;
  let attackIdx = 0;
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]!) >= peak * 0.9) {
      attackIdx = i;
      break;
    }
  }
  // スペクトル: 8192 点の窓を半分ずつずらして平均
  const N = 8192;
  const power = new Float64Array(N / 2);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const start = Math.max(0, first * win);
  const end = Math.min(data.length, (last + 1) * win);
  for (let off = start; off + N <= end + N / 2; off += N / 2) {
    for (let i = 0; i < N; i++) {
      const v = data[off + i] ?? 0;
      re[i] = v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < N / 2; k++) power[k]! += re[k]! * re[k]! + im[k]! * im[k]!;
  }
  let tot = 0;
  let wsum = 0;
  let hi = 0;
  let lo = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = (k * sr) / N;
    const p = power[k]!;
    tot += p;
    wsum += p * f;
    if (f >= 6000) hi += p;
    if (f <= 200) lo += p;
  }
  return {
    name,
    peakDb: round(db(peak)),
    rmsDb: round(db(rms)),
    tailS: round(tailS),
    attackMs: round((attackIdx / sr) * 1000),
    centroidHz: Math.round(wsum / Math.max(tot, 1e-12)),
    highPct: round((hi / Math.max(tot, 1e-12)) * 100),
    lowPct: round((lo / Math.max(tot, 1e-12)) * 100),
  };
}

function round(x: number): number {
  return Math.round(x * 10) / 10;
}

const SR = 44100;

/** 効果音を、実際と同じ残響をくぐらせて書き出す（モノラルに混ぜる）。 */
export async function renderVoice(name: VoiceName, seconds = 3.5): Promise<Float32Array> {
  const off = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
  const bus = off.createGain();
  const sendG = off.createGain();
  sendG.gain.value = 0.26;
  const conv = off.createConvolver();
  conv.buffer = makeImpulse(off);
  const ret = off.createGain();
  ret.gain.value = 0.8;
  bus.connect(off.destination);
  bus.connect(sendG);
  sendG.connect(conv);
  conv.connect(ret);
  ret.connect(off.destination);
  const trim = off.createGain();
  trim.gain.value = dbToGain(VOICE_TRIM_DB[name]);
  trim.connect(bus);
  VOICES[name](off, trim, 0.01);
  const buf = await off.startRendering();
  const a = buf.getChannelData(0);
  const b = buf.getChannelData(1);
  const mono = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) mono[i] = (a[i]! + b[i]!) / 2;
  return mono;
}

export async function reportVoices(): Promise<Report[]> {
  const out: Report[] = [];
  for (const name of Object.keys(VOICES) as VoiceName[]) out.push(analyze(name, await renderVoice(name), SR));
  return out;
}

export async function reportSong(song: SongId, bars = 8, tense = false): Promise<Report> {
  const buf = await renderSong(song, bars, tense, 32000);
  return analyze(`${song}${tense ? '(tense)' : ''}`, buf.getChannelData(0), buf.sampleRate);
}

if (typeof window !== 'undefined') {
  (window as unknown as { __audioLab?: unknown }).__audioLab = { reportVoices, reportSong, renderVoice, analyze };
}
