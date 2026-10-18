// ゲームの進行。純粋関数（同じ状態と操作から必ず同じ結果）。
// 時間は tick で進め、召喚と攻撃は好きな時刻に差し込む。

import { CARDS, isBlocker, needsTarget, requiresTarget, type CardId } from './cards';
import { makeRng, shuffle } from './rng';
import {
  COIN_MAX,
  COIN_START,
  COOLDOWN_SCALE,
  coinRate,
  DOUBLE_COIN_FROM_MS,
  FIELD_SLOTS,
  HAND_SIZE,
  MATCH_MS,
  PLAYER_HP,
  WINDUP_MS,
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
  /** ステルス中か（自分で攻撃するまで、相手に選ばれず、壁にも数えない）。 */
  stealth: boolean;
  /** 建築物が次に効く時刻（生産・砲撃）。無ければ null。 */
  pulseAt: number | null;
  /** ターゲット。クールタイムが明けるたびにこの対象を攻撃する（攻撃しても外れない）。
   *  狙えなくなったら（倒れた・ブロッカーが出た・壁ができた）外れる。 */
  reserved: Target | null;
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

/** 溜め中の行動。at になったら効く（WINDUP_MS）。
 *  attack: ユニットの攻撃。spell: 呪文（target は単体のときだけ）。ability: 召喚時の狙撃・足止（uid は召喚したカード）。 */
export type Pending =
  | { id: number; kind: 'attack'; p: PlayerIndex; uid: number; target: Target; at: number }
  | { id: number; kind: 'spell'; p: PlayerIndex; card: CardId; target: number | null; at: number }
  | { id: number; kind: 'ability'; p: PlayerIndex; uid: number; card: CardId; target: number; at: number };

export type GameEvent =
  | { id: number; kind: 'summon'; p: PlayerIndex; uid: number; slot: number; card: CardId; token: boolean }
  /** 攻撃が当たった瞬間（溜めのあと）。 */
  | { id: number; kind: 'attack'; p: PlayerIndex; uid: number; target: Target }
  /** 溜めに入った（攻撃・呪文・召喚時の能力を選んだ）。 */
  | { id: number; kind: 'windup'; p: PlayerIndex; pending: Pending }
  /** 召喚時の狙撃・足止が効いた瞬間（溜めのあと）。 */
  | { id: number; kind: 'ability'; p: PlayerIndex; uid: number; target: number }
  /** 攻撃を予約した（クールタイム中に対象を選んだ）。 */
  | { id: number; kind: 'reserve'; p: PlayerIndex; uid: number; target: Target }
  /** 予約が消えた（対象が倒れた・ブロッカーや壁で狙えなくなった・取り消した）。 */
  | { id: number; kind: 'unreserve'; p: PlayerIndex; uid: number }
  /** 自分のカードの上に召喚して、元のカードを場から除いた（死亡時は起きない）。 */
  | { id: number; kind: 'replace'; p: PlayerIndex; uid: number; card: CardId; slot: number }
  /** 溜めの間に攻撃元か対象が消えて、中断した。 */
  | { id: number; kind: 'cancel'; p: PlayerIndex; pending: Pending }
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
  /** 溜め中の行動（選んだ順）。 */
  pending: Pending[];
  result: GameResult | null;
}

export type Action =
  | { type: 'tick'; dt: number }
  /** target は「狙撃」「足止」・単体の呪文で選んだ相手のカード。狙撃・足止は無ければ空振り。
   *  呪文は場に出ないので slot は見ない（-1 でよい）。 */
  | { type: 'summon'; p: PlayerIndex; handIndex: number; slot: number; target?: number }
  | { type: 'attack'; p: PlayerIndex; uid: number; target: Target }
  /** 攻撃の予約。target が null なら予約を取り消す。 */
  | { type: 'reserve'; p: PlayerIndex; uid: number; target: Target | null };

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
    pending: [],
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

/** 相手が選んで狙えるカード（ステルス中は除く）。 */
function pickable(player: PlayerState, uid: number): Unit | null {
  const f = findUnit(player, uid);
  return f && !f.unit.stealth ? f.unit : null;
}

/** 場が全部うまっている（壁）。ステルス中のカードは数えない。 */
export function isWalled(player: PlayerState): boolean {
  return player.field.every((u) => !!u && !u.stealth);
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
  return targetsAgainst(state.players[other(p)]);
}

/** 相手の盤面から、いま狙える対象。 */
function targetsAgainst(foe: PlayerState): Target[] {
  // ステルス中のカードは存在しない扱い（選べない）
  const all = units(foe).filter((u) => !u.stealth);
  const blockers = all.filter((u) => isBlocker(u.card));
  if (blockers.length > 0) return blockers.map((u) => ({ kind: 'unit', uid: u.uid }));
  const list: Target[] = all.map((u) => ({ kind: 'unit' as const, uid: u.uid }));
  if (!isWalled(foe)) list.unshift({ kind: 'player' });
  return list;
}

function sameTarget(a: Target, b: Target): boolean {
  return a.kind === b.kind && (a.kind === 'player' || (b.kind === 'unit' && a.uid === b.uid));
}

/** 相手の盤面に対して、その対象をいま狙えるか。 */
function legalAgainst(foe: PlayerState, target: Target): boolean {
  return targetsAgainst(foe).some((t) => sameTarget(t, target));
}

export function isLegalTarget(state: GameState, p: PlayerIndex, target: Target): boolean {
  return legalTargets(state, p).some(
    (t) => t.kind === target.kind && (t.kind === 'player' || (target.kind === 'unit' && t.uid === target.uid)),
  );
}

/** そのカードのクールタイム（カードごとの値。祈りで縮む。最短で 40%）。 */
export function cooldownOf(player: PlayerState, card: CardId): number {
  let cut = 0;
  for (const u of player.field) if (u) cut += CARDS[u.card].ab.cooldownCut ?? 0;
  return Math.round(CARDS[card].cd * COOLDOWN_SCALE * Math.max(0.4, 1 - cut));
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
    if (requiresTarget(card) && (target === undefined || !pickable(state.players[other(p)], target))) return 'target';
    return null;
  }
  if (slot < 0 || slot >= FIELD_SLOTS) return 'slot';
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
  if (state.pending.some((x) => x.kind === 'attack' && x.uid === uid)) return 'cooldown';
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
  pending: Pending[];
}

function draftOf(state: GameState): Draft {
  const copy = (pl: PlayerState): PlayerState => ({
    ...pl,
    hand: [...pl.hand],
    queue: [...pl.queue],
    field: pl.field.map((u) => (u ? { ...u } : null)),
  });
  return {
    time: state.time,
    players: [copy(state.players[0]), copy(state.players[1])],
    nextUid: state.nextUid,
    events: [],
    pending: [...state.pending],
  };
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
    readyAt: ab.haste ? d.time : d.time + cooldownOf(d.players[p], card),
    barrier: !!ab.barrier,
    stealth: !!ab.stealth,
    pulseAt: ab.pulse ? d.time + ab.pulse.everyMs : null,
    reserved: null,
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
    // 決着したら溜め中の行動は捨てる
    pending: result ? [] : d.pending,
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
  if (next.pending.some((x) => x.at <= end)) {
    next = resolvePending(next);
    if (next.result) return next;
  }
  if (next.players.some((pl) => pl.field.some((u) => u?.reserved))) next = runReservations(next);
  if (players.some((pl) => pl.field.some((u) => u && u.pulseAt !== null && u.pulseAt <= end))) {
    next = pulses(next);
    if (next.result) return next;
  }
  if (end < MATCH_MS) return next;
  // 砲撃・遺言で HP が動いていることがあるので、pulses 後の盤面で判定する
  const [a, b] = next.players;
  const winner: PlayerIndex | null = a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1;
  const id = next.nextEventId;
  return {
    ...next,
    result: { winner, reason: 'time' },
    events: [...next.events, { id, kind: 'end' } as GameEvent].slice(-EVENT_KEEP),
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
            .filter((u) => u.hp > 0 && !u.stealth)
            .reduce<Unit | null>((m, u) => (!m || u.hp < m.hp ? u : m), null);
          if (weakest) hurtUnit(d, q, weakest, pulse.amount);
        }
      }
    }
  }
  sweepDead(d);
  return finish(state, d);
}

/** 攻撃の予約を進める。狙えなくなった予約は消し、クールタイムが明けた予約は攻撃（溜め）に変える。 */
function runReservations(state: GameState): GameState {
  const d = draftOf(state);
  let changed = false;
  for (const p of [0, 1] as const) {
    const me = d.players[p];
    const foe = d.players[other(p)];
    for (const u of me.field) {
      if (!u?.reserved) continue;
      if (!legalAgainst(foe, u.reserved)) {
        u.reserved = null;
        d.events.push({ kind: 'unreserve', p, uid: u.uid });
        changed = true;
        continue;
      }
      if (d.time < u.readyAt || d.pending.some((x) => x.kind === 'attack' && x.uid === u.uid)) continue;
      const target = u.reserved;
      u.readyAt = d.time + cooldownOf(me, u.card);
      u.stealth = false;
      windup(d, { id: d.nextUid++, kind: 'attack', p, uid: u.uid, target, at: d.time + WINDUP_MS });
      changed = true;
    }
  }
  return changed ? finish(state, d) : state;
}

/** 攻撃の予約。クールタイム中（または溜め中）のユニットだけ予約できる。すぐ攻撃できるなら予約ではなく attack を使う。 */
function reserve(state: GameState, p: PlayerIndex, uid: number, target: Target | null): GameState {
  if (state.result) return state;
  const found = findUnit(state.players[p], uid);
  if (!found || CARDS[found.unit.card].type !== 'unit') return state;
  if (target === null) {
    if (!found.unit.reserved) return state;
  } else {
    if (!isLegalTarget(state, p, target)) return state;
    const busy = state.time < found.unit.readyAt || state.pending.some((x) => x.kind === 'attack' && x.uid === uid);
    if (!busy) return state;
  }
  const d = draftOf(state);
  const u = findUnit(d.players[p], uid)!.unit;
  u.reserved = target;
  d.events.push(target ? { kind: 'reserve', p, uid, target } : { kind: 'unreserve', p, uid });
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
  const effect = CARDS[card].ab.spell!;
  windup(d, { id: d.nextUid++, kind: 'spell', p, card, target: effect.kind === 'bolt' ? (target ?? null) : null, at: d.time + WINDUP_MS });
  return finish(state, d);
}

function windup(d: Draft, pending: Pending): void {
  d.pending.push(pending);
  d.events.push({ kind: 'windup', p: pending.p, pending });
}

/** 呪文の効果（溜めのあと）。単体の対象が消えていたら false（中断）。 */
function applySpell(d: Draft, p: PlayerIndex, card: CardId, target: number | null): boolean {
  const q = other(p);
  const pl = d.players[p];
  const foe = d.players[q];
  const effect = CARDS[card].ab.spell!;
  if (effect.kind === 'bolt') {
    const hit = target === null ? null : pickable(foe, target);
    if (!hit) return false;
    d.events.push({ kind: 'spell', p, card, target });
    hurtUnit(d, q, hit, effect.amount);
    return true;
  }
  d.events.push({ kind: 'spell', p, card, target: null });
  if (effect.kind === 'blast') {
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
  return true;
}

/** 攻撃の解決（溜めのあと）。攻撃元か対象が消えていたら false（中断）。 */
function applyAttack(d: Draft, p: PlayerIndex, uid: number, target: Target): boolean {
  const q = other(p);
  const me = d.players[p];
  const foe = d.players[q];
  const unit = findUnit(me, uid)?.unit;
  if (!unit) return false;
  const hit = target.kind === 'unit' ? findUnit(foe, target.uid)?.unit : undefined;
  if (target.kind === 'unit' && !hit) return false;
  if (!legalAgainst(foe, target)) return false;
  const ab = CARDS[unit.card].ab;
  const atk = attackOf(me, unit);
  d.events.push({ kind: 'attack', p, uid, target });
  if (!hit) {
    hurtPlayer(d, q, atk + (ab.faceBonus ?? 0));
  } else {
    // 反撃は殴られる前の値で決まる（同時にぶつかる）。討伐は攻撃時だけで、反撃には乗らない
    const back = attackOf(foe, hit);
    hurtUnit(d, q, hit, atk + (ab.unitBonus ?? 0));
    if (ab.splash) for (const v of units(foe)) if (v.uid !== hit.uid) hurtUnit(d, q, v, ab.splash);
    if (!ab.ranged) hurtUnit(d, p, unit, back);
  }
  return true;
}

/** 召喚時の狙撃・足止の解決（溜めのあと）。召喚したカードか対象が消えていたら false（中断）。 */
function applyAbility(d: Draft, p: PlayerIndex, uid: number, card: CardId, target: number): boolean {
  const q = other(p);
  if (!findUnit(d.players[p], uid)) return false;
  const hit = pickable(d.players[q], target);
  if (!hit) return false;
  const os = CARDS[card].ab.onSummon;
  d.events.push({ kind: 'ability', p, uid, target });
  if (os?.kind === 'strike') hurtUnit(d, q, hit, os.amount);
  if (os?.kind === 'stun') {
    hit.readyAt = Math.max(hit.readyAt, d.time) + os.ms;
    d.events.push({ kind: 'stun', p: q, uid: hit.uid });
  }
  return true;
}

/** 溜めが明けた行動を、選んだ順に解決する。1 つ解決するたびに倒れたカードを除く
 *  （先に倒れた攻撃元・対象の行動は中断になる）。 */
function resolvePending(state: GameState): GameState {
  const d = draftOf(state);
  const due = d.pending.filter((x) => x.at <= d.time);
  d.pending = d.pending.filter((x) => x.at > d.time);
  for (const x of due) {
    if (d.players[0].hp <= 0 || d.players[1].hp <= 0) break;
    const ok =
      x.kind === 'attack'
        ? applyAttack(d, x.p, x.uid, x.target)
        : x.kind === 'spell'
          ? applySpell(d, x.p, x.card, x.target)
          : applyAbility(d, x.p, x.uid, x.card, x.target);
    if (!ok) d.events.push({ kind: 'cancel', p: x.p, pending: x });
    sweepDead(d);
  }
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
  const old = pl.field[slot];
  if (old) {
    // 自分のカードの上に召喚した: 元のカードは除くだけ（倒れたのではないので死亡時は起きない）
    pl.field[slot] = null;
    d.events.push({ kind: 'replace', p, uid: old.uid, card: old.card, slot });
  }
  const placed = place(d, p, card, slot, false);

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
  } else if (needsTarget(card) && target !== undefined && pickable(d.players[q], target)) {
    windup(d, { id: d.nextUid++, kind: 'ability', p, uid: placed.uid, card, target, at: d.time + WINDUP_MS });
  }
  sweepDead(d);
  return finish(state, d);
}

function attack(state: GameState, p: PlayerIndex, uid: number, target: Target): GameState {
  if (attackBlock(state, p, uid, target)) return state;
  const d = draftOf(state);
  const me = d.players[p];
  const { unit } = findUnit(me, uid)!;
  unit.readyAt = d.time + cooldownOf(me, unit.card);
  unit.stealth = false; // 自分で攻撃を選んだらステルスは解ける
  unit.reserved = target; // 攻撃した対象をターゲットとして残す（明けるたびに攻撃し続ける）
  windup(d, { id: d.nextUid++, kind: 'attack', p, uid, target, at: d.time + WINDUP_MS });
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
    case 'reserve':
      return reserve(state, action.p, action.uid, action.target);
  }
}

/** 最初の空き枠。無ければ -1。 */
export function firstEmptySlot(pl: PlayerState): number {
  return pl.field.findIndex((u) => !u);
}
