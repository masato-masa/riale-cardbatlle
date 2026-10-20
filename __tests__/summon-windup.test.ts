import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CARDS, STARTER_DECK, type CardId } from '../src/game/cards';
import { createGame, findUnit, step, summonBlock, type GameState, type PlayerIndex, type Unit } from '../src/game/engine';
import { COIN_MAX, overrideSummonWindupForTests, SUMMON_WINDUP_MS } from '../src/game/rules';

beforeEach(() => overrideSummonWindupForTests(500));
afterEach(() => overrideSummonWindupForTests(0));

const fresh = (): GameState => createGame([STARTER_DECK, STARTER_DECK], 1);
const tick = (s: GameState, dt: number): GameState => step(s, { type: 'tick', dt });
const unitOf = (s: GameState, p: PlayerIndex, uid: number): Unit | undefined => findUnit(s.players[p], uid)?.unit;
function withHand(s: GameState, p: PlayerIndex, hand: CardId[], coins = COIN_MAX): GameState {
  const pl = { ...s.players[p], hand: [...hand, ...s.players[p].hand.slice(hand.length)], coins };
  return { ...s, players: p === 0 ? [pl, s.players[1]] : [s.players[0], pl] };
}
function place(s: GameState, p: PlayerIndex, slot: number, card: CardId): [GameState, Unit] {
  const unit: Unit = { uid: s.nextUid, card, hp: CARDS[card].hp, readyAt: 0, barrier: false, stealth: false, pulseAt: null, reserved: null };
  const field = [...s.players[p].field];
  field[slot] = unit;
  const pl = { ...s.players[p], field };
  return [{ ...s, players: p === 0 ? [pl, s.players[1]] : [s.players[0], pl], nextUid: s.nextUid + 1 }, unit];
}

describe('登場の溜め（配置してから 1 秒後に登場）', () => {
  it('配置するとコインと手札はすぐ使い、場には 1 秒後に出る', () => {
    let s = withHand(fresh(), 0, ['knight'], 6);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 1 });
    expect(s.players[0].coins).toBe(6 - CARDS.knight.summon);
    expect(s.players[0].field[1]).toBeNull();
    expect(s.pending.some((x) => x.kind === 'summon')).toBe(true);
    s = tick(s, SUMMON_WINDUP_MS - 10);
    expect(s.players[0].field[1]).toBeNull();
    s = tick(s, 20);
    expect(s.players[0].field[1]?.card).toBe('knight');
  });

  it('登場待ちの枠には、ほかのカードを置けない。ほかの枠は置ける', () => {
    let s = withHand(fresh(), 0, ['knight', 'recruit']);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 1 });
    expect(summonBlock(s, 0, 1, 1)).toBe('slot');
    expect(summonBlock(s, 0, 1, 0)).toBeNull();
  });

  it('攻撃を見てから 0.5 秒以内に出したブロッカーは、間に合って妨害できる', () => {
    let [s, a] = place(fresh(), 0, 0, 'knight');
    let t: Unit;
    [s, t] = place(s, 1, 0, 'footman');
    s = step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'unit', uid: t.uid } });
    s = tick(s, 300);
    s = withHand(s, 1, ['guard']);
    s = step(s, { type: 'summon', p: 1, handIndex: 0, slot: 1 }); // 攻撃開始から 0.3 秒後に配置 → 0.8 秒後に登場
    s = tick(s, 800);
    expect(s.events.some((e) => e.kind === 'cancel' && e.reason === 'blocked')).toBe(true);
    expect(unitOf(s, 1, t.uid)!.hp).toBe(CARDS.footman.hp);
  });

  it('遅れて（0.6 秒後に）出したブロッカーは間に合わず、攻撃が当たる', () => {
    let [s, a] = place(fresh(), 0, 0, 'knight');
    let t: Unit;
    [s, t] = place(s, 1, 0, 'footman');
    s = step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'unit', uid: t.uid } });
    s = tick(s, 600);
    s = withHand(s, 1, ['guard']);
    s = step(s, { type: 'summon', p: 1, handIndex: 0, slot: 1 }); // 1.1 秒後に登場。攻撃は 1.0 秒後
    s = tick(s, 600);
    expect(unitOf(s, 1, t.uid)).toBeUndefined();
  });

  it('先読みして先に出したブロッカーなら、攻撃を妨害できる', () => {
    let [s, a] = place(fresh(), 0, 0, 'knight');
    let t: Unit;
    [s, t] = place(s, 1, 0, 'footman');
    s = withHand(s, 1, ['guard']);
    s = step(s, { type: 'summon', p: 1, handIndex: 0, slot: 1 }); // 先に配置
    s = tick(s, 100);
    s = step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'unit', uid: t.uid } }); // 攻撃開始（溜め 1 秒）
    s = tick(s, 500); // ブロッカーが登場（配置から 0.6 秒）→ 攻撃は溜めの途中で止まる
    expect(s.events.some((e) => e.kind === 'cancel' && e.reason === 'blocked')).toBe(true);
    expect(unitOf(s, 1, t.uid)!.hp).toBe(CARDS.footman.hp);
  });

  it('登場時に敵を選ぶ効果は、登場した瞬間に効く', () => {
    let [s, foe] = place(fresh(), 1, 0, 'ogre');
    s = withHand(s, 0, ['taxman']);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: foe.uid });
    expect(unitOf(s, 1, foe.uid)!.hp).toBe(CARDS.ogre.hp);
    s = tick(s, SUMMON_WINDUP_MS);
    expect(unitOf(s, 1, foe.uid)!.hp).toBe(CARDS.ogre.hp - 2);
  });

  it('チェンジ: 自分のカードの上に配置しても、入れ替わるのは登場の瞬間', () => {
    let [s, old] = place(fresh(), 0, 0, 'recruit');
    s = withHand(s, 0, ['knight']);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(unitOf(s, 0, old.uid)).toBeDefined();
    s = tick(s, SUMMON_WINDUP_MS);
    expect(unitOf(s, 0, old.uid)).toBeUndefined();
    expect(s.players[0].field[0]?.card).toBe('knight');
  });
});
