// 効果音の定義。どの音も instruments.ts の部品を重ねて作る（録音ファイルは持たない）。
// 音程はすべてハ長調／イ短調のペンタトニック。重なっても濁らない。
// 各 voice は (コンテキスト, 出口, 開始時刻) を受け取る。sound.ts がゲームで鳴らし、
// 開発用の検査（audio lab）が OfflineAudioContext で同じものを書き出して測る。

import { bass, bell, clap, hat, kick, pad, pluck, swish, thump, tick, type Ctx } from './instruments';

export type VoiceName =
  | 'tap'
  | 'select'
  | 'pickup'
  | 'summonSmall'
  | 'summonBig'
  | 'hitUnit'
  | 'hitBlocker'
  | 'hitPlayer'
  | 'death'
  | 'ready'
  | 'heal'
  | 'stun'
  | 'barrier'
  | 'horn'
  | 'reject'
  | 'win'
  | 'lose'
  | 'battleStart'
  | 'spellCast';

export type Voice = (c: Ctx, dest: AudioNode, t: number) => void;

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

export const VOICES: Record<VoiceName, Voice> = {
  // ボタン・シート: 丸い小さな「ぽ」。毎回、同じ音階の中で少しだけ高さを変える
  tap: (c, d, t) => {
    pluck(c, d, t, { midi: pick([84, 86, 88]), gain: 0.2, dur: 0.12, bright: 0.25 });
  },

  // カードを選ぶ: 上がる 2 音
  select: (c, d, t) => {
    pluck(c, d, t, { midi: 79, gain: 0.18, dur: 0.16, bright: 0.35 });
    pluck(c, d, t + 0.055, { midi: pick([84, 86]), gain: 0.2, dur: 0.2, bright: 0.4 });
  },

  // 手札を持ち上げる: ふわっと浮く風と、小さな一音
  pickup: (c, d, t) => {
    swish(c, d, t, { dur: 0.16, f0: 700, f1: 2200, gain: 0.05, q: 0.9 });
    pluck(c, d, t + 0.02, { midi: 76, gain: 0.13, dur: 0.14, bright: 0.3 });
  },

  // 小さな召喚: すとんと据わり、2 音のきらめき
  summonSmall: (c, d, t) => {
    thump(c, d, t, { f0: 150, f1: 62, dur: 0.2, gain: 0.34 });
    swish(c, d, t, { dur: 0.18, f0: 900, f1: 220, gain: 0.07, q: 0.8 });
    pluck(c, d, t + 0.02, { midi: 72, gain: 0.16, dur: 0.22, bright: 0.45 });
    pluck(c, d, t + 0.075, { midi: 79, gain: 0.14, dur: 0.26, bright: 0.45 });
  },

  // 大きな召喚（コスト 5 以上）: 深いドンと、上がる 3 音と鐘
  summonBig: (c, d, t) => {
    thump(c, d, t, { f0: 120, f1: 46, dur: 0.32, gain: 0.5 });
    swish(c, d, t, { dur: 0.24, f0: 1100, f1: 160, gain: 0.09, q: 0.8 });
    [67, 72, 76].forEach((m, i) => pluck(c, d, t + 0.03 + i * 0.07, { midi: m, gain: 0.16, dur: 0.3, bright: 0.5 }));
    bell(c, d, t + 0.12, { midi: 84, gain: 0.1, dur: 0.9 });
  },

  // ユニットへの命中: 重すぎない「ドッ」と、肉と革の粒
  hitUnit: (c, d, t) => {
    thump(c, d, t, { f0: 260, f1: 110, dur: 0.13, gain: 0.3 });
    tick(c, d, t, { freq: 1500, gain: 0.3, dur: 0.05, q: 0.8 });
    pluck(c, d, t, { midi: 57, gain: 0.2, dur: 0.16, bright: 0.35 });
  },

  // ブロッカーに当たる: 金属の「キン」を重ねる
  hitBlocker: (c, d, t) => {
    thump(c, d, t, { f0: 220, f1: 100, dur: 0.12, gain: 0.26 });
    tick(c, d, t, { freq: 3000, gain: 0.14, dur: 0.03, q: 1.2 });
    bell(c, d, t, { midi: 88, gain: 0.11, dur: 0.55 });
    bell(c, d, t + 0.01, { midi: 95, gain: 0.05, dur: 0.35 });
  },

  // プレイヤーへの直撃: いちばん重い。低い胴鳴りが少し残る
  hitPlayer: (c, d, t) => {
    thump(c, d, t, { f0: 160, f1: 55, dur: 0.32, gain: 0.3 });
    tick(c, d, t, { freq: 1200, gain: 0.36, dur: 0.08, q: 0.7 });
    swish(c, d, t, { dur: 0.26, f0: 1000, f1: 160, gain: 0.14, q: 0.7 });
    pluck(c, d, t, { midi: 59, gain: 0.3, dur: 0.42, bright: 0.4 });
    pluck(c, d, t + 0.02, { midi: 64, gain: 0.18, dur: 0.3, bright: 0.45 });
  },

  // 倒れる: 下がる風と、すとんと落ちる 2 音
  death: (c, d, t) => {
    swish(c, d, t, { dur: 0.36, f0: 1000, f1: 140, gain: 0.09, q: 0.8 });
    pluck(c, d, t, { midi: 69, gain: 0.15, dur: 0.24, bright: 0.3 });
    pluck(c, d, t + 0.1, { midi: 64, gain: 0.14, dur: 0.3, bright: 0.3 });
    thump(c, d, t + 0.04, { f0: 160, f1: 60, dur: 0.22, gain: 0.2 });
  },

  // クールタイムが明けた: 高い小さな鐘 2 つ
  ready: (c, d, t) => {
    bell(c, d, t, { midi: 88, gain: 0.1, dur: 0.6 });
    bell(c, d, t + 0.07, { midi: 93, gain: 0.08, dur: 0.7 });
  },

  // 回復: 上がるきらめき
  heal: (c, d, t) => {
    [72, 76, 79, 84].forEach((m, i) => bell(c, d, t + i * 0.065, { midi: m, gain: 0.09, dur: 0.75 }));
  },

  // 足止め（氷・鎖）: 細かい粒と、冷たい高い鐘
  stun: (c, d, t) => {
    [0, 0.045, 0.09].forEach((dt, i) => tick(c, d, t + dt, { freq: 3200 - i * 300, gain: 0.1, dur: 0.03, q: 1.3 }));
    swish(c, d, t, { dur: 0.28, f0: 5000, f1: 1400, gain: 0.04, q: 1.4 });
    bell(c, d, t + 0.02, { midi: 93, gain: 0.07, dur: 0.55 });
  },

  // 結界が弾く: ガラスのような響き
  barrier: (c, d, t) => {
    bell(c, d, t, { midi: 91, gain: 0.1, dur: 0.6 });
    bell(c, d, t + 0.015, { midi: 98, gain: 0.05, dur: 0.45 });
    tick(c, d, t, { freq: 3800, gain: 0.07, dur: 0.02, q: 1.4 });
  },

  // コイン 2 倍・終盤の合図: あたたかい角笛（ブラスの和音がふくらむ）
  horn: (c, d, t) => {
    pad(c, d, t, { midis: [55, 62, 67], dur: 1.15, gain: 0.14, attack: 0.3, release: 0.5, cutoff: 1300 });
    thump(c, d, t, { f0: 100, f1: 60, dur: 0.3, gain: 0.18 });
    bell(c, d, t + 0.3, { midi: 79, gain: 0.06, dur: 0.9 });
  },

  // 打てない札: ぶつけない、低くてやわらかい 2 音
  reject: (c, d, t) => {
    pluck(c, d, t, { midi: 64, gain: 0.17, dur: 0.14, bright: 0.25 });
    pluck(c, d, t + 0.09, { midi: 60, gain: 0.15, dur: 0.18, bright: 0.25 });
  },

  // 勝ち: 上がる 5 音と、ふくらむ和音と、最後の鐘
  win: (c, d, t) => {
    kick(c, d, t, 0.4);
    [72, 76, 79, 84, 88].forEach((m, i) => {
      pluck(c, d, t + 0.04 + i * 0.11, { midi: m, gain: 0.17, dur: 0.4, bright: 0.55 });
    });
    pad(c, d, t + 0.35, { midis: [60, 64, 67, 72], dur: 2.5, gain: 0.12, attack: 0.18, release: 1.2, cutoff: 1500 });
    [84, 88, 91].forEach((m, i) => bell(c, d, t + 0.62 + i * 0.03, { midi: m, gain: 0.11, dur: 1.8 }));
    bass(c, d, t + 0.35, { midi: 48, dur: 1.6, gain: 0.2 });
  },

  // 負け: 静かに下がる 3 音と、暗めの和音。責めない音
  lose: (c, d, t) => {
    [69, 67, 64].forEach((m, i) => pluck(c, d, t + i * 0.2, { midi: m, gain: 0.15, dur: 0.5, bright: 0.25 }));
    pad(c, d, t + 0.2, { midis: [57, 60, 64], dur: 2.1, gain: 0.09, attack: 0.3, release: 1.0, cutoff: 800, type: 'triangle' });
    swish(c, d, t + 0.3, { dur: 0.7, f0: 1200, f1: 150, gain: 0.04, q: 0.7 });
  },

  // 対戦開始（VS の演出に合わせる）: 風が上がり、VS の瞬間にドンと鐘
  battleStart: (c, d, t) => {
    swish(c, d, t, { dur: 0.5, f0: 300, f1: 2600, gain: 0.08, q: 0.9 });
    thump(c, d, t + 0.45, { f0: 130, f1: 48, dur: 0.4, gain: 0.4 });
    pluck(c, d, t + 0.45, { midi: 55, gain: 0.2, dur: 0.5, bright: 0.4 });
    clap(c, d, t + 0.45, 0.1);
    [69, 76, 81].forEach((m, i) => bell(c, d, t + 0.45 + i * 0.02, { midi: m, gain: 0.1, dur: 1.2 }));
    hat(c, d, t + 0.45, 0.03);
  },

  // 呪文を唱える: 上がる風と、3 つのきらめき
  spellCast: (c, d, t) => {
    swish(c, d, t, { dur: 0.5, f0: 400, f1: 3200, gain: 0.05, q: 1.0 });
    [76, 81, 88].forEach((m, i) => bell(c, d, t + i * 0.12, { midi: m, gain: 0.07, dur: 0.8 }));
  },
};

/** 音ごとの音量の補正（dB）。実効音量を役割ごとの目標にそろえる（UI は小さく、命中・勝敗は大きく）。
 *  音を変えたら audio lab（window.__audioLab.reportVoices()）で測り直す。 */
export const VOICE_TRIM_DB: Record<VoiceName, number> = {
  tap: 7,
  select: 4,
  pickup: 6,
  summonSmall: 4,
  summonBig: 2,
  hitUnit: 9,
  hitBlocker: 4,
  hitPlayer: 2,
  death: 4,
  ready: 5,
  heal: 4,
  stun: 8,
  barrier: 6,
  horn: 8,
  reject: 5,
  win: 4,
  lose: 7,
  battleStart: 2,
  spellCast: 5,
};
