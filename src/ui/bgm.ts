// BGM。音声ファイルを持たず、WebAudio だけで合成する 8 小節のループ（曲の定義は sound-plan.ts の SONGS）。
//
// - ホーム用（home）: ゆったりしたパッド・ベース・分散和音・ときどき鐘。ドラムなし。
// - 対戦用（battle）: やわらかいキックとクラップの鼓動、弾むベース、16 分の分散和音、4 小節ごとの旋律。
//   終盤（コイン 2 倍）はテンポを上げ、フィルタを開き、ハットを倍にして気持ちを高める（setBgmTension）。
// - 曲はホームとデッキ画面で流れ続け、対戦に入ると切り替わる。効果音より約 14dB 下のバスに流す。
// - 1 小節ずつ、鳴らす少し前にまとめて予約する（タイマーのぶれで拍がずれない）。

import { getGraph, peekGraph } from './audio-graph';
import { bass, bell, clap, hat, kick, pad, pluck, type Ctx } from './instruments';
import { isBgmEnabled, isSoundEnabled } from './settings';

// Suno で作った曲（src/assets/bgm/home.mp3・battle.mp3）があれば、それをループで流す。無い曲は下の合成の曲で流す。
const trackUrls = import.meta.glob('../assets/bgm/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const trackUrl = (song: SongId): string | undefined => Object.entries(trackUrls).find(([p]) => p.endsWith(`/${song}.mp3`))?.[1];
/** 録音の曲の音量補正（dB）。 */
const TRACK_DB = -12;
const trackBuffers = new Map<SongId, Promise<AudioBuffer | null>>();
function loadTrack(ctx: BaseAudioContext, song: SongId): Promise<AudioBuffer | null> {
  const url = trackUrl(song);
  if (!url) return Promise.resolve(null);
  let p = trackBuffers.get(song);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((d) => ctx.decodeAudioData(d))
      .catch(() => null);
    trackBuffers.set(song, p);
  }
  return p;
}
import { barAt, beatSeconds, dbToGain, BGM_BUS_DB, moodFor, SONG_DB, SONGS, type Mood, type SongId } from './sound-plan';

/** 確認用の数（開発中だけ window.__cbBgm で見る）。 */
const stats = { bars: 0, starts: 0, stops: 0 };

// ---------------------------------------------------------------------------
// 1 小節の譜面を予約する（OfflineAudioContext でも同じものを鳴らせるよう BaseAudioContext を取る）

/** 対戦の旋律（4 小節ごと）。イ短調ペンタトニックの短いモチーフ。 */
const MOTIF_A = [76, 72, 74, 69];
const MOTIF_B = [79, 76, 74, 72];

/** 分散和音の並び（和音の 3 音の番号）。 */
const ARP_HOME = [0, 1, 2, 1, 2, 1, 2, 1];
const ARP_BATTLE = [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 1, 2, 1, 0];

/** index 小節目（ループ）を t0 から予約する。小節の長さ（秒）を返す。 */
export function scheduleBar(c: Ctx, dest: AudioNode, song: SongId, index: number, t0: number, mood: Mood): number {
  const def = SONGS[song];
  const bar = barAt(def, index);
  const beat = beatSeconds(mood.bpm);
  const len = beat * def.beatsPerBar;
  stats.bars++;

  if (song === 'home') {
    // パッド（小節をまたいで重ねて、つなぎ目を消す）
    pad(c, dest, t0 - 0.05, { midis: bar.chord, dur: len + 0.4, gain: 0.1, attack: 0.5, release: 0.6, cutoff: 1500, type: 'triangle' });
    // ベース: 小節の頭に 1 音（長め）
    bass(c, dest, t0, { midi: bar.root, dur: beat * 3.4, gain: 0.12 });
    // 分散和音（8 分）
    ARP_HOME.forEach((k, i) => {
      pluck(c, dest, t0 + (i * beat) / 2, { midi: bar.chord[k]! + 12, gain: i % 4 === 0 ? 0.085 : 0.055, dur: 0.5, bright: 0.4 });
    });
    // 鐘: 2 小節に 1 回、頭に高い音
    if (index % 2 === 0) bell(c, dest, t0 + beat * 0.02, { midi: bar.chord[2]! + 24, gain: 0.04, dur: 1.6 });
    return len;
  }

  // 対戦
  pad(c, dest, t0 - 0.04, { midis: bar.chord, dur: len + 0.3, gain: 0.09, attack: 0.3, release: 0.4, cutoff: 1500 });
  // ベース: 8 分の弾み（休みを入れて息をさせる）
  [0, 1, 3, 4, 6].forEach((i) => {
    bass(c, dest, t0 + (i * beat) / 2, { midi: bar.root + (i === 3 ? 12 : 0), dur: beat * 0.42, gain: 0.12 });
  });
  // キック: 1・3 拍と 4 拍の裏
  [0, 2].forEach((b) => kick(c, dest, t0 + b * beat, 0.3));
  kick(c, dest, t0 + beat * 3.5, 0.18);
  // クラップ: 2・4 拍
  [1, 3].forEach((b) => clap(c, dest, t0 + b * beat, 0.075));
  // ハット: 裏拍（緊張時は 8 分すべて）
  for (let i = 0; i < 8; i++) {
    if (mood.hatDensity === 1 && i % 2 === 0) continue;
    hat(c, dest, t0 + (i * beat) / 2, i % 2 === 1 ? 0.03 : 0.018);
  }
  // 分散和音（16 分）
  ARP_BATTLE.forEach((k, i) => {
    pluck(c, dest, t0 + (i * beat) / 4, { midi: bar.chord[k]! + 12, gain: i % 4 === 0 ? 0.075 : 0.05, dur: 0.2, bright: 0.45 });
  });
  // 旋律: 偶数小節の頭から 4 音（4 小節ごとに A、その間に B）
  if (index % 2 === 0 && index % 8 !== 6) {
    const motif = index % 4 === 0 ? MOTIF_A : MOTIF_B;
    motif.forEach((m, i) => pluck(c, dest, t0 + i * beat, { midi: m, gain: 0.095, dur: 0.6, bright: 0.65 }));
    bell(c, dest, t0, { midi: motif[0]! + 12, gain: 0.035, dur: 1.2 });
  }
  return len;
}

// ---------------------------------------------------------------------------
// 流す・止める

const LOOKAHEAD_S = 0.45;
const TICK_MS = 100;

interface Session {
  song: SongId;
  out: GainNode;
  timer: number;
  nextAt: number;
  bar: number;
  /** 録音の曲を流しているときの再生ノード（合成の曲では null）。 */
  src: AudioBufferSourceNode | null;
}

let session: Session | null = null;
/** 流したい曲（画面が求めている曲）。設定で切った・戻したときに使う。 */
let wanted: SongId | null = null;
let tense = false;

function mood(song: SongId): Mood {
  return moodFor(SONGS[song], tense);
}

function begin(song: SongId): void {
  if (session?.song === song) return;
  if (session) end(0.5);
  if (!isSoundEnabled() || !isBgmEnabled()) return;
  const g = getGraph();
  if (!g) return;
  const { ctx } = g;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  // ふわっと立ち上げる（いきなり鳴らさない）
  // 録音の曲は音が大きく仕上がっているので、効果音の下になるよう下げる（実測: そのままだと実効 −22dB で効果音より大きい）
  out.gain.exponentialRampToValueAtTime(dbToGain(SONG_DB[song] + (trackUrl(song) ? TRACK_DB : 0)), ctx.currentTime + 1.4);
  out.connect(g.bgmFilter);
  g.bgmBus.gain.setValueAtTime(dbToGain(BGM_BUS_DB), ctx.currentTime);
  g.bgmFilter.frequency.setValueAtTime(mood(song).cutoffHz, ctx.currentTime);
  const s: Session = { song, out, timer: 0, nextAt: ctx.currentTime + 0.12, bar: 0, src: null };
  session = s;
  stats.starts++;
  if (trackUrl(song)) {
    // 録音の曲: 読み込めたらループで流す（読み込めなければ合成の曲に切り替える）
    void loadTrack(ctx, song).then((buf) => {
      if (session !== s) return; // もう別の曲・停止
      if (buf) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.playbackRate.value = tense ? 1.05 : 1;
        src.connect(out);
        src.start();
        s.src = src;
      } else {
        startSynth(ctx, s);
      }
    });
    return;
  }
  startSynth(ctx, s);
}

function startSynth(ctx: AudioContext, s: Session): void {
  const tick = () => {
    while (s.nextAt < ctx.currentTime + LOOKAHEAD_S) {
      s.nextAt += scheduleBar(ctx, s.out, s.song, s.bar, s.nextAt, mood(s.song));
      s.bar++;
    }
  };
  tick();
  s.timer = window.setInterval(tick, TICK_MS);
}

function end(fadeS: number): void {
  const s = session;
  if (!s) return;
  session = null;
  window.clearInterval(s.timer);
  const ctx = s.out.context;
  const now = ctx.currentTime;
  s.out.gain.cancelScheduledValues(now);
  s.out.gain.setValueAtTime(Math.max(s.out.gain.value, 0.0001), now);
  s.out.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.02, fadeS));
  window.setTimeout(() => {
    try {
      s.src?.stop();
    } catch {
      // すでに止まっている
    }
    s.out.disconnect();
  }, (fadeS + 3) * 1000);
  stats.stops++;
}

/** 曲を流し始める（設定で切っていれば流さない）。同じ曲が流れていれば何もしない。 */
export function startBgm(song: SongId): void {
  wanted = song;
  tense = false;
  try {
    begin(song);
  } catch {
    // 鳴らせなくても続行
  }
}

/** 止める。fadeS 秒で消す。 */
export function stopBgm(fadeS = 0.6): void {
  wanted = null;
  try {
    end(fadeS);
  } catch {
    // 何もしない
  }
}

/** 設定の入切が変わった。流したい場面なら流し直す・止める。 */
export function refreshBgm(): void {
  try {
    if (wanted && isSoundEnabled() && isBgmEnabled()) begin(wanted);
    else end(0.3);
  } catch {
    // 何もしない
  }
}

/** 終盤の緊張（コイン 2 倍など）。次の小節からテンポが上がり、フィルタが開く。 */
export function setBgmTension(on: boolean): void {
  if (tense === on) return;
  tense = on;
  const g = peekGraph();
  if (!g || !session) return;
  try {
    g.bgmFilter.frequency.setTargetAtTime(mood(session.song).cutoffHz, g.ctx.currentTime, 0.8);
    if (session.src) session.src.playbackRate.setTargetAtTime(on ? 1.05 : 1, g.ctx.currentTime, 1.5);
  } catch {
    // 何もしない
  }
}

export function isBgmPlaying(): boolean {
  return session !== null;
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __cbBgm?: unknown }).__cbBgm = { stats, playing: isBgmPlaying };
}

/** 確認用: 曲を OfflineAudioContext で bars 小節ぶん書き出す（バスの音量・フィルタ込み、モノラル）。 */
export async function renderSong(song: SongId, bars: number, isTense = false, sampleRate = 32000): Promise<AudioBuffer> {
  const m = moodFor(SONGS[song], isTense);
  const len = beatSeconds(m.bpm) * SONGS[song].beatsPerBar * bars;
  const off = new OfflineAudioContext(1, Math.ceil((len + 1.5) * sampleRate), sampleRate);
  const filter = off.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = m.cutoffHz;
  filter.Q.value = 0.5;
  const bus = off.createGain();
  bus.gain.value = dbToGain(BGM_BUS_DB + SONG_DB[song]);
  filter.connect(bus);
  bus.connect(off.destination);
  let t = 0.05;
  for (let i = 0; i < bars; i++) t += scheduleBar(off, filter, song, i, t, m);
  return off.startRendering();
}

