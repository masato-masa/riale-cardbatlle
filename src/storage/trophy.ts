// トロフィーとアリーナ（クラロワ型の成長）。勝敗でトロフィーが増減し、閾値でアリーナが上がる。
// アリーナが上がると、出てくる相手デッキの幅が広がる。localStorage に入れる（読めなければ 0）。

import type { CpuLevel } from '@/ai/cpu';
import { RIVAL_DECKS } from '@/game/cards';

const KEY = 'riale-cardbatlle:trophies';

export interface Arena {
  name: string;
  /** このアリーナに入るトロフィー数。 */
  from: number;
  /** 出てくる相手デッキ（RIVAL_DECKS の name）。 */
  pool: string[];
  /** 床の絵の色味（CSS filter）。アリーナごとに見た目を変える。赤（相手）と青（自分）の陣地が分かるよう、色相は大きく回さない。 */
  tint: string;
  /** 宝箱から出るカードのコストの上限（アリーナが上がると重いカードが解放される）。 */
  cardCap: number;
  /** 負けたときに減る量の倍率。序盤は小さく（クラロワの序盤と同じく、負けてもほとんど減らない）。 */
  lossScale: number;
}

export const ARENAS: Arena[] = [
  // 最初のアリーナは、初期デッキ（normal の CPU で代用）が 5〜6 割勝てる相手だけ。商人は normal だと初期デッキに 78% 勝つので 2 つ目から
  { name: 'はじまりの広場', from: 0, pool: ['毒', '巨人', '連撃'], tint: 'none', cardCap: 4, lossScale: 0 },
  { name: '砂の闘技場', from: 150, pool: ['商人', '毒', '巨人', '連撃', '割り込み', '奇襲'], tint: 'none', cardCap: 6, lossScale: 0.5 },
  { name: '城門前', from: 400, pool: ['毒', '巨人', '連撃', '割り込み', '狙撃', '生贄', '討伐', '奇襲', '鉄壁'], tint: 'none', cardCap: 7, lossScale: 0.75 },
  { name: '王の間', from: 800, pool: ['巨人', '連撃', '割り込み', '狙撃', '生贄', '討伐', 'T一族', '封印', '城塞', '呪術', '死霊', '聖騎士', '鉄壁', '工房'], tint: 'none', cardCap: 8, lossScale: 1 },
  { name: '伝説の頂', from: 1300, pool: RIVAL_DECKS.map((d) => d.name), tint: 'none', cardCap: 10, lossScale: 1 },
];

/** そのコストのカードが宝箱から出始めるアリーナ。 */
export function arenaForCost(cost: number): number {
  const i = ARENAS.findIndex((a) => a.cardCap >= cost);
  return i < 0 ? ARENAS.length - 1 : i;
}

export function arenaIndex(trophies: number): number {
  let i = 0;
  ARENAS.forEach((a, k) => {
    if (trophies >= a.from) i = k;
  });
  return i;
}

/** 勝敗によるトロフィーの増減。強い CPU に勝つほど多く増える。 */
export function trophyDelta(level: CpuLevel, winner: 0 | 1 | null): number {
  if (winner === null) return 0;
  const win = { easy: 10, normal: 25, hard: 35 }[level];
  // 負けで減る量: 強い相手ほど勝ちの増え方を大きくし、負けの減り方もそれなりに（つよいだけ選べば得、にならないよう、勝率 40% で増減がほぼ 0）
  const lose = { easy: -10, normal: -18, hard: -24 }[level];
  return winner === 0 ? win : lose;
}

/** 増減を反映した新しいトロフィー数。いまのアリーナの下限より下には落ちない。 */
export function applyTrophies(trophies: number, level: CpuLevel, winner: 0 | 1 | null): number {
  const arena = ARENAS[arenaIndex(trophies)]!;
  const d = trophyDelta(level, winner);
  return Math.max(arena.from, trophies + (d < 0 ? Math.round(d * arena.lossScale) : d));
}

/** そのトロフィー数のアリーナで出る相手デッキ（シードで決まる）。 */
export function rivalFor(seed: number, trophies: number): { name: string; deck: (typeof RIVAL_DECKS)[number]['deck'] } {
  const pool = ARENAS[arenaIndex(trophies)]!.pool;
  const list = RIVAL_DECKS.filter((d) => pool.includes(d.name));
  return list[seed % list.length]!;
}

export function loadTrophies(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

export interface TrophyChange {
  before: number;
  after: number;
  arenaBefore: number;
  arenaAfter: number;
}

/** 決着を反映して保存し、変化を返す。 */
export function recordTrophies(level: CpuLevel, winner: 0 | 1 | null): TrophyChange {
  const before = loadTrophies();
  const after = applyTrophies(before, level, winner);
  // 最高は、いまの値を書き換える前に比べる（書いたあとだと自分自身と比べることになる）
  const best = loadBestTrophies();
  try {
    localStorage.setItem(KEY, String(after));
    if (after > best) localStorage.setItem(BEST_KEY, String(after));
  } catch {
    // 保存できなくても遊べる
  }
  return { before, after, arenaBefore: arenaIndex(before), arenaAfter: arenaIndex(after) };
}

const BEST_KEY = 'riale-cardbatlle:trophies-best';

/** これまでの最高トロフィー（記録が無ければ、いまのトロフィー）。 */
export function loadBestTrophies(): number {
  try {
    const v = Number(localStorage.getItem(BEST_KEY));
    return Math.max(Number.isFinite(v) ? v : 0, loadTrophies());
  } catch {
    return loadTrophies();
  }
}

const SEEN_KEY = 'riale-cardbatlle:arena-seen';

/** ホームで昇格の演出を見せたアリーナ（まだなら -1 ではなく 0。最初のアリーナは演出しない）。 */
export function loadArenaSeen(): number {
  try {
    const v = Number(localStorage.getItem(SEEN_KEY));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

export function saveArenaSeen(i: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(i));
  } catch {
    // 保存できなくても遊べる（次も演出が出るだけ）
  }
}
