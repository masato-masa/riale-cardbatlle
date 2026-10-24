// カードの解放（成長）。最初は一部のカードだけ持っていて、対戦するたびにたまる「ポイント」で
// 宝箱が開き、持っていないカードが 1 枚増える。勝ち=2 点、引き分け・負け=1 点、2 点で宝箱 1 つ。
// URL に ?unlockall を付けると全部使える（確認用）。localStorage に保存する。

import { CARDS, STARTER_DECK, type CardId } from '@/game/cards';

import { ARENAS, arenaIndex, loadTrophies } from './trophy';

const UNLOCK_KEY = 'riale-cardbatlle:unlocked';
const POINTS_KEY = 'riale-cardbatlle:points';

/** 点がここまでたまると宝箱が 1 つ開く。 */
export const CHEST_POINTS = 2;

const ALL: CardId[] = (Object.keys(CARDS) as CardId[]).filter((id) => !CARDS[id].token);

/** 最初から持っているカード。 */
export const START_CARDS: CardId[] = [...STARTER_DECK, 'architect', 'recruit', 'footman', 'lancer', 'captain', 'medic'];

const ALL_KEY = 'riale-cardbatlle:unlockall';

/** テスト用: 全カード解放（設定で入れる。URL の ?unlockall でも入る）。 */
export function isUnlockAll(): boolean {
  try {
    if (new URLSearchParams(location.search).has('unlockall')) return true;
    return localStorage.getItem(ALL_KEY) === '1';
  } catch {
    return false;
  }
}

export function setUnlockAll(on: boolean): void {
  try {
    if (on) localStorage.setItem(ALL_KEY, '1');
    else localStorage.removeItem(ALL_KEY);
  } catch {
    // 保存できなくても、この場では効く
  }
}

function unlockAllByUrl(): boolean {
  return isUnlockAll();
}

export function loadUnlocked(): Set<CardId> {
  if (unlockAllByUrl()) return new Set(ALL);
  const out = new Set<CardId>(START_CARDS);
  try {
    const raw = localStorage.getItem(UNLOCK_KEY);
    if (raw) {
      const list: unknown = JSON.parse(raw);
      if (Array.isArray(list)) for (const id of list) if (typeof id === 'string' && ALL.includes(id as CardId)) out.add(id as CardId);
    }
  } catch {
    // 読めなければ最初のカードだけ
  }
  return out;
}

function saveUnlocked(set: Set<CardId>): void {
  try {
    localStorage.setItem(UNLOCK_KEY, JSON.stringify([...set]));
  } catch {
    // 保存できなくても遊べる
  }
}

export function loadPoints(): number {
  try {
    const v = Number(localStorage.getItem(POINTS_KEY));
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) % CHEST_POINTS : 0;
  } catch {
    return 0;
  }
}

/** 安いカードから先に手に入りやすい重み（成長がなだらかになる）。 */
function weight(id: CardId): number {
  const c = CARDS[id].summon;
  return c <= 4 ? 3 : c <= 6 ? 2 : 1;
}

/** 持っていないカードを 1 枚選ぶ（全部持っていれば null）。cap はアリーナで解放されているコストの上限。
 *  上限以下を持ちきったら、上限を超えたカードから選ぶ（宝箱が空にならないように）。 */
export function pickReward(unlocked: Set<CardId>, rand: () => number, cap = Infinity): CardId | null {
  const notYet = ALL.filter((id) => !unlocked.has(id));
  const inCap = notYet.filter((id) => CARDS[id].summon <= cap);
  const locked = inCap.length > 0 ? inCap : notYet;
  if (locked.length === 0) return null;
  const total = locked.reduce((n, id) => n + weight(id), 0);
  let r = rand() * total;
  for (const id of locked) {
    r -= weight(id);
    if (r <= 0) return id;
  }
  return locked[locked.length - 1]!;
}

export interface MatchReward {
  /** この試合で得た点。 */
  gained: number;
  /** 宝箱から出たカード（出なければ空）。 */
  cards: CardId[];
  /** いまたまっている点（宝箱の次のゲージ）。 */
  points: number;
}

/** 決着を報告して、ポイントと宝箱の中身を更新する。winner は 0=自分 / 1=相手 / null=引き分け。bonus はデイリーミッションの達成ぶん。 */
export function awardMatch(winner: 0 | 1 | null, rand: () => number = Math.random, bonus = 0): MatchReward {
  const gained = (winner === 0 ? 2 : 1) + bonus;
  let total = loadPoints() + gained;
  const unlocked = loadUnlocked();
  const cards: CardId[] = [];
  while (total >= CHEST_POINTS) {
    total -= CHEST_POINTS;
    const c = pickReward(unlocked, rand, ARENAS[arenaIndex(loadTrophies())]!.cardCap);
    if (c) {
      unlocked.add(c);
      cards.push(c);
    }
  }
  if (!unlockAllByUrl()) saveUnlocked(unlocked);
  try {
    localStorage.setItem(POINTS_KEY, String(total));
  } catch {
    // 保存できなくても遊べる
  }
  return { gained, cards, points: total };
}
