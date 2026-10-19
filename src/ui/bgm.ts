// BGM。Suno で作った曲（src/assets/bgm/home.mp3・battle.mp3、scripts/build-bgm.mjs で取り込み）をループで流す。
//
// - ホームとデッキ画面ではホームの曲、対戦中は対戦の曲。切り替えはゆっくりフェードする。
// - 効果音より下のバス（BGM_BUS_DB と曲ごとの SONG_DB）に流す。
// - 終盤（コイン 2 倍）は少し速くする（setBgmTension）。
// - 曲は <audio> で、ページを開いた時点から先読みし、読み込みながら再生する（始まるまで待たない）。
// - 曲のファイルが無い・読み込めないときは、BGM は鳴らさない（コードで合成した音は使わない）。

import { getGraph } from './audio-graph';
import { isBgmEnabled, isSoundEnabled } from './settings';
import { BGM_BUS_DB, dbToGain, SONG_DB, type SongId } from './sound-plan';

const trackUrls = import.meta.glob('../assets/bgm/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const trackUrl = (song: SongId): string | undefined => Object.entries(trackUrls).find(([p]) => p.endsWith(`/${song}.mp3`))?.[1];
/** 曲ごとの <audio>。ページを開いた時点から読み込みを始める（再生は最初の操作のあと）ので、曲が始まるまで待たない。 */
const players = new Map<SongId, { el: HTMLAudioElement; node: MediaElementAudioSourceNode | null }>();
function playerOf(song: SongId): { el: HTMLAudioElement; node: MediaElementAudioSourceNode | null } | null {
  const url = trackUrl(song);
  if (!url || typeof Audio === 'undefined') return null;
  let p = players.get(song);
  if (!p) {
    const el = new Audio(url);
    el.preload = 'auto';
    el.loop = true;
    p = { el, node: null };
    players.set(song, p);
  }
  return p;
}
if (typeof window !== 'undefined') for (const song of ['home', 'battle'] as const) playerOf(song);

/** 確認用の数（開発中だけ window.__cbBgm で見る）。 */
const stats = { starts: 0, stops: 0 };

interface Session {
  song: SongId;
  out: GainNode;
}

let session: Session | null = null;
/** 流したい曲（画面が求めている曲）。設定で切った・戻したときに使う。 */
let wanted: SongId | null = null;
let tense = false;

function begin(song: SongId): void {
  if (session?.song === song) return;
  if (session) end(0.5);
  if (!isSoundEnabled() || !isBgmEnabled()) return;
  const g = getGraph();
  if (!g) return;
  const { ctx } = g;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  // 少しだけふわっと立ち上げる（0.3 秒）
  out.gain.exponentialRampToValueAtTime(dbToGain(SONG_DB[song]), ctx.currentTime + 0.3);
  out.connect(g.bgmFilter);
  g.bgmBus.gain.setValueAtTime(dbToGain(BGM_BUS_DB), ctx.currentTime);
  const s: Session = { song, out };
  session = s;
  stats.starts++;
  const p = playerOf(song);
  if (!p) return; // 曲のファイルが無い
  if (!p.node) p.node = ctx.createMediaElementSource(p.el);
  p.node.disconnect();
  p.node.connect(out);
  p.el.currentTime = 0;
  p.el.playbackRate = tense ? 1.05 : 1;
  void p.el.play().catch(() => {
    // 再生を許されなかった（最初の操作の前など）。最初の操作で、もう一度始める
    if (session === s) session = null;
    armRetry();
  });
}

let retryArmed = false;
function armRetry(): void {
  if (retryArmed || typeof window === 'undefined') return;
  retryArmed = true;
  const events = ['pointerdown', 'touchend', 'click', 'keydown'];
  const go = () => {
    for (const ev of events) window.removeEventListener(ev, go, true);
    retryArmed = false;
    // 操作の「あと」に始める（ブラウザが操作と認めたあとの再生なら通る）
    window.setTimeout(() => {
      try {
        if (wanted && !session) begin(wanted);
      } catch {
        // 何もしない
      }
    }, 0);
  };
  for (const ev of events) window.addEventListener(ev, go, true);
}

function end(fadeS: number): void {
  const s = session;
  if (!s) return;
  session = null;
  const ctx = s.out.context;
  const now = ctx.currentTime;
  s.out.gain.cancelScheduledValues(now);
  s.out.gain.setValueAtTime(Math.max(s.out.gain.value, 0.0001), now);
  s.out.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.02, fadeS));
  window.setTimeout(() => {
    // 次の曲がまだ始まっていなければ止める（同じ曲が始まり直していたら、そのまま）
    if (session?.song !== s.song) players.get(s.song)?.el.pause();
    s.out.disconnect();
  }, (fadeS + 0.2) * 1000);
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

/** 終盤の緊張（コイン 2 倍など）。曲が少し速くなる。 */
export function setBgmTension(on: boolean): void {
  if (tense === on) return;
  tense = on;
  if (!session) return;
  const el = players.get(session.song)?.el;
  if (el) el.playbackRate = on ? 1.05 : 1;
}

export function isBgmPlaying(): boolean {
  return session !== null;
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __cbBgm?: unknown }).__cbBgm = {
    stats,
    playing: isBgmPlaying,
    players: () => [...players].map(([k, v]) => ({ song: k, paused: v.el.paused, ready: v.el.readyState, t: v.el.currentTime, err: v.el.error?.code, node: !!v.node })),
  };
}
