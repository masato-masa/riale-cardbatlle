// 音の「決めごと」だけを集めた純粋関数・定数（WebAudio に触らない）。
// 音は録音のみ（効果音=ElevenLabs、BGM=Suno）。コードで合成した音は使わない。

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
/** BGM バス。 */
export const BGM_BUS_DB = -6;
/** 曲ごとの音量の補正（dB）。録音の曲は大きく仕上がっているので、効果音の下になるよう下げる
 *  （実測: ホーム −36dB・対戦 −39dB。効果音は −22〜−30dB）。曲を差し替えたら測り直す。 */
export const SONG_DB = { home: -10, battle: -11 } as const;

// ---------------------------------------------------------------------------
// 間引き

/** この時間（ms）より近く続けて鳴る音は間引く。 */
export const THROTTLE_MS = 45;

/** 鳴らすか。force（勝敗・合図など）は必ず鳴らす。 */
export function shouldPlay(now: number, lastPlayedAt: number, force: boolean): boolean {
  return force || now - lastPlayedAt >= THROTTLE_MS;
}

export type SongId = 'home' | 'battle';
