// 音の「決めごと」だけを集めた純粋関数・定数（WebAudio に触らない）。
//
// - 音量: 効果音と BGM のバスの差、BGM の曲ごとの音量
// - 間引き: 直前の音から近すぎる音を落とす（濁り防止）
// - 曲: ホーム用と対戦用の和音進行・テンポ・緊張時の変化

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  return gain <= 0 ? -Infinity : 20 * Math.log10(gain);
}

// ---------------------------------------------------------------------------
// 音量（dB）

/** 効果音バス。 */
export const SFX_BUS_DB = 0;
/** BGM バス。効果音の約 3〜8dB 下（BGM は効果音の邪魔をしない、背景で心地よく流れる大きさ）。 */
export const BGM_BUS_DB = -6;
/** 曲ごとの音量の補正（曲の厚みの違いをそろえる）。 */
export const SONG_DB = { home: 2, battle: 1 } as const;

// ---------------------------------------------------------------------------
// 間引き

/** この時間（ms）より近く続けて鳴る音は間引く。 */
export const THROTTLE_MS = 45;

/** 鳴らすか。force（勝敗・合図など）は必ず鳴らす。 */
export function shouldPlay(now: number, lastPlayedAt: number, force: boolean): boolean {
  return force || now - lastPlayedAt >= THROTTLE_MS;
}

// ---------------------------------------------------------------------------
// 曲

export type SongId = 'home' | 'battle';

export interface Bar {
  name: string;
  /** ベースの音（MIDI）。 */
  root: number;
  /** パッド・分散和音に使う和音（MIDI、3 音）。 */
  chord: [number, number, number];
}

const C: Bar = { name: 'C', root: 48, chord: [60, 64, 67] };
const G: Bar = { name: 'G', root: 43, chord: [59, 62, 67] };
const Am: Bar = { name: 'Am', root: 45, chord: [57, 60, 64] };
const F: Bar = { name: 'F', root: 41, chord: [57, 60, 65] };
const Em: Bar = { name: 'Em', root: 40, chord: [55, 59, 64] };

export interface SongDef {
  id: SongId;
  bpm: number;
  beatsPerBar: number;
  bars: Bar[];
}

export const SONGS: Record<SongId, SongDef> = {
  // ホーム: ゆったり、あたたかい。明るい進行（I-V-vi-IV）
  home: { id: 'home', bpm: 78, beatsPerBar: 4, bars: [C, G, Am, F, C, G, F, G] },
  // 対戦: 鼓動のあるビートで前へ進む。イ短調の進行で勇ましく（vi-IV-I-V）
  battle: { id: 'battle', bpm: 104, beatsPerBar: 4, bars: [Am, F, C, G, Am, F, G, Em] },
};

export interface Mood {
  bpm: number;
  /** BGM 全体のローパス（Hz）。緊張すると開く。 */
  cutoffHz: number;
  /** ハットの刻み（1=裏拍だけ、2=8 分すべて）。 */
  hatDensity: 1 | 2;
  tense: boolean;
}

/** 終盤（コイン 2 倍）の緊張: 少し速く、明るく、刻みを倍に。 */
export const TENSE_BPM_UP = 14;

export function moodFor(song: SongDef, tense: boolean): Mood {
  return {
    bpm: song.bpm + (tense ? TENSE_BPM_UP : 0),
    cutoffHz: tense ? 5200 : 3200,
    hatDensity: tense ? 2 : 1,
    tense,
  };
}

export function beatSeconds(bpm: number): number {
  return 60 / bpm;
}

export function barAt(song: SongDef, index: number): Bar {
  return song.bars[((index % song.bars.length) + song.bars.length) % song.bars.length]!;
}
