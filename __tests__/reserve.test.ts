// 攻撃の予約: クールタイム中に対象を選んでおくと、明けた瞬間にその対象への攻撃（溜め）を始める。
// 対象が倒れた・ブロッカーや壁で狙えなくなったら、その時点で予約は消える。溜め中の攻撃も、当たる瞬間に狙えなければ中断。
import { describe, expect, it } from 'vitest';

import { CARDS, STARTER_DECK, type CardId } from '../src/game/cards';
import { createGame, findUnit, step, type GameState, type PlayerIndex, type Target, type Unit } from '../src/game/engine';
import { COIN_MAX, FIELD_SLOTS, PLAYER_HP, WINDUP_MS } from '../src/game/rules';

const fresh = (): GameState => createGame([STARTER_DECK, STARTER_DECK], 1);
const tick = (s: GameState, dt: number): GameState => step(s, { type: 'tick', dt });
const atk = (s: GameState, p: PlayerIndex, uid: number, target: Target): GameState => step(s, { type: 'attack', p, uid, target });
const rsv = (s: GameState, p: PlayerIndex, uid: number, target: Target | null): GameState =>
  step(s, { type: 'reserve', p, uid, target });
const U = (uid: number): Target => ({ kind: 'unit', uid });
const FACE: Target = { kind: 'player' };
const unitOf = (s: GameState, p: PlayerIndex, uid: number): Unit | undefined => findUnit(s.players[p], uid)?.unit;
const HAND4: CardId[] = ['herald', 'herald', 'herald', 'herald'];

function withHand(hand: CardId[], coins = COIN_MAX): GameState {
  const s = fresh();
  const mk = (p: 0 | 1) => ({ ...s.players[p], hand, coins });
  return { ...s, players: [mk(0), mk(1)] };
}

function place(s: GameState, p: PlayerIndex, slot: number, card: CardId, readyAt = 0, hp?: number): [GameState, Unit] {
  const ab = CARDS[card].ab;
  const unit: Unit = {
    uid: s.nextUid,
    card,
    hp: hp ?? CARDS[card].hp,
    readyAt,
    barrier: !!ab.barrier,
    stealth: !!ab.stealth,
    pulseAt: null,
    reserved: null,
  };
  const field = [...s.players[p].field];
  field[slot] = unit;
  const pl = { ...s.players[p], field };
  const players: GameState['players'] = p === 0 ? [pl, s.players[1]] : [s.players[0], pl];
  return [{ ...s, players, nextUid: s.nextUid + 1 }, unit];
}

describe('攻撃の予約', () => {
  it('クールタイム中だけ予約できる（すぐ攻撃できるなら予約は受け付けない）', () => {
    const [s, a] = place(withHand(HAND4), 0, 0, 'craftsman', 0);
    expect(rsv(s, 0, a.uid, FACE)).toBe(s);
    const [s2, b] = place(s, 0, 1, 'craftsman', 5000);
    const n = rsv(s2, 0, b.uid, FACE);
    expect(unitOf(n, 0, b.uid)!.reserved).toEqual(FACE);
    expect(n.events.some((e) => e.kind === 'reserve')).toBe(true);
  });

  it('明けた瞬間に予約した対象への攻撃（溜め）を始め、溜めのあとに当たる', () => {
    const [s0, a] = place(withHand(HAND4), 0, 0, 'craftsman', 3000);
    let s = rsv(s0, 0, a.uid, FACE);
    s = tick(s, 2999);
    expect(s.pending).toHaveLength(0);
    s = tick(s, 1);
    expect(s.pending).toHaveLength(1);
    expect(unitOf(s, 0, a.uid)!.reserved).toBeNull();
    expect(unitOf(s, 0, a.uid)!.readyAt).toBe(3000 + CARDS.craftsman.cd);
    s = tick(s, WINDUP_MS);
    expect(s.players[1].hp).toBe(PLAYER_HP - CARDS.craftsman.atk);
  });

  it('対象が倒れたら、その時点で予約が消える', () => {
    let [s, a] = place(withHand(HAND4), 0, 0, 'craftsman', 9000);
    let k: Unit, v: Unit;
    [s, k] = place(s, 0, 1, 'craftsman', 0);
    [s, v] = place(s, 1, 0, 'herald', 0, 1);
    s = rsv(s, 0, a.uid, U(v.uid));
    s = atk(s, 0, k.uid, U(v.uid));
    s = tick(s, WINDUP_MS);
    expect(unitOf(s, 1, v.uid)).toBeUndefined();
    expect(unitOf(s, 0, a.uid)!.reserved).toBeNull();
    expect(s.events.some((e) => e.kind === 'unreserve' && e.uid === a.uid)).toBe(true);
  });

  it('ブロッカーが出たら、ブロッカー以外への予約は消える', () => {
    let [s, a] = place(withHand(['guard', 'herald', 'herald', 'herald']), 0, 0, 'craftsman', 9000);
    s = rsv(s, 0, a.uid, FACE);
    s = step(s, { type: 'summon', p: 1, handIndex: 0, slot: 0 });
    s = tick(s, 16);
    expect(unitOf(s, 0, a.uid)!.reserved).toBeNull();
  });

  it('相手の場が埋まって壁になったら、プレイヤーへの予約は消える', () => {
    let [s, a] = place(withHand(HAND4), 0, 0, 'craftsman', 9000);
    s = rsv(s, 0, a.uid, FACE);
    for (let i = 0; i < FIELD_SLOTS; i++) [s] = place(s, 1, i, 'herald');
    s = tick(s, 16);
    expect(unitOf(s, 0, a.uid)!.reserved).toBeNull();
  });

  it('予約は取り消せる。攻撃したら予約は消える', () => {
    const [s0, a] = place(withHand(HAND4), 0, 0, 'craftsman', 9000);
    const s = rsv(s0, 0, a.uid, FACE);
    expect(unitOf(rsv(s, 0, a.uid, null), 0, a.uid)!.reserved).toBeNull();
  });
});

describe('溜め中の攻撃は、当たる瞬間に狙えなければ中断', () => {
  it('溜めの間にブロッカーが出たら、プレイヤーへの攻撃は中断', () => {
    let [s, a] = place(withHand(['guard', 'herald', 'herald', 'herald']), 0, 0, 'craftsman', 0);
    s = atk(s, 0, a.uid, FACE);
    s = step(s, { type: 'summon', p: 1, handIndex: 0, slot: 0 });
    s = tick(s, WINDUP_MS);
    expect(s.players[1].hp).toBe(PLAYER_HP);
    expect(s.events.some((e) => e.kind === 'cancel')).toBe(true);
  });
});
