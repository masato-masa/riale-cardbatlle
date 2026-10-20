import { describe, expect, it } from 'vitest';

import { CARDS, STARTER_DECK, type CardId } from '../src/game/cards';
import { attackOf, createGame, findUnit, step, type GameState, type PlayerIndex, type Unit } from '../src/game/engine';
import { COIN_MAX, PLAYER_HP, WINDUP_MS } from '../src/game/rules';

const fresh = (): GameState => createGame([STARTER_DECK, STARTER_DECK], 1);
const unitOf = (s: GameState, p: PlayerIndex, uid: number): Unit | undefined => findUnit(s.players[p], uid)?.unit;

function place(s: GameState, p: PlayerIndex, slot: number, card: CardId): [GameState, Unit] {
  const unit: Unit = { uid: s.nextUid, card, hp: CARDS[card].hp, readyAt: 0, barrier: false, stealth: false, pulseAt: null, reserved: null };
  const field = [...s.players[p].field];
  field[slot] = unit;
  const pl = { ...s.players[p], field };
  return [{ ...s, players: p === 0 ? [pl, s.players[1]] : [s.players[0], pl], nextUid: s.nextUid + 1 }, unit];
}
function withHand(s: GameState, hand: CardId[]): GameState {
  const pl = { ...s.players[0], hand: [...hand, ...s.players[0].hand.slice(hand.length)], coins: COIN_MAX };
  return { ...s, players: [pl, s.players[1]] };
}

describe('Ｋ一族', () => {
  it('ボヤン: ほかの K 一族がいるとき攻撃力 +2', () => {
    let [s, b] = place(fresh(), 0, 0, 'kboyan');
    expect(attackOf(s.players[0], b)).toBe(3);
    [s] = place(s, 0, 1, 'kleen');
    expect(attackOf(s.players[0], unitOf(s, 0, b.uid)!)).toBe(5);
  });
  it('ヴァヴ: 登場時、場のほかの K 一族全員が +1/+1。一族でないカードは対象外', () => {
    let [s, a] = place(fresh(), 0, 0, 'kleen');
    let o: Unit;
    [s, o] = place(s, 0, 1, 'recruit');
    s = step(withHand(s, ['kvav']), { type: 'summon', p: 0, handIndex: 0, slot: 2 });
    expect(unitOf(s, 0, a.uid)!.hp).toBe(CARDS.kleen.hp + 1);
    expect(unitOf(s, 0, o.uid)!.hp).toBe(CARDS.recruit.hp);
  });
  it('リーン: ほかの K 一族がいるときだけダメージ -1', () => {
    // 一人のとき: ダメージ 3 をそのまま受ける
    let [s, l] = place(fresh(), 0, 0, 'kleen');
    let a: Unit;
    [s, a] = place(s, 1, 0, 'lancer');
    s = step(s, { type: 'attack', p: 1, uid: a.uid, target: { kind: 'unit', uid: l.uid } });
    s = step(s, { type: 'tick', dt: WINDUP_MS });
    expect(unitOf(s, 0, l.uid)!.hp).toBe(CARDS.kleen.hp - CARDS.lancer.atk);
    // 一族がいるとき: -1
    let [t, l2] = place(fresh(), 0, 0, 'kleen');
    [t] = place(t, 0, 1, 'kboyan');
    let a2: Unit;
    [t, a2] = place(t, 1, 0, 'lancer');
    t = step(t, { type: 'attack', p: 1, uid: a2.uid, target: { kind: 'unit', uid: l2.uid } });
    t = step(t, { type: 'tick', dt: WINDUP_MS });
    expect(unitOf(t, 0, l2.uid)!.hp).toBe(CARDS.kleen.hp - (CARDS.lancer.atk - 1));
  });
  it('ローダ: ほかの K 一族が 2 体以上のとき連撃（1 回目のあと、すぐ 2 回目が打てる）。1 体以下では普通のクールタイム', () => {
    const run = (mates: CardId[]) => {
      let [s, r] = place(fresh(), 0, 0, 'kroda');
      mates.forEach((m, i) => ([s] = place(s, 0, i + 1, m)));
      let foe: Unit;
      [s, foe] = place(s, 1, 0, 'ogre');
      s = step(s, { type: 'attack', p: 0, uid: r.uid, target: { kind: 'unit', uid: foe.uid } });
      return { s, r };
    };
    const two = run(['kleen', 'kvav']);
    expect(unitOf(two.s, 0, two.r.uid)!.readyAt).toBe(two.s.time);
    const one = run(['kleen']);
    expect(unitOf(one.s, 0, one.r.uid)!.readyAt).toBeGreaterThan(one.s.time);
  });
  it('デラ: 登場時、場の K 一族（自分を含む）1 体につき敵プレイヤーに 2 ダメージ', () => {
    let [s] = place(fresh(), 0, 0, 'kleen');
    [s] = place(s, 0, 1, 'kboyan');
    s = step(withHand(s, ['kdera']), { type: 'summon', p: 0, handIndex: 0, slot: 2 });
    expect(s.players[1].hp).toBe(PLAYER_HP - 6);
  });
});
