// カードの解放（成長）。最初は一部のカードだけ持っていて、対戦などでたまる「宝箱ポイント」を払って、
// ホームで宝箱を開ける（ガチャ）。開けると持っていないカードが 1 枚増える。
// URL に ?unlockall を付けると全部使える（確認用）。localStorage に保存する。

import { CARDS, STARTER_DECK, type CardId } from '@/game/cards';

import { ARENAS, arenaIndex, loadTrophies } from './trophy';

const UNLOCK_KEY = 'riale-cardbatlle:unlocked';
/** 以前の宝箱ゲージ（0〜1 点、2 点で自動で開いた）。読み込み時に新しいポイントへ移す。 */
const OLD_POINTS_KEY = 'riale-cardbatlle:points';
const POINTS_KEY = 'riale-cardbatlle:chest-points';
const NEW_KEY = 'riale-cardbatlle:new';

/** 宝箱 1 つを開けるのに払うポイント。 */
export const CHEST_COST = 20;

/** 宝箱ポイントの入り方（1 勝で宝箱 1 つ分）。 */
export const CHEST_GAIN = { win: 20, lose: 10, mission: 10, streak: 10, arenaUp: 20, challenge: 20 } as const;

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

/** いまの宝箱ポイント。 */
export function loadPoints(): number {
  try {
    const raw = localStorage.getItem(POINTS_KEY);
    if (raw === null) {
      // 以前のゲージ（1 点 = 新しい 10pt）を一度だけ移す
      const old = Number(localStorage.getItem(OLD_POINTS_KEY));
      const moved = Number.isFinite(old) && old > 0 ? Math.floor(old) * 10 : 0;
      savePoints(moved);
      localStorage.removeItem(OLD_POINTS_KEY);
      return moved;
    }
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

function savePoints(n: number): void {
  try {
    localStorage.setItem(POINTS_KEY, String(n));
  } catch {
    // 保存できなくても遊べる
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

/** 手に入れて、まだデッキ画面で見ていないカード（「NEW」の印）。 */
export function loadNew(): Set<CardId> {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(NEW_KEY) ?? '[]');
    return new Set(Array.isArray(list) ? list.filter((id): id is CardId => typeof id === 'string' && ALL.includes(id as CardId)) : []);
  } catch {
    return new Set();
  }
}

function saveNew(set: Set<CardId>): void {
  try {
    localStorage.setItem(NEW_KEY, JSON.stringify([...set]));
  } catch {
    // 保存できなくても遊べる
  }
}

/** 「NEW」の印を外す（カードの説明を開いたとき）。 */
export function markSeen(id: CardId): void {
  const set = loadNew();
  if (set.delete(id)) saveNew(set);
}

export interface MatchReward {
  /** この試合で得た宝箱ポイント。 */
  gained: number;
  /** いまの宝箱ポイント。 */
  points: number;
}

/** 決着を報告して、宝箱ポイントを足す。winner は 0=自分 / 1=相手 / null=引き分け。bonus はミッション・連勝・昇格・チャレンジのぶん（ポイント）。 */
export function awardMatch(winner: 0 | 1 | null, bonus = 0): MatchReward {
  const gained = (winner === 0 ? CHEST_GAIN.win : CHEST_GAIN.lose) + bonus;
  const points = loadPoints() + gained;
  savePoints(points);
  return { gained, points };
}

/** まだ持っていないカードがあるか（無ければ宝箱は開けない）。 */
export function hasLocked(): boolean {
  return pickReward(loadUnlocked(), () => 0) !== null;
}

/** 宝箱を 1 つ開ける（CHEST_COST を払う）。足りない・全部持っているときは null。 */
export function openChest(rand: () => number = Math.random): { card: CardId; points: number } | null {
  const points = loadPoints();
  if (points < CHEST_COST) return null;
  const unlocked = loadUnlocked();
  const card = pickReward(unlocked, rand, ARENAS[arenaIndex(loadTrophies())]!.cardCap);
  if (!card) return null;
  unlocked.add(card);
  if (!unlockAllByUrl()) saveUnlocked(unlocked);
  saveNew(new Set([...loadNew(), card]));
  savePoints(points - CHEST_COST);
  return { card, points: points - CHEST_COST };
}
