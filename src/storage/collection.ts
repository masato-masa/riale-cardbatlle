// カードの解放（成長）。最初は一部のカードだけ持っていて、対戦するたびにたまる「ポイント」で
// 宝箱が開き、持っていないカードが 1 枚増える。勝ち=2 点、引き分け・負け=1 点、2 点で宝箱 1 つ。
// URL に ?unlockall を付けると全部使える（確認用）。localStorage に保存する。

import { CARDS, STARTER_DECK, type CardId } from '@/game/cards';
import { MAX_CARD_LEVEL } from '@/game/engine';

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

const LEVEL_KEY = 'riale-cardbatlle:levels';

/** 次のレベルに上がるのに要る重ね枚数（Lv1→2 は 1 枚、2→3 は 2 枚…）。 */
export function copiesToNext(level: number): number {
  return level;
}

export interface CardProgress {
  level: number;
  /** いまのレベルで重ねた枚数。 */
  copies: number;
}

export function loadProgress(): Partial<Record<CardId, CardProgress>> {
  try {
    const raw = localStorage.getItem(LEVEL_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as Record<string, { level?: unknown; copies?: unknown }>;
    const out: Partial<Record<CardId, CardProgress>> = {};
    for (const [id, v] of Object.entries(obj)) {
      if (!ALL.includes(id as CardId)) continue;
      const level = typeof v.level === 'number' ? Math.max(1, Math.min(MAX_CARD_LEVEL, Math.floor(v.level))) : 1;
      const copies = typeof v.copies === 'number' && v.copies >= 0 ? Math.floor(v.copies) : 0;
      out[id as CardId] = { level, copies };
    }
    return out;
  } catch {
    return {};
  }
}

/** 対戦に渡すレベル表（Lv1 は省く）。 */
export function loadLevels(): Partial<Record<CardId, number>> {
  const out: Partial<Record<CardId, number>> = {};
  for (const [id, p] of Object.entries(loadProgress())) if (p && p.level > 1) out[id as CardId] = p.level;
  return out;
}

/** 同じカードを 1 枚重ねる。必要枚数に届けばレベルが上がる。 */
export function addCopy(progress: Partial<Record<CardId, CardProgress>>, id: CardId): { level: number; leveledUp: boolean } {
  const cur = progress[id] ?? { level: 1, copies: 0 };
  if (cur.level >= MAX_CARD_LEVEL) return { level: cur.level, leveledUp: false };
  cur.copies += 1;
  let leveledUp = false;
  if (cur.copies >= copiesToNext(cur.level)) {
    cur.level += 1;
    cur.copies = 0;
    leveledUp = true;
  }
  progress[id] = cur;
  return { level: cur.level, leveledUp };
}

/** 宝箱で、持っているカードの重ね（レベル上げ）が出る確率。新しいカードが無ければ必ず重ね。 */
export const COPY_CHANCE = 0.45;

export interface RewardItem {
  card: CardId;
  /** 新しく手に入ったカードか（false なら重ね）。 */
  isNew: boolean;
  level: number;
  leveledUp: boolean;
}

export interface MatchReward {
  /** この試合で得た点。 */
  gained: number;
  /** 宝箱から出たカード（出なければ空）。 */
  cards: CardId[];
  /** 宝箱の中身の詳細（新しいカードか、重ねてレベルが上がったか）。 */
  items: RewardItem[];
  /** いまたまっている点（宝箱の次のゲージ）。 */
  points: number;
}

/** 決着を報告して、ポイントと宝箱の中身を更新する。winner は 0=自分 / 1=相手 / null=引き分け。 */
export function awardMatch(winner: 0 | 1 | null, rand: () => number = Math.random): MatchReward {
  const gained = winner === 0 ? 2 : 1;
  let total = loadPoints() + gained;
  const unlocked = loadUnlocked();
  const progress = loadProgress();
  const cap = ARENAS[arenaIndex(loadTrophies())]!.cardCap;
  const items: RewardItem[] = [];
  while (total >= CHEST_POINTS) {
    total -= CHEST_POINTS;
    const fresh = rand() < COPY_CHANCE ? null : pickReward(unlocked, rand, cap);
    if (fresh) {
      unlocked.add(fresh);
      items.push({ card: fresh, isNew: true, level: 1, leveledUp: false });
      continue;
    }
    // 重ね: 持っていて、まだ最大レベルでないカードから（安いカードほど出やすい）
    const owned = [...unlocked].filter((id) => (progress[id]?.level ?? 1) < MAX_CARD_LEVEL);
    if (owned.length === 0) {
      const c = pickReward(unlocked, rand, cap);
      if (c) {
        unlocked.add(c);
        items.push({ card: c, isNew: true, level: 1, leveledUp: false });
      }
      continue;
    }
    const sum = owned.reduce((n, id) => n + weight(id), 0);
    let r = rand() * sum;
    let pick = owned[owned.length - 1]!;
    for (const id of owned) {
      r -= weight(id);
      if (r <= 0) {
        pick = id;
        break;
      }
    }
    const res = addCopy(progress, pick);
    items.push({ card: pick, isNew: false, level: res.level, leveledUp: res.leveledUp });
  }
  const cards = items.map((x) => x.card);
  if (!unlockAllByUrl()) saveUnlocked(unlocked);
  try {
    localStorage.setItem(LEVEL_KEY, JSON.stringify(progress));
  } catch {
    // 保存できなくても遊べる
  }
  try {
    localStorage.setItem(POINTS_KEY, String(total));
  } catch {
    // 保存できなくても遊べる
  }
  return { gained, cards, items, points: total };
}
