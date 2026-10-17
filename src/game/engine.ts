// ゲームの進行。純粋関数（同じ状態と操作から必ず同じ結果）。
// 時間は tick で進め、召喚と攻撃は好きな時刻に差し込む。

import { CARDS, isBlocker, type CardId } from './cards';
import { makeRng, shuffle } from './rng';
import {
  ATTACK_COOLDOWN_MS,
  COIN_MAX,
  COIN_START,
  coinRate,
  DOUBLE_COIN_FROM_MS,
  FIELD_SLOTS,
  HAND_SIZE,
  MATCH_MS,
  PLAYER_HP,
  SUMMON_DELAY_MS,
} from './rules';

export type PlayerIndex = 0 | 1;

export interface Unit {
  uid: number;
  card: CardId;
  hp: number;
  /** この時刻（ms）から攻撃できる。 */
  readyAt: number;
}

export interface PlayerState {
  hp: number;
  /** 端数つき。表示は切り捨て。 */
  coins: number;
  /** 手札。位置は固定で、使った位置に次のカードが入る。 */
  hand: CardId[];
  /** 山札。先頭が「次のカード」。使ったカードは末尾へ戻る。 */
  queue: CardId[];
  field: (Unit | null)[];
}

export type Target = { kind: 'player' } | { kind: 'unit'; uid: number };

export type GameEvent =
  | { id: number; kind: 'summon'; p: PlayerIndex; uid: number; slot: number }
  | {
      id: number;
      kind: 'attack';
      p: PlayerIndex;
      uid: number;
      target: Target;
      /** 与えたダメージ（攻撃した側 → 受けた側） */
      dealt: number;
      /** 反撃で受けたダメージ（カード同士のときだけ） */
      taken: number;
    }
  | { id: number; kind: 'death'; p: PlayerIndex; uid: number; card: CardId; slot: number }
  | { id: number; kind: 'end' };

/** id を付ける前の出来事。 */
type NewEvent = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, 'id'> : never) : never;

export interface GameResult {
  /** null は引き分け */
  winner: PlayerIndex | null;
  reason: 'hp' | 'time';
}

export interface GameState {
  time: number;
  players: [PlayerState, PlayerState];
  nextUid: number;
  nextEventId: number;
  /** 直近の出来事（画面の演出用）。古いものから捨てる。 */
  events: GameEvent[];
  result: GameResult | null;
}

export type Action =
  | { type: 'tick'; dt: number }
  | { type: 'summon'; p: PlayerIndex; handIndex: number; slot: number }
  | { type: 'attack'; p: PlayerIndex; uid: number; target: Target };

const EVENT_KEEP = 40;

function makePlayer(deck: readonly CardId[], rand: () => number): PlayerState {
  const order = shuffle(deck, rand);
  return {
    hp: PLAYER_HP,
    coins: COIN_START,
    hand: order.slice(0, HAND_SIZE),
    queue: order.slice(HAND_SIZE),
    field: Array.from({ length: FIELD_SLOTS }, () => null),
  };
}

export function createGame(decks: [readonly CardId[], readonly CardId[]], seed: number): GameState {
  const rand = makeRng(seed);
  return {
    time: 0,
    players: [makePlayer(decks[0], rand), makePlayer(decks[1], rand)],
    nextUid: 1,
    nextEventId: 1,
    events: [],
    result: null,
  };
}

export const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

export function findUnit(player: PlayerState, uid: number): { unit: Unit; slot: number } | null {
  for (let i = 0; i < player.field.length; i++) {
    const u = player.field[i];
    if (u && u.uid === uid) return { unit: u, slot: i };
  }
  return null;
}

/** p から見て、いま攻撃対象に選べる相手（ブロッカーがいればブロッカーだけ）。 */
export function legalTargets(state: GameState, p: PlayerIndex): Target[] {
  const foe = state.players[other(p)];
  const units = foe.field.filter((u): u is Unit => !!u);
  const blockers = units.filter((u) => isBlocker(u.card));
  if (blockers.length > 0) return blockers.map((u) => ({ kind: 'unit', uid: u.uid }));
  return [{ kind: 'player' }, ...units.map((u) => ({ kind: 'unit' as const, uid: u.uid }))];
}

export function isLegalTarget(state: GameState, p: PlayerIndex, target: Target): boolean {
  return legalTargets(state, p).some(
    (t) => t.kind === target.kind && (t.kind === 'player' || (target.kind === 'unit' && t.uid === target.uid)),
  );
}

export type SummonBlock = 'coins' | 'slot' | 'over' | null;

export function summonBlock(state: GameState, p: PlayerIndex, handIndex: number, slot: number): SummonBlock {
  if (state.result) return 'over';
  const pl = state.players[p];
  const card = pl.hand[handIndex];
  if (!card) return 'over';
  if (slot < 0 || slot >= FIELD_SLOTS || pl.field[slot]) return 'slot';
  if (pl.coins < CARDS[card].summon) return 'coins';
  return null;
}

export type AttackBlock = 'coins' | 'cooldown' | 'target' | 'over' | null;

export function attackBlock(state: GameState, p: PlayerIndex, uid: number, target?: Target): AttackBlock {
  if (state.result) return 'over';
  const pl = state.players[p];
  const found = findUnit(pl, uid);
  if (!found) return 'over';
  if (state.time < found.unit.readyAt) return 'cooldown';
  if (pl.coins < CARDS[found.unit.card].attackCost) return 'coins';
  if (target && !isLegalTarget(state, p, target)) return 'target';
  return null;
}

function withEvents(state: GameState, events: NewEvent[]): Pick<GameState, 'events' | 'nextEventId'> {
  let id = state.nextEventId;
  const added = events.map((e) => ({ ...e, id: id++ }) as GameEvent);
  return { events: [...state.events, ...added].slice(-EVENT_KEEP), nextEventId: id };
}

function setPlayer(players: GameState['players'], p: PlayerIndex, next: PlayerState): GameState['players'] {
  return p === 0 ? [next, players[1]] : [players[0], next];
}

/** HP による決着を確かめる。 */
function settle(state: GameState): GameState {
  if (state.result) return state;
  const [a, b] = state.players;
  if (a.hp > 0 && b.hp > 0) return state;
  const winner: PlayerIndex | null = a.hp <= 0 && b.hp <= 0 ? null : a.hp <= 0 ? 1 : 0;
  return { ...state, result: { winner, reason: 'hp' }, ...withEvents(state, [{ kind: 'end' }]) };
}

function tick(state: GameState, dt: number): GameState {
  if (state.result || dt <= 0) return state;
  const end = Math.min(MATCH_MS, state.time + dt);
  // 2 倍速の境目をまたぐときは分けて足す
  const split = state.time < DOUBLE_COIN_FROM_MS && end > DOUBLE_COIN_FROM_MS ? DOUBLE_COIN_FROM_MS : end;
  const grow = (coins: number): number =>
    Math.min(COIN_MAX, coins + (split - state.time) * coinRate(state.time) + (end - split) * coinRate(split));
  const players = state.players.map((pl) => ({ ...pl, coins: grow(pl.coins) })) as GameState['players'];
  const next: GameState = { ...state, time: end, players };
  if (end < MATCH_MS) return next;
  const [a, b] = players;
  const winner: PlayerIndex | null = a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1;
  return { ...next, result: { winner, reason: 'time' }, ...withEvents(next, [{ kind: 'end' }]) };
}

function summon(state: GameState, p: PlayerIndex, handIndex: number, slot: number): GameState {
  if (summonBlock(state, p, handIndex, slot)) return state;
  const pl = state.players[p];
  const card = pl.hand[handIndex]!;
  const [drawn, ...rest] = pl.queue;
  const hand = [...pl.hand];
  hand[handIndex] = drawn!;
  const field = [...pl.field];
  const uid = state.nextUid;
  field[slot] = { uid, card, hp: CARDS[card].hp, readyAt: state.time + SUMMON_DELAY_MS };
  const next: PlayerState = {
    ...pl,
    coins: pl.coins - CARDS[card].summon,
    hand,
    queue: [...rest, card],
    field,
  };
  return {
    ...state,
    players: setPlayer(state.players, p, next),
    nextUid: uid + 1,
    ...withEvents(state, [{ kind: 'summon', p, uid, slot }]),
  };
}

function attack(state: GameState, p: PlayerIndex, uid: number, target: Target): GameState {
  if (attackBlock(state, p, uid, target)) return state;
  const q = other(p);
  const me = state.players[p];
  const foe = state.players[q];
  const { unit, slot } = findUnit(me, uid)!;
  const def = CARDS[unit.card];
  const meField = [...me.field];
  const foeField = [...foe.field];
  let foeHp = foe.hp;
  let taken = 0;
  const events: NewEvent[] = [];

  if (target.kind === 'player') {
    foeHp = Math.max(0, foe.hp - def.atk);
    meField[slot] = { ...unit, readyAt: state.time + ATTACK_COOLDOWN_MS };
    events.push({ kind: 'attack', p, uid, target, dealt: def.atk, taken: 0 });
  } else {
    const hit = findUnit(foe, target.uid)!;
    taken = CARDS[hit.unit.card].atk;
    const myHp = unit.hp - taken;
    const theirHp = hit.unit.hp - def.atk;
    events.push({ kind: 'attack', p, uid, target, dealt: def.atk, taken });
    foeField[hit.slot] = theirHp > 0 ? { ...hit.unit, hp: theirHp } : null;
    meField[slot] = myHp > 0 ? { ...unit, hp: myHp, readyAt: state.time + ATTACK_COOLDOWN_MS } : null;
    if (theirHp <= 0) events.push({ kind: 'death', p: q, uid: hit.unit.uid, card: hit.unit.card, slot: hit.slot });
    if (myHp <= 0) events.push({ kind: 'death', p, uid, card: unit.card, slot });
  }

  let players = setPlayer(state.players, p, { ...me, coins: me.coins - def.attackCost, field: meField });
  players = setPlayer(players, q, { ...foe, hp: foeHp, field: foeField });
  return settle({ ...state, players, ...withEvents(state, events) });
}

export function step(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'tick':
      return tick(state, action.dt);
    case 'summon':
      return summon(state, action.p, action.handIndex, action.slot);
    case 'attack':
      return attack(state, action.p, action.uid, action.target);
  }
}

/** 最初の空き枠。無ければ -1。 */
export function firstEmptySlot(pl: PlayerState): number {
  return pl.field.findIndex((u) => !u);
}
