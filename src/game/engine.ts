// ゲームの進行。純粋関数（同じ状態と操作から必ず同じ結果）。
// 時間は tick で進め、召喚と攻撃は好きな時刻に差し込む。

import { CARDS, needsTarget, requiresTarget, summonSide, type Abilities, type CardId } from './cards';
import { makeRng, shuffle } from './rng';
import {
  COIN_MAX,
  COIN_START,
  COOLDOWN_SCALE,
  coinRate,
  FAST_COOLDOWN_FROM_MS,
  FIELD_SLOTS,
  HAND_SIZE,
  INTERFERE_MS,
  SUMMON_WINDUP_MS,
  MATCH_MS,
  PLAYER_ATK,
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
  /** 増えた最大 HP（バフ）。無ければカードの HP。 */
  maxHp?: number;
  /** 増えた攻撃力（バフ）。 */
  atkBuff?: number;
  /** 毒: 攻撃するたびに、この数のダメージを受ける。 */
  poison?: number;
  /** 封印: 能力がすべて無効。 */
  sealed?: true;
  /** この時刻（ms）まで攻撃不能。 */
  disarmUntil?: number;
  /** 不屈がまだ残っているか。 */
  /** 連撃の 2 回目を待っているか（1 回目のあと、クールタイムなしでもう 1 回）。 */
  second?: true;
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
  /** カードのレベル（無ければ 1）。場に出たとき、レベルに応じて攻撃力・HP が上がる。 */
  levels?: Partial<Record<CardId, number>>;
}

/** カードの最大レベル。 */
export const MAX_CARD_LEVEL = 5;

/** レベルによる上乗せ。Lv2 で HP+1、Lv3 で攻撃+1、Lv4 で HP+2、Lv5 で攻撃+2（交互に上がる）。 */
export function levelBonus(level: number): { atk: number; hp: number } {
  const lv = Math.max(1, Math.min(MAX_CARD_LEVEL, Math.floor(level)));
  return { atk: Math.floor((lv - 1) / 2), hp: Math.floor(lv / 2) };
}

export type CancelReason = 'blocked' | 'target' | 'dodge' | 'attacker' | 'parry';

export type Target = { kind: 'player' } | { kind: 'unit'; uid: number };

/** 溜め中の行動。at になったら効く（WINDUP_MS）。
 *  attack: ユニットの攻撃。spell: 呪文（target は単体のときだけ）。ability: 召喚時の狙撃・足止（uid は召喚したカード）。 */
export type Pending =
  /** readyBefore/readyAfter: 選ぶ前と選んだ直後のクールタイム明け時刻。中断したら、選ぶ前に戻す（やり直しにしない）。 */
  | { id: number; kind: 'attack'; p: PlayerIndex; uid: number; target: Target; at: number; readyBefore: number; readyAfter: number; secondBefore: boolean }
  | { id: number; kind: 'spell'; p: PlayerIndex; card: CardId; target: number | null; at: number }
  /** 配置したカードの登場待ち（SUMMON_WINDUP_MS）。slot は予約済みで、ほかのカードは置けない。 */
  | { id: number; kind: 'summon'; p: PlayerIndex; card: CardId; slot: number; target: number | undefined; at: number }
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
  /** 溜めの途中で中断した。reason: blocked=ブロッカーが割り込んだ（by がそのブロッカー。壁なら by なし）/ target=対象が倒れた /
   *  dodge=対象が上書きで入れ替わってかわされた / attacker=攻撃元が倒れた・入れ替わった / parry=呪文で弾かれた。 */
  | { id: number; kind: 'cancel'; p: PlayerIndex; pending: Pending; reason: CancelReason; by?: number }
  /** コインが増えた（割り込み・生贄の効果）。uid はその効果を起こしたカード。 */
  | { id: number; kind: 'coin'; p: PlayerIndex; amount: number; uid: number }
  /** 自分のカードの上に召喚した（uid は新しいカード、oldUid は入れ替わったカード）。 */
  | { id: number; kind: 'overwrite'; p: PlayerIndex; uid: number; oldUid: number; slot: number }
  /** 入れ替わったカードの「生贄時」の能力が起きた。 */
  | { id: number; kind: 'sacrifice'; p: PlayerIndex; uid: number; card: CardId; slot: number; effect: string }
  /** p は受けた側。amount は実際に減った HP。guard は防いだ理由。 */
  | { id: number; kind: 'damage'; p: PlayerIndex; target: Target; amount: number; guard: 'barrier' | 'armor' | null }
  | { id: number; kind: 'heal'; p: PlayerIndex; amount: number }
  | { id: number; kind: 'stun'; p: PlayerIndex; uid: number }
  /** 味方ユニットの HP が回復した。 */
  | { id: number; kind: 'healUnit'; p: PlayerIndex; uid: number; amount: number }
  /** ユニットの攻撃力・HP が上がった。 */
  | { id: number; kind: 'buff'; p: PlayerIndex; uid: number; atk: number; hp: number }
  /** ユニットに毒が付いた（amount は重なったあとの毒の数）。 */
  | { id: number; kind: 'poison'; p: PlayerIndex; uid: number; amount: number }
  /** ユニットが封印された。 */
  | { id: number; kind: 'seal'; p: PlayerIndex; uid: number }
  /** ユニットが攻撃不能になった。 */
  | { id: number; kind: 'disarm'; p: PlayerIndex; uid: number }
  /** 召喚時にクールタイムを減らした（ms 減った）。 */
  | { id: number; kind: 'cdcut'; p: PlayerIndex; uid: number; ms: number }
  /** 召喚時にほかのユニットをすべて破壊した（uid は召喚したカード）。 */
  | { id: number; kind: 'wipe'; p: PlayerIndex; uid: number }
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

function makePlayer(deck: readonly CardId[], rand: () => number, levels?: Partial<Record<CardId, number>>): PlayerState {
  const order = shuffle(deck, rand);
  return {
    levels,
    hp: PLAYER_HP,
    coins: COIN_START,
    hand: order.slice(0, HAND_SIZE),
    queue: order.slice(HAND_SIZE),
    field: Array.from({ length: FIELD_SLOTS }, () => null),
  };
}

export function createGame(
  decks: [readonly CardId[], readonly CardId[]],
  seed: number,
  levels?: [Partial<Record<CardId, number>>?, Partial<Record<CardId, number>>?],
): GameState {
  const rand = makeRng(seed);
  return {
    time: 0,
    players: [makePlayer(decks[0], rand, levels?.[0]), makePlayer(decks[1], rand, levels?.[1])],
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

/** そのユニットの、いま効いている能力（封印されていれば何も無い）。 */
/** 場にいる、同じ一族のほかのカードの数（一族でないカードは 0）。 */
export function clanOthers(player: PlayerState, unit: Unit): number {
  const clan = CARDS[unit.card].ab.clan;
  if (!clan) return 0;
  return player.field.filter((u) => u && u.uid !== unit.uid && CARDS[u.card].ab.clan === clan).length;
}

/** 連撃か（一族の条件つきを含む）。 */
export function isDoubleStrike(player: PlayerState, u: Unit): boolean {
  const a = abOf(u);
  return !!a.doubleStrike || (!!a.clanDouble && clanOthers(player, u) >= a.clanDouble);
}

export function abOf(u: Unit): Abilities {
  return u.sealed ? {} : CARDS[u.card].ab;
}

/** ブロッカーか（封印されたブロッカーは数えない）。 */
export function isBlockerUnit(u: Unit): boolean {
  return !!abOf(u).blocker;
}

/** 最大 HP（バフを含む）。 */
export function maxHpOf(u: Unit): number {
  return u.maxHp ?? CARDS[u.card].hp;
}

/** 攻撃できない状態か（能力で攻撃できない・攻撃不能の効果中）。 */
export function isDisarmed(u: Unit, time: number): boolean {
  return !!abOf(u).cannotAttack || time < (u.disarmUntil ?? 0);
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
  for (const u of player.field) if (u && u.uid !== unit.uid) rally += abOf(u).rally ?? 0;
  const myClan = abOf(unit).clan;
  if (myClan) for (const u of player.field) if (u && u.uid !== unit.uid && abOf(u).clan === myClan) rally += abOf(u).clanRally ?? 0;
  const clan = clanOthers(player, unit) > 0 ? (abOf(unit).clanAtk ?? 0) : 0;
  return CARDS[unit.card].atk + rally + clan + (unit.atkBuff ?? 0);
}

/** コインのたまる速さの倍率（増収を含む）。 */
export function coinBoostOf(player: PlayerState): number {
  let boost = 1;
  for (const u of player.field) if (u) boost += abOf(u).coinBoost ?? 0;
  return boost;
}

/** p から見て、いま攻撃対象に選べる相手。ブロッカーがいればブロッカーだけ、壁ならプレイヤーは選べない。 */
export function legalTargets(state: GameState, p: PlayerIndex): Target[] {
  return targetsAgainst(state.players[other(p)]);
}

/** uid のユニットが、いま攻撃対象に選べる相手。狙い撃ちは、ブロッカー・壁を無視して好きな相手を選べる。 */
export function legalTargetsFor(state: GameState, p: PlayerIndex, uid: number): Target[] {
  const foe = state.players[other(p)];
  const me = findUnit(state.players[p], uid)?.unit;
  if (me && abOf(me).freeAim) return freeTargets(foe);
  return targetsAgainst(foe);
}

/** 狙い撃ち用: ステルス中以外の敵ユニットと、プレイヤー。 */
function freeTargets(foe: PlayerState): Target[] {
  return [{ kind: 'player' }, ...units(foe).filter((u) => !u.stealth).map((u) => ({ kind: 'unit' as const, uid: u.uid }))];
}

/** 相手の盤面から、いま狙える対象。 */
function targetsAgainst(foe: PlayerState): Target[] {
  // ステルス中のカードは存在しない扱い（選べない）
  const all = units(foe).filter((u) => !u.stealth);
  const blockers = all.filter((u) => isBlockerUnit(u));
  if (blockers.length > 0) return blockers.map((u) => ({ kind: 'unit', uid: u.uid }));
  const list: Target[] = all.map((u) => ({ kind: 'unit' as const, uid: u.uid }));
  if (!isWalled(foe)) list.unshift({ kind: 'player' });
  return list;
}

/** 予約に選べる相手: ブロッカー・壁に阻まれていても、盤面にいる（ステルスでない）ユニットとプレイヤー。 */
export function reservableTargets(state: GameState, p: PlayerIndex): Target[] {
  return freeTargets(state.players[other(p)]);
}

function sameTarget(a: Target, b: Target): boolean {
  return a.kind === b.kind && (a.kind === 'player' || (b.kind === 'unit' && a.uid === b.uid));
}

/** 相手の盤面に対して、その対象をいま狙えるか。 */
function legalAgainst(foe: PlayerState, target: Target, attacker?: Unit): boolean {
  const list = attacker && abOf(attacker).freeAim ? freeTargets(foe) : targetsAgainst(foe);
  return list.some((t) => sameTarget(t, target));
}

export function isLegalTarget(state: GameState, p: PlayerIndex, target: Target, uid?: number): boolean {
  const list = uid === undefined ? legalTargets(state, p) : legalTargetsFor(state, p, uid);
  return list.some((t) => t.kind === target.kind && (t.kind === 'player' || (target.kind === 'unit' && t.uid === target.uid)));
}

/** そのカードのクールタイム（カードごとの値。祈りで縮む。最短で 40%）。 */
export function cooldownOf(player: PlayerState, card: CardId): number {
  let cut = 0;
  for (const u of player.field) if (u) cut += abOf(u).cooldownCut ?? 0;
  return Math.round(CARDS[card].cd * COOLDOWN_SCALE * Math.max(0.4, 1 - cut));
}

/** 登場時に敵を選ぶカード（狙撃・足止・破壊）で、いま選べる敵。足止・破壊はユニットだけ。 */
export function summonTargets(side: PlayerState, card: CardId): Unit[] {
  const kind = CARDS[card].ab.onSummon?.kind;
  if (summonSide(card) === 'ally') return units(side).filter((u) => CARDS[u.card].type === 'unit');
  const all = units(side).filter((u) => !u.stealth);
  // 足止・破壊・毒・封印・攻撃不能は、敵ユニットだけ。狙撃は建築物も選べる
  return kind === 'strike' ? all : all.filter((u) => CARDS[u.card].type === 'unit');
}

/** 登場時に選べる相手のいる側のプレイヤー（敵 or 自分）。 */
export function summonSidePlayer(state: GameState, p: PlayerIndex, card: CardId): PlayerState {
  return summonSide(card) === 'ally' ? state.players[p] : state.players[other(p)];
}

export type SummonBlock = 'coins' | 'slot' | 'target' | 'noattack' | 'over' | null;

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
    // パリィ: 相手の溜め中の攻撃が無ければ使えない
    if (CARDS[card].ab.spell?.kind === 'ambush' && freeSlot(state, p) < 0) return 'slot';
    if (CARDS[card].ab.spell?.kind === 'parry' && !state.pending.some((x) => x.kind === 'attack' && x.p === other(p))) return 'noattack';
    if (requiresTarget(card) && (target === undefined || !pickable(state.players[other(p)], target))) return 'target';
    return null;
  }
  if (slot < 0 || slot >= FIELD_SLOTS) return 'slot';
  // 登場待ちのカードがある枠には、ほかのカードを置けない
  if (state.pending.some((x) => x.kind === 'summon' && x.p === p && x.slot === slot)) return 'slot';
  // 登場時に敵を選ぶカード: 選べる敵がいるのに選ばなければ、置けない（配置失敗）
  if (needsTarget(card)) {
    const choices = summonTargets(summonSidePlayer(state, p, card), card);
    if (choices.length > 0 && (target === undefined || !choices.some((u) => u.uid === target))) return 'target';
  }
  return null;
}

export type AttackBlock = 'building' | 'disarmed' | 'cooldown' | 'target' | 'over' | null;

export function attackBlock(state: GameState, p: PlayerIndex, uid: number, target?: Target): AttackBlock {
  if (state.result) return 'over';
  const pl = state.players[p];
  const found = findUnit(pl, uid);
  if (!found) return 'over';
  if (CARDS[found.unit.card].type !== 'unit') return 'building';
  if (isDisarmed(found.unit, state.time)) return 'disarmed';
  if (state.time < found.unit.readyAt) return 'cooldown';
  if (state.pending.some((x) => x.kind === 'attack' && x.uid === uid)) return 'cooldown';
  if (target && !isLegalTarget(state, p, target, uid)) return 'target';
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
  /** 溜め中の攻撃の見直しの最中（入れ子にしない）。 */
  rechecking?: boolean;
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

/** カードにダメージを与える（結界・鉄壁・不屈を通す）。実際に減った HP を返す。 */
function hurtUnit(d: Draft, p: PlayerIndex, unit: Unit, amount: number): number {
  if (amount <= 0) return 0;
  if (unit.barrier) {
    unit.barrier = false;
    d.events.push({ kind: 'damage', p, target: { kind: 'unit', uid: unit.uid }, amount: 0, guard: 'barrier' });
    return 0;
  }
  const armor = (abOf(unit).armor ?? 0) + (clanOthers(d.players[p], unit) > 0 ? (abOf(unit).clanArmor ?? 0) : 0);
  const dealt = Math.max(0, amount - armor);
  unit.hp -= dealt;
  d.events.push({ kind: 'damage', p, target: { kind: 'unit', uid: unit.uid }, amount: dealt, guard: armor > 0 ? 'armor' : null });
  return dealt;
}

function hurtPlayer(d: Draft, p: PlayerIndex, amount: number): number {
  if (amount <= 0) return 0;
  const pl = d.players[p];
  const dealt = Math.min(pl.hp, amount);
  pl.hp -= dealt;
  d.events.push({ kind: 'damage', p, target: { kind: 'player' }, amount: dealt, guard: null });
  return dealt;
}

function healPlayer(d: Draft, p: PlayerIndex, amount: number): void {
  const pl = d.players[p];
  const healed = Math.min(PLAYER_HP - pl.hp, amount);
  if (healed > 0) {
    pl.hp += healed;
    d.events.push({ kind: 'heal', p, amount: healed });
  }
}

function healUnit(d: Draft, p: PlayerIndex, unit: Unit, amount: number): void {
  const healed = Math.min(maxHpOf(unit) - unit.hp, amount);
  if (healed > 0) {
    unit.hp += healed;
    d.events.push({ kind: 'healUnit', p, uid: unit.uid, amount: healed });
  }
}

function buffUnit(d: Draft, p: PlayerIndex, unit: Unit, atk: number, hp: number): void {
  if (atk <= 0 && hp <= 0) return;
  unit.atkBuff = (unit.atkBuff ?? 0) + atk;
  if (hp > 0) {
    unit.maxHp = maxHpOf(unit) + hp;
    unit.hp += hp;
  }
  d.events.push({ kind: 'buff', p, uid: unit.uid, atk, hp });
}

function poisonUnit(d: Draft, p: PlayerIndex, unit: Unit, amount: number): void {
  // 毒は数のない状態: 付いていれば、攻撃するたびに 1 ダメージ。同じ状態は重ならない（amount は使わない）
  if (amount <= 0 || unit.poison) return;
  unit.poison = 1;
  d.events.push({ kind: 'poison', p, uid: unit.uid, amount: 1 });
}

function sealUnit(d: Draft, p: PlayerIndex, unit: Unit): void {
  if (unit.sealed) return;
  unit.sealed = true;
  unit.barrier = false;
  unit.stealth = false;
  unit.pulseAt = null;
  d.events.push({ kind: 'seal', p, uid: unit.uid });
}

function disarmUnit(d: Draft, p: PlayerIndex, unit: Unit, ms: number): void {
  // 同じ状態は重ならない: すでに攻撃不能なら、長いほうの終わりまで（足し算しない）
  const until = d.time + ms;
  if ((unit.disarmUntil ?? 0) >= until) return;
  unit.disarmUntil = until;
  d.events.push({ kind: 'disarm', p, uid: unit.uid });
}

/** HP が 0 になったカードを場から除き、遺言を起こす。遺言で倒れるカードは無いので 1 回で済む。 */
function addCoins(d: Draft, p: PlayerIndex, amount: number, uid: number): void {
  const pl = d.players[p];
  pl.coins = Math.min(COIN_MAX, pl.coins + amount);
  d.events.push({ kind: 'coin', p, amount, uid });
}

/** 溜め中の攻撃が、いま通らない理由（通るなら null）。ブロッカーに阻まれたときは、その uid（壁なら無し）も返す。 */
function attackFail(d: Draft, x: Extract<Pending, { kind: 'attack' }>): { reason: CancelReason; by?: number } | null {
  const me = d.players[x.p];
  const foe = d.players[other(x.p)];
  const unit = findUnit(me, x.uid)?.unit;
  if (!unit) return { reason: 'attacker' };
  if (x.target.kind === 'unit' && !findUnit(foe, x.target.uid)) return { reason: 'target' };
  if (!legalAgainst(foe, x.target, unit)) {
    const b = units(foe).find((u) => !u.stealth && isBlockerUnit(u));
    return { reason: 'blocked', by: b?.uid };
  }
  return null;
}

/** 溜め中の行動を中断する。攻撃ならクールタイムを選ぶ前に戻し、割り込み・攻撃中断の能力を起こす。 */
function cancelPending(d: Draft, x: Pending, reason: CancelReason, by?: number): void {
  d.pending = d.pending.filter((y) => y.id !== x.id);
  d.events.push({ kind: 'cancel', p: x.p, pending: x, reason, by });
  if (x.kind !== 'attack') return;
  const u = findUnit(d.players[x.p], x.uid)?.unit;
  if (!u) return;
  // 攻撃が中断されても、クールタイムはやり直しにしない（選ぶ前に戻す。足止などで延びたぶんは残す）
  u.readyAt = x.readyBefore + Math.max(0, u.readyAt - x.readyAfter);
  u.second = x.secondBefore ? true : undefined;
  const q = other(x.p);
  // 妨害（ブロッカー・壁・チェンジでかわされた）: 妨害された側のクールタイム +5 秒。すぐ動き直せないようにする
  if ((reason === 'blocked' || reason === 'dodge') && !abOf(u).interfereImmune) {
    u.readyAt = Math.max(u.readyAt, d.time) + INTERFERE_MS;
    d.events.push({ kind: 'stun', p: x.p, uid: u.uid });
  }
  // 妨害時: 阻んだブロッカー（かわしたカード）の能力
  if ((reason === 'blocked' || reason === 'dodge') && by !== undefined) {
    const b = findUnit(d.players[q], by)?.unit;
    const oi = b ? abOf(b).onInterrupt : undefined;
    if (b && oi) {
      if (oi.kind === 'strike') hurtUnit(d, x.p, u, oi.amount);
      else if (oi.kind === 'stun') {
        if (!abOf(u).interfereImmune) {
          u.readyAt = Math.max(u.readyAt, d.time) + oi.ms;
          d.events.push({ kind: 'stun', p: x.p, uid: u.uid });
        }
      } else if (oi.kind === 'buff') buffUnit(d, q, b, oi.atk, oi.hp);
      else addCoins(d, q, oi.amount, b.uid);
    }
  }
  // 妨害された時: 妨害された側の能力
  const oc = u.hp > 0 ? abOf(u).onCancelled : undefined;
  if (oc?.kind === 'ready') {
    u.readyAt = d.time;
    d.events.push({ kind: 'ready', p: x.p, uid: u.uid });
  } else if (oc?.kind === 'buff') buffUnit(d, x.p, u, oc.atk, oc.hp);
}

/** 溜め中の攻撃のうち、もう通らなくなったものを、その場で中断する（ブロッカーの登場・対象の死亡・壁の完成など）。 */
function recheckAttacks(d: Draft): void {
  if (d.rechecking) return;
  d.rechecking = true;
  for (let guard = 0; guard < 8; guard++) {
    let changed = false;
    for (const x of [...d.pending]) {
      if (x.kind !== 'attack') continue;
      const f = attackFail(d, x);
      if (!f) continue;
      cancelPending(d, x, f.reason, f.by);
      changed = true;
    }
    if (!changed) break;
    sweepCore(d);
  }
  d.rechecking = false;
}

function sweepDead(d: Draft): void {
  sweepCore(d);
  recheckAttacks(d);
}

function sweepCore(d: Draft): void {
  for (const p of [0, 1] as const) {
    const pl = d.players[p];
    pl.field.forEach((u, slot) => {
      if (!u || u.hp > 0) return;
      pl.field[slot] = null;
      d.events.push({ kind: 'death', p, uid: u.uid, card: u.card, slot });
      const od = abOf(u).onDeath;
      if (od?.kind === 'face') hurtPlayer(d, other(p), od.amount);
      if (od?.kind === 'buffAllies') for (const v of units(pl)) if (v.hp > 0 && CARDS[v.card].type === 'unit') buffUnit(d, p, v, od.atk, od.hp);
      if (od?.kind === 'poisonFoes') for (const v of units(d.players[other(p)])) if (v.hp > 0 && CARDS[v.card].type === 'unit') poisonUnit(d, other(p), v, od.amount);
    });
  }
}

function place(d: Draft, p: PlayerIndex, card: CardId, slot: number, token: boolean): Unit {
  const ab = CARDS[card].ab;
  // レベルの上乗せ（見習いなどのトークンは Lv1）。建築物は攻撃しないので HP だけ
  const bonus = token ? { atk: 0, hp: 0 } : levelBonus(d.players[p].levels?.[card] ?? 1);
  const isUnit = CARDS[card].type === 'unit';
  const unit: Unit = {
    uid: d.nextUid++,
    card,
    hp: CARDS[card].hp + bonus.hp,
    ...(bonus.hp > 0 ? { maxHp: CARDS[card].hp + bonus.hp } : {}),
    ...(isUnit && bonus.atk > 0 ? { atkBuff: bonus.atk } : {}),
    // 登場したときのクールタイムは半分（2 回目の攻撃からそのユニットのクールタイム）。速攻はなし
    readyAt: ab.haste ? d.time : d.time + Math.round(cooldownOf(d.players[p], card) / 2),
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
  const base = (end - state.time) * coinRate(state.time);
  const players = state.players.map((pl) => ({
    ...pl,
    coins: Math.min(COIN_MAX, pl.coins + base * coinBoostOf(pl)),
  })) as GameState['players'];
  // 最後の 1 分: クールタイムが 2 倍の速さで減る（早く明ける分だけ、readyAt を前へ）
  const fast = Math.max(0, end - Math.max(state.time, FAST_COOLDOWN_FROM_MS));
  if (fast > 0) {
    for (const pl of players) {
      pl.field = pl.field.map((u) => (u && u.readyAt > state.time ? { ...u, readyAt: Math.max(state.time, u.readyAt - fast) } : u));
    }
  }
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
      const pulse = b ? abOf(b).pulse : undefined;
      if (!b || !pulse || b.pulseAt === null) continue;
      while (b.pulseAt !== null && b.pulseAt <= d.time && b.hp > 0) {
        b.pulseAt += pulse.everyMs;
        d.events.push({ kind: 'pulse', p, uid: b.uid });
        const q = other(p);
        const mineUnits = units(pl).filter((u) => u.hp > 0 && CARDS[u.card].type === 'unit');
        const foeUnits = units(d.players[q]).filter((u) => u.hp > 0 && CARDS[u.card].type === 'unit' && !u.stealth);
        if (pulse.kind === 'token') {
          const empty = pl.field.findIndex((u) => !u);
          if (empty >= 0) place(d, p, 'apprentice', empty, true);
        } else if (pulse.kind === 'snipe') {
          const weakest = units(d.players[q])
            .filter((u) => u.hp > 0 && !u.stealth)
            .reduce<Unit | null>((m, u) => (!m || u.hp < m.hp ? u : m), null);
          if (weakest) hurtUnit(d, q, weakest, pulse.amount);
        } else if (pulse.kind === 'heal') {
          const hurt = mineUnits.filter((u) => u.hp < maxHpOf(u)).reduce<Unit | null>((m, u) => (!m || maxHpOf(u) - u.hp > maxHpOf(m) - m.hp ? u : m), null);
          if (hurt) healUnit(d, p, hurt, pulse.amount);
        } else if (pulse.kind === 'poison') {
          const top = foeUnits.reduce<Unit | null>((m, u) => (!m || attackOf(d.players[q], u) > attackOf(d.players[q], m) ? u : m), null);
          if (top) poisonUnit(d, q, top, pulse.amount);
        } else {
          const low = mineUnits.reduce<Unit | null>((m, u) => (!m || attackOf(pl, u) < attackOf(pl, m) ? u : m), null);
          if (low) buffUnit(d, p, low, pulse.atk, 0);
        }
      }
    }
  }
  sweepDead(d);
  return finish(state, d);
}

/** 攻撃を選んだ（始めた）ときのクールタイム。連撃は、1 回目はクールタイムなしで、2 回目に全体のクールタイム。 */
function startCooldown(d: Draft, p: PlayerIndex, u: Unit): void {
  if (isDoubleStrike(d.players[p], u) && !u.second) {
    u.second = true;
    u.readyAt = d.time;
  } else {
    u.second = undefined;
    u.readyAt = d.time + cooldownOf(d.players[p], u.card);
  }
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
      // 対象がいなくなったら予約は消える。ブロッカー・壁で狙えないだけなら、予約したまま待機する
      if (!freeTargets(foe).some((t) => sameTarget(t, u.reserved!))) {
        u.reserved = null;
        d.events.push({ kind: 'unreserve', p, uid: u.uid });
        changed = true;
        continue;
      }
      if (d.time < u.readyAt || isDisarmed(u, d.time) || d.pending.some((x) => x.kind === 'attack' && x.uid === u.uid)) continue;
      if (!legalAgainst(foe, u.reserved, u)) continue;
      const target = u.reserved;
      const readyBefore = u.readyAt;
      const secondBefore = !!u.second;
      startCooldown(d, p, u);
      u.stealth = false;
      windup(d, { id: d.nextUid++, kind: 'attack', p, uid: u.uid, target, at: d.time + WINDUP_MS, readyBefore, readyAfter: u.readyAt, secondBefore });
      changed = true;
    }
  }
  return changed ? finish(state, d) : state;
}

/** 攻撃の予約。クールタイム中（または溜め中）のユニットか、ブロッカー・壁で狙えない対象だけ予約できる。すぐ攻撃できるなら予約ではなく attack を使う。 */
function reserve(state: GameState, p: PlayerIndex, uid: number, target: Target | null): GameState {
  if (state.result) return state;
  const found = findUnit(state.players[p], uid);
  if (!found || CARDS[found.unit.card].type !== 'unit') return state;
  if (target === null) {
    if (!found.unit.reserved) return state;
  } else {
    if (!freeTargets(state.players[other(p)]).some((t) => sameTarget(t, target))) return state;
    const busy = state.time < found.unit.readyAt || state.pending.some((x) => x.kind === 'attack' && x.uid === uid);
    if (!busy && isLegalTarget(state, p, target, uid)) return state;
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
  if (effect.kind === 'ambush') {
    d.events.push({ kind: 'spell', p, card, target: null });
    const empty = pl.field.findIndex((u) => !u);
    if (empty >= 0) place(d, p, 'militia', empty, true);
    sweepDead(d);
    return finish(state, d);
  }
  if (effect.kind === 'parry') {
    // パリィ: 溜めなしですぐ効く。相手の溜め中の攻撃をすべて弾いて、攻撃元を足止めする
    d.events.push({ kind: 'spell', p, card, target: null });
    for (const x of [...d.pending]) {
      if (x.kind !== 'attack' || x.p === p) continue;
      cancelPending(d, x, 'parry');
      const u = findUnit(d.players[x.p], x.uid)?.unit;
      if (u) {
        u.readyAt = Math.max(u.readyAt, d.time) + effect.ms;
        d.events.push({ kind: 'stun', p: x.p, uid: u.uid });
      }
    }
    sweepDead(d);
    return finish(state, d);
  }
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
  } else if (effect.kind === 'healAll') {
    for (const u of units(pl)) if (CARDS[u.card].type === 'unit') healUnit(d, p, u, effect.amount);
  } else if (effect.kind === 'buffAll') {
    for (const u of units(pl)) if (CARDS[u.card].type === 'unit') buffUnit(d, p, u, effect.atk, effect.hp);
  } else if (effect.kind === 'poisonAll') {
    for (const u of units(foe)) if (CARDS[u.card].type === 'unit') poisonUnit(d, q, u, effect.amount);
  } else if (effect.kind === 'sealAll') {
    for (const u of units(foe)) sealUnit(d, q, u);
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
  if (!legalAgainst(foe, target, unit)) return false;
  const ab = abOf(unit);
  const atk = attackOf(me, unit);
  d.events.push({ kind: 'attack', p, uid, target });
  let dealtTotal = 0;
  if (!hit) {
    dealtTotal += hurtPlayer(d, q, atk + (ab.faceBonus ?? 0));
    // プレイヤーも反撃する（攻撃力 PLAYER_ATK）。遠隔は受けない
    if (!ab.ranged) hurtUnit(d, p, unit, PLAYER_ATK);
  } else {
    // 反撃は殴られる前の値で決まる（同時にぶつかる）。討伐は攻撃時だけで、反撃には乗らない
    const back = attackOf(foe, hit);
    dealtTotal += hurtUnit(d, q, hit, atk + (ab.unitBonus ?? 0));
    if (ab.splash) for (const v of units(foe)) if (v.uid !== hit.uid) dealtTotal += hurtUnit(d, q, v, ab.splash);
    if (!ab.ranged) hurtUnit(d, p, unit, back);
    // 毒の牙: 攻撃した相手に毒を与える
    if (ab.venom && hit.hp > 0) poisonUnit(d, q, hit, ab.venom);
    // 討伐: 自分の攻撃で倒した（攻撃した本人が生きていて、相手が倒れた）
    const ok = ab.onKill;
    if (ok && hit.hp <= 0 && unit.hp > 0) {
      if (ok.kind === 'coin') addCoins(d, p, ok.amount, unit.uid);
      else if (ok.kind === 'buff') buffUnit(d, p, unit, ok.atk, ok.hp);
      else healPlayer(d, p, ok.amount);
    }
  }
  // 吸血: 与えたダメージぶん、自分のプレイヤーが回復
  if (ab.lifesteal && dealtTotal > 0) healPlayer(d, p, dealtTotal);
  // 毒: 攻撃するたびに、毒の数だけダメージを受ける（結界・軽減は通らない）
  if (unit.poison && unit.hp > 0) {
    const dmg = Math.min(unit.hp, unit.poison);
    unit.hp -= dmg;
    d.events.push({ kind: 'damage', p, target: { kind: 'unit', uid: unit.uid }, amount: dmg, guard: null });
  }
  return true;
}

/** 召喚時に選んだ相手への効果の解決（溜めのあと）。召喚したカードか対象が消えていたら false（中断）。 */
function applyAbility(d: Draft, p: PlayerIndex, uid: number, card: CardId, target: number): boolean {
  const q = other(p);
  if (!findUnit(d.players[p], uid)) return false;
  const os = CARDS[card].ab.onSummon;
  const ally = summonSide(card) === 'ally';
  const side = ally ? p : q;
  const hit = ally ? findUnit(d.players[p], target)?.unit : pickable(d.players[q], target);
  if (!hit) return false;
  d.events.push({ kind: 'ability', p, uid, target });
  if (os?.kind === 'strike') hurtUnit(d, side, hit, os.amount);
  if (os?.kind === 'stun') {
    hit.readyAt = Math.max(hit.readyAt, d.time) + os.ms;
    d.events.push({ kind: 'stun', p: q, uid: hit.uid });
  }
  // 破壊: 結界・軽減を無視して HP を 0 にする（倒れたカードは sweepDead が場から除く）
  if (os?.kind === 'destroy') hit.hp = 0;
  if (os?.kind === 'poison') poisonUnit(d, side, hit, os.amount);
  if (os?.kind === 'seal') sealUnit(d, side, hit);
  if (os?.kind === 'disarm') disarmUnit(d, side, hit, os.ms);
  if (os?.kind === 'healAlly') healUnit(d, side, hit, os.amount);
  if (os?.kind === 'buffAlly') buffUnit(d, side, hit, os.atk, os.hp);
  return true;
}

/** 溜めが明けた行動を、選んだ順に解決する。1 つ解決するたびに倒れたカードを除く
 *  （先に倒れた攻撃元・対象の行動は中断になる）。 */
function resolvePending(state: GameState): GameState {
  const d = draftOf(state);
  // 溜めが明けた順に解決する（同時なら選んだ順）。まとめて時間が進んでも、登場が攻撃より先なら先に起きる
  const due = d.pending.filter((x) => x.at <= d.time).sort((x, y) => x.at - y.at || x.id - y.id);
  d.pending = d.pending.filter((x) => x.at > d.time);
  for (const x of due) {
    if (d.players[0].hp <= 0 || d.players[1].hp <= 0) break;
    const ok =
      x.kind === 'attack'
        ? applyAttack(d, x.p, x.uid, x.target)
        : x.kind === 'spell'
          ? applySpell(d, x.p, x.card, x.target)
          : x.kind === 'summon'
            ? landSummon(d, x.p, x.card, x.slot, x.target)
            : applyAbility(d, x.p, x.uid, x.card, x.target);
    if (!ok) {
      const f = x.kind === 'attack' ? attackFail(d, x) : null;
      cancelPending(d, x, f?.reason ?? 'target', f?.by);
    }
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
  if (SUMMON_WINDUP_MS > 0) {
    // 配置したあと、SUMMON_WINDUP_MS たってから登場する（枠は予約済み）
    windup(d, { id: d.nextUid++, kind: 'summon', p, card, slot, target, at: d.time + SUMMON_WINDUP_MS });
    return finish(state, d);
  }
  landSummon(d, p, card, slot, target);
  return finish(state, d);
}

/** カードが場に登場する（溜めのあと、または即時）。チェンジ・登場時の能力もここで起きる。 */
function landSummon(d: Draft, p: PlayerIndex, card: CardId, slot: number, target?: number): boolean {
  const pl = d.players[p];
  const old = pl.field[slot];
  let dodged: Extract<Pending, { kind: 'attack' }>[] = [];
  if (old) {
    // 自分のカードの上に召喚した: 元のカードは除くだけ（倒れたのではないので死亡時は起きない）
    pl.field[slot] = null;
    d.events.push({ kind: 'replace', p, uid: old.uid, card: old.card, slot });
    // 溜め中の行動: 元のカードの攻撃は消え、元のカードを狙っていた攻撃は空振り（かわされる）
    dodged = [];
    for (const x of [...d.pending]) {
      if (x.kind !== 'attack') continue;
      if (x.p === p && x.uid === old.uid) cancelPending(d, x, 'attacker');
      else if (x.p !== p && x.target.kind === 'unit' && x.target.uid === old.uid) dodged.push(x);
    }
  }
  const placed = place(d, p, card, slot, false);
  // チェンジでかわした攻撃は妨害になる（新しいカードの妨害時の能力も起きる）
  for (const x of dodged) cancelPending(d, x, 'dodge', placed.uid);
  if (old) {
    d.events.push({ kind: 'overwrite', p, uid: placed.uid, oldUid: old.uid, slot });
    // 生贄時: 入れ替わったカードの能力
    const orp = abOf(old).onReplaced;
    if (orp) {
      d.events.push({ kind: 'sacrifice', p, uid: old.uid, card: old.card, slot, effect: orp.kind });
      if (orp.kind === 'coin') addCoins(d, p, orp.amount, old.uid);
      else if (orp.kind === 'face') hurtPlayer(d, other(p), orp.amount);
      else if (orp.kind === 'heal') healPlayer(d, p, orp.amount);
      else buffUnit(d, p, placed, orp.atk, orp.hp);
    }
    // 上書き召喚時: 新しいカードの能力
    const oo = abOf(placed).onOverwrite;
    if (oo?.kind === 'buff') buffUnit(d, p, placed, oo.atk, oo.hp);
    else if (oo?.kind === 'refund') addCoins(d, p, Math.floor(CARDS[old.card].summon / 2), placed.uid);
    else if (oo?.kind === 'haste') placed.readyAt = d.time;
  }

  const os = CARDS[card].ab.onSummon;
  const q = other(p);
  if (os?.kind === 'token') {
    const empty = freeSlot(d, p, pl);
    if (empty >= 0) place(d, p, 'apprentice', empty, true);
  } else if (os?.kind === 'heal') {
    const healed = Math.min(PLAYER_HP - pl.hp, os.amount);
    if (healed > 0) {
      pl.hp += healed;
      d.events.push({ kind: 'heal', p, amount: healed });
    }
  } else if (os?.kind === 'buffAllies') {
    for (const u of units(pl)) if (u.uid !== placed.uid && CARDS[u.card].type === 'unit') buffUnit(d, p, u, os.atk, os.hp);
  } else if (os?.kind === 'buffClan') {
    for (const u of units(pl)) if (u.uid !== placed.uid && CARDS[u.card].ab.clan && CARDS[u.card].ab.clan === CARDS[card].ab.clan) buffUnit(d, p, u, os.atk, os.hp);
  } else if (os?.kind === 'clanBurst') {
    const n = 1 + clanOthers(pl, placed);
    hurtPlayer(d, q, n * os.per);
  } else if (os?.kind === 'cdCut') {
    for (const u of units(pl)) {
      if (u.uid === placed.uid || CARDS[u.card].type !== 'unit') continue;
      const next = Math.max(d.time, u.readyAt - os.ms);
      if (next < u.readyAt) {
        d.events.push({ kind: 'cdcut', p, uid: u.uid, ms: u.readyAt - next });
        u.readyAt = next;
      }
    }
  } else if (os?.kind === 'wipe') {
    d.events.push({ kind: 'wipe', p, uid: placed.uid });
    for (const side of [0, 1] as const) {
      for (const u of units(d.players[side])) {
        if (u.uid !== placed.uid && CARDS[u.card].type === 'unit') u.hp = 0;
      }
    }
  } else if (needsTarget(card) && target !== undefined && (summonSide(card) === 'ally' ? !!findUnit(d.players[p], target) : pickable(d.players[q], target))) {
    // 登場の溜めがあるときは、登場した瞬間に効く（さらに溜めない）
    if (SUMMON_WINDUP_MS > 0) applyAbility(d, p, placed.uid, card, target);
    else windup(d, { id: d.nextUid++, kind: 'ability', p, uid: placed.uid, card, target, at: d.time + WINDUP_MS });
  }
  sweepDead(d);
  return true;
}

function attack(state: GameState, p: PlayerIndex, uid: number, target: Target): GameState {
  if (attackBlock(state, p, uid, target)) return state;
  const d = draftOf(state);
  const me = d.players[p];
  const { unit } = findUnit(me, uid)!;
  const readyBefore = unit.readyAt;
  const secondBefore = !!unit.second;
  startCooldown(d, p, unit);
  unit.stealth = false; // 自分で攻撃を選んだらステルスは解ける
  unit.reserved = target; // 攻撃した対象をターゲットとして残す（明けるたびに攻撃し続ける）
  windup(d, { id: d.nextUid++, kind: 'attack', p, uid, target, at: d.time + WINDUP_MS, readyBefore, readyAfter: unit.readyAt, secondBefore });
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
/** 空いていて、登場待ちの予約も無い枠（なければ -1）。 */
export function freeSlot(state: Pick<GameState, 'pending'>, p: PlayerIndex, pl?: PlayerState): number {
  const field = (pl ?? (state as GameState).players[p]).field;
  return field.findIndex((u, i) => !u && !state.pending.some((x) => x.kind === 'summon' && x.p === p && x.slot === i));
}

export function firstEmptySlot(pl: PlayerState): number {
  return pl.field.findIndex((u) => !u);
}
