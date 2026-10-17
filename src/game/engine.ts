// ゲームの進行。純粋関数（同じ状態と操作から必ず同じ結果）。
// 時間は tick で進め、召喚と攻撃は好きな時刻に差し込む。

import { CARDS, isBlocker, needsTarget, requiresTarget, type CardId } from './cards';
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
  /** 結界がまだ残っているか。 */
  barrier: boolean;
  /** 建築物が次に効く時刻（生産・砲撃）。無ければ null。 */
  pulseAt: number | null;
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
  | { id: number; kind: 'summon'; p: PlayerIndex; uid: number; slot: number; card: CardId; token: boolean }
  | { id: number; kind: 'attack'; p: PlayerIndex; uid: number; target: Target }
  /** p は受けた側。amount は実際に減った HP。guard は防いだ理由。 */
  | { id: number; kind: 'damage'; p: PlayerIndex; target: Target; amount: number; guard: 'barrier' | 'armor' | null }
  | { id: number; kind: 'heal'; p: PlayerIndex; amount: number }
  | { id: number; kind: 'stun'; p: PlayerIndex; uid: number }
  /** クールタイムがなくなった（祝祭） */
  | { id: number; kind: 'ready'; p: PlayerIndex; uid: number }
  /** 呪文を使った。target は単体の呪文で選んだ相手のカード。 */
  | { id: number; kind: 'spell'; p: PlayerIndex; card: CardId; target: number | null }
  /** 建築物が効いた（生産・砲撃） */
  | { id: number; kind: 'pulse'; p: PlayerIndex; uid: number }
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
  /** target は「狙撃」「足止」・単体の呪文で選んだ相手のカード。狙撃・足止は無ければ空振り。
   *  呪文は場に出ないので slot は見ない（-1 でよい）。 */
  | { type: 'summon'; p: PlayerIndex; handIndex: number; slot: number; target?: number }
  | { type: 'attack'; p: PlayerIndex; uid: number; target: Target };

const EVENT_KEEP = 60;

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

export function units(player: PlayerState): Unit[] {
  return player.field.filter((u): u is Unit => !!u);
}

/** 場が全部うまっている（壁）。 */
export function isWalled(player: PlayerState): boolean {
  return player.field.every((u) => !!u);
}

/** 鼓舞を含めた攻撃力。建築物は 0。 */
export function attackOf(player: PlayerState, unit: Unit): number {
  if (CARDS[unit.card].type !== 'unit') return 0;
  let rally = 0;
  for (const u of player.field) if (u && u.uid !== unit.uid) rally += CARDS[u.card].ab.rally ?? 0;
  return CARDS[unit.card].atk + rally;
}

/** コインのたまる速さの倍率（増収を含む）。 */
export function coinBoostOf(player: PlayerState): number {
  let boost = 1;
  for (const u of player.field) if (u) boost += CARDS[u.card].ab.coinBoost ?? 0;
  return boost;
}

/** p から見て、いま攻撃対象に選べる相手。ブロッカーがいればブロッカーだけ、壁ならプレイヤーは選べない。 */
export function legalTargets(state: GameState, p: PlayerIndex): Target[] {
  const foe = state.players[other(p)];
  const all = units(foe);
  const blockers = all.filter((u) => isBlocker(u.card));
  if (blockers.length > 0) return blockers.map((u) => ({ kind: 'unit', uid: u.uid }));
  const list: Target[] = all.map((u) => ({ kind: 'unit' as const, uid: u.uid }));
  if (!isWalled(foe)) list.unshift({ kind: 'player' });
  return list;
}

export function isLegalTarget(state: GameState, p: PlayerIndex, target: Target): boolean {
  return legalTargets(state, p).some(
    (t) => t.kind === target.kind && (t.kind === 'player' || (target.kind === 'unit' && t.uid === target.uid)),
  );
}

/** そのプレイヤーのユニットのクールタイム（祈りで縮む。最短で 40%）。 */
export function cooldownOf(player: PlayerState): number {
  let cut = 0;
  for (const u of player.field) if (u) cut += CARDS[u.card].ab.cooldownCut ?? 0;
  return Math.round(ATTACK_COOLDOWN_MS * Math.max(0.4, 1 - cut));
}

export type SummonBlock = 'coins' | 'slot' | 'target' | 'over' | null;

export function summonBlock(
  state: GameState,
  p: PlayerIndex,
  handIndex: number,
  slot: number,
  target?: number,
): SummonBlock {
  if (state.result) return 'over';
  const pl = state.players[p];
  const card = pl.hand[handIndex];
  if (!card) return 'over';
  if (pl.coins < CARDS[card].summon) return 'coins';
  if (CARDS[card].type === 'spell') {
    if (requiresTarget(card) && (target === undefined || !findUnit(state.players[other(p)], target))) return 'target';
    return null;
  }
  if (slot < 0 || slot >= FIELD_SLOTS || pl.field[slot]) return 'slot';
  return null;
}

export type AttackBlock = 'building' | 'cooldown' | 'target' | 'over' | null;

export function attackBlock(state: GameState, p: PlayerIndex, uid: number, target?: Target): AttackBlock {
  if (state.result) return 'over';
  const pl = state.players[p];
  const found = findUnit(pl, uid);
  if (!found) return 'over';
  if (CARDS[found.unit.card].type !== 'unit') return 'building';
  if (state.time < found.unit.readyAt) return 'cooldown';
  if (target && !isLegalTarget(state, p, target)) return 'target';
  return null;
}

// ---------------------------------------------------------------------------
// 1 つの操作の中だけで使う、書き換えてよい写し

interface Draft {
  time: number;
  players: [PlayerState, PlayerState];
  nextUid: number;
  events: NewEvent[];
}

function draftOf(state: GameState): Draft {
  const copy = (pl: PlayerState): PlayerState => ({
    ...pl,
    hand: [...pl.hand],
    queue: [...pl.queue],
    field: pl.field.map((u) => (u ? { ...u } : null)),
  });
  return { time: state.time, players: [copy(state.players[0]), copy(state.players[1])], nextUid: state.nextUid, events: [] };
}

/** カードにダメージを与える（結界・鉄壁を通す）。 */
function hurtUnit(d: Draft, p: PlayerIndex, unit: Unit, amount: number): void {
  if (amount <= 0) return;
  if (unit.barrier) {
    unit.barrier = false;
    d.events.push({ kind: 'damage', p, target: { kind: 'unit', uid: unit.uid }, amount: 0, guard: 'barrier' });
    return;
  }
  const armor = CARDS[unit.card].ab.armor ?? 0;
  const dealt = Math.max(0, amount - armor);
  unit.hp -= dealt;
  d.events.push({ kind: 'damage', p, target: { kind: 'unit', uid: unit.uid }, amount: dealt, guard: armor > 0 ? 'armor' : null });
}

function hurtPlayer(d: Draft, p: PlayerIndex, amount: number): void {
  if (amount <= 0) return;
  const pl = d.players[p];
  const dealt = Math.min(pl.hp, amount);
  pl.hp -= dealt;
  d.events.push({ kind: 'damage', p, target: { kind: 'player' }, amount: dealt, guard: null });
}

/** HP が 0 になったカードを場から除き、遺言を起こす。遺言で倒れるカードは無いので 1 回で済む。 */
function sweepDead(d: Draft): void {
  for (const p of [0, 1] as const) {
    const pl = d.players[p];
    pl.field.forEach((u, slot) => {
      if (!u || u.hp > 0) return;
      pl.field[slot] = null;
      d.events.push({ kind: 'death', p, uid: u.uid, card: u.card, slot });
      const od = CARDS[u.card].ab.onDeath;
      if (od?.kind === 'face') hurtPlayer(d, other(p), od.amount);
    });
  }
}

function place(d: Draft, p: PlayerIndex, card: CardId, slot: number, token: boolean): Unit {
  const ab = CARDS[card].ab;
  const unit: Unit = {
    uid: d.nextUid++,
    card,
    hp: CARDS[card].hp,
    readyAt: ab.haste ? d.time : d.time + SUMMON_DELAY_MS,
    barrier: !!ab.barrier,
    pulseAt: ab.pulse ? d.time + ab.pulse.everyMs : null,
  };
  d.players[p].field[slot] = unit;
  d.events.push({ kind: 'summon', p, uid: unit.uid, slot, card, token });
  return unit;
}

function finish(state: GameState, d: Draft): GameState {
  let id = state.nextEventId;
  const [a, b] = d.players;
  let result = state.result;
  const events = [...d.events];
  if (!result && (a.hp <= 0 || b.hp <= 0)) {
    const winner: PlayerIndex | null = a.hp <= 0 && b.hp <= 0 ? null : a.hp <= 0 ? 1 : 0;
    result = { winner, reason: 'hp' };
    events.push({ kind: 'end' });
  }
  const added = events.map((e) => ({ ...e, id: id++ }) as GameEvent);
  return {
    time: d.time,
    players: d.players,
    nextUid: d.nextUid,
    nextEventId: id,
    events: [...state.events, ...added].slice(-EVENT_KEEP),
    result,
  };
}

// ---------------------------------------------------------------------------

function tick(state: GameState, dt: number): GameState {
  if (state.result || dt <= 0) return state;
  const end = Math.min(MATCH_MS, state.time + dt);
  const split = state.time < DOUBLE_COIN_FROM_MS && end > DOUBLE_COIN_FROM_MS ? DOUBLE_COIN_FROM_MS : end;
  const base = (split - state.time) * coinRate(state.time) + (end - split) * coinRate(split);
  const players = state.players.map((pl) => ({
    ...pl,
    coins: Math.min(COIN_MAX, pl.coins + base * coinBoostOf(pl)),
  })) as GameState['players'];
  let next: GameState = { ...state, time: end, players };
  if (players.some((pl) => pl.field.some((u) => u && u.pulseAt !== null && u.pulseAt <= end))) {
    next = pulses(next);
    if (next.result) return next;
  }
  if (end < MATCH_MS) return next;
  const [a, b] = players;
  const winner: PlayerIndex | null = a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1;
  const id = state.nextEventId;
  return {
    ...next,
    result: { winner, reason: 'time' },
    events: [...state.events, { id, kind: 'end' } as GameEvent].slice(-EVENT_KEEP),
    nextEventId: id + 1,
  };
}

/** 建築物の生産・砲撃。時刻が来たものを順に起こす。 */
function pulses(state: GameState): GameState {
  const d = draftOf(state);
  for (const p of [0, 1] as const) {
    const pl = d.players[p];
    for (const b of [...pl.field]) {
      const pulse = b ? CARDS[b.card].ab.pulse : undefined;
      if (!b || !pulse || b.pulseAt === null) continue;
      while (b.pulseAt !== null && b.pulseAt <= d.time && b.hp > 0) {
        b.pulseAt += pulse.everyMs;
        d.events.push({ kind: 'pulse', p, uid: b.uid });
        if (pulse.kind === 'token') {
          const empty = pl.field.findIndex((u) => !u);
          if (empty >= 0) place(d, p, 'apprentice', empty, true);
        } else {
          const q = other(p);
          const weakest = units(d.players[q])
            .filter((u) => u.hp > 0)
            .reduce<Unit | null>((m, u) => (!m || u.hp < m.hp ? u : m), null);
          if (weakest) hurtUnit(d, q, weakest, pulse.amount);
        }
      }
    }
  }
  sweepDead(d);
  return finish(state, d);
}

function castSpell(state: GameState, p: PlayerIndex, handIndex: number, target?: number): GameState {
  const d = draftOf(state);
  const pl = d.players[p];
  const card = pl.hand[handIndex]!;
  const [drawn, ...rest] = pl.queue;
  pl.hand[handIndex] = drawn!;
  pl.queue = [...rest, card];
  pl.coins -= CARDS[card].summon;
  const q = other(p);
  const foe = d.players[q];
  const effect = CARDS[card].ab.spell!;
  d.events.push({ kind: 'spell', p, card, target: effect.kind === 'bolt' ? (target ?? null) : null });
  if (effect.kind === 'bolt') {
    const hit = findUnit(foe, target!);
    if (hit) hurtUnit(d, q, hit.unit, effect.amount);
  } else if (effect.kind === 'blast') {
    for (const u of units(foe)) hurtUnit(d, q, u, effect.amount);
  } else if (effect.kind === 'freeze') {
    for (const u of units(foe)) {
      if (CARDS[u.card].type !== 'unit') continue;
      u.readyAt = Math.max(u.readyAt, d.time) + effect.ms;
      d.events.push({ kind: 'stun', p: q, uid: u.uid });
    }
  } else {
    for (const u of units(pl)) {
      if (CARDS[u.card].type !== 'unit' || u.readyAt <= d.time) continue;
      u.readyAt = d.time;
      d.events.push({ kind: 'ready', p, uid: u.uid });
    }
  }
  sweepDead(d);
  return finish(state, d);
}

function summon(state: GameState, p: PlayerIndex, handIndex: number, slot: number, target?: number): GameState {
  if (summonBlock(state, p, handIndex, slot, target)) return state;
  if (CARDS[state.players[p].hand[handIndex]!].type === 'spell') return castSpell(state, p, handIndex, target);
  const d = draftOf(state);
  const pl = d.players[p];
  const card = pl.hand[handIndex]!;
  const [drawn, ...rest] = pl.queue;
  pl.hand[handIndex] = drawn!;
  pl.queue = [...rest, card];
  pl.coins -= CARDS[card].summon;
  place(d, p, card, slot, false);

  const os = CARDS[card].ab.onSummon;
  const q = other(p);
  if (os?.kind === 'token') {
    const empty = pl.field.findIndex((u) => !u);
    if (empty >= 0) place(d, p, 'apprentice', empty, true);
  } else if (os?.kind === 'heal') {
    const healed = Math.min(PLAYER_HP - pl.hp, os.amount);
    if (healed > 0) {
      pl.hp += healed;
      d.events.push({ kind: 'heal', p, amount: healed });
    }
  } else if (needsTarget(card) && target !== undefined) {
    const hit = findUnit(d.players[q], target);
    if (hit && os?.kind === 'strike') hurtUnit(d, q, hit.unit, os.amount);
    if (hit && os?.kind === 'stun') {
      hit.unit.readyAt = Math.max(hit.unit.readyAt, d.time) + os.ms;
      d.events.push({ kind: 'stun', p: q, uid: hit.unit.uid });
    }
  }
  sweepDead(d);
  return finish(state, d);
}

function attack(state: GameState, p: PlayerIndex, uid: number, target: Target): GameState {
  if (attackBlock(state, p, uid, target)) return state;
  const d = draftOf(state);
  const q = other(p);
  const me = d.players[p];
  const foe = d.players[q];
  const { unit } = findUnit(me, uid)!;
  const ab = CARDS[unit.card].ab;
  const atk = attackOf(me, unit);
  unit.readyAt = d.time + cooldownOf(me);
  d.events.push({ kind: 'attack', p, uid, target });

  if (target.kind === 'player') {
    hurtPlayer(d, q, atk + (ab.faceBonus ?? 0));
  } else {
    const hit = findUnit(foe, target.uid)!.unit;
    // 反撃は殴られる前の値で決まる（同時にぶつかる）
    const back = attackOf(foe, hit) + (CARDS[hit.card].ab.unitBonus ?? 0);
    const victims = ab.sweep ? units(foe) : [hit];
    for (const v of victims) hurtUnit(d, q, v, atk + (ab.unitBonus ?? 0));
    if (!ab.ranged) hurtUnit(d, p, unit, back);
  }
  sweepDead(d);
  return finish(state, d);
}

export function step(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'tick':
      return tick(state, action.dt);
    case 'summon':
      return summon(state, action.p, action.handIndex, action.slot, action.target);
    case 'attack':
      return attack(state, action.p, action.uid, action.target);
  }
}

/** 最初の空き枠。無ければ -1。 */
export function firstEmptySlot(pl: PlayerState): number {
  return pl.field.findIndex((u) => !u);
}
