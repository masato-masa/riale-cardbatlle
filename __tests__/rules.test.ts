import { describe, expect, it } from 'vitest';

import { aimOf, CARDS, STARTER_DECK, type CardId } from '../src/game/cards';
import { chooseTarget, createGame, findUnit, step, type GameState, type PlayerIndex, type Rules, type Unit } from '../src/game/engine';
import { WINDUP_MS } from '../src/game/rules';

const AUTO: Rules = { auto: true, counter: true };
const AUTO_NO_COUNTER: Rules = { auto: true, counter: false };

const fresh = (rules?: Rules): GameState => createGame([STARTER_DECK, STARTER_DECK], 1, rules);

function place(s: GameState, p: PlayerIndex, slot: number, card: CardId, readyAt = 0): [GameState, Unit] {
  const unit: Unit = {
    uid: s.nextUid,
    card,
    hp: CARDS[card].hp,
    readyAt,
    barrier: !!CARDS[card].ab.barrier,
    stealth: !!CARDS[card].ab.stealth,
    pulseAt: null,
    reserved: null,
  };
  const field = [...s.players[p].field];
  field[slot] = unit;
  const pl = { ...s.players[p], field };
  const players: GameState['players'] = p === 0 ? [pl, s.players[1]] : [s.players[0], pl];
  return [{ ...s, players, nextUid: s.nextUid + 1 }, unit];
}

const tick = (s: GameState, dt: number) => step(s, { type: 'tick', dt });
const unitOf = (s: GameState, p: PlayerIndex, uid: number) => findUnit(s.players[p], uid)?.unit;

describe('ルール案 2・3（自動攻撃）', () => {
  it('カードの狙い方は能力から決まる', () => {
    expect(aimOf('lancer')).toBe('unit');
    expect(aimOf('herald')).toBe('player'); // 速攻
    expect(aimOf('marksman')).toBe('weak'); // 狙い撃ち
  });

  it('ユニット優先: 一番近い敵カードを狙う', () => {
    let s = fresh(AUTO);
    let me: Unit;
    let near: Unit;
    [s, me] = place(s, 0, 0, 'lancer', 1000);
    [s] = place(s, 1, 2, 'recruit', 99_999);
    [s, near] = place(s, 1, 0, 'recruit', 99_999);
    expect(chooseTarget(s.players[1], me, 0)).toEqual({ kind: 'unit', uid: near.uid });
  });

  it('ユニット優先: 同じ近さなら HP の低い方、それも同じなら攻撃の低い方、それも同じなら先に出た方', () => {
    let s = fresh(AUTO);
    let me: Unit;
    let a: Unit;
    let b: Unit;
    [s, me] = place(s, 0, 1, 'lancer');
    [s, a] = place(s, 1, 0, 'recruit');
    [s, b] = place(s, 1, 2, 'recruit');
    expect(chooseTarget(s.players[1], me, 1)).toEqual({ kind: 'unit', uid: a.uid }); // 同じカードなら先に出た方
    const hurt = s.players[1].field.map((u) => (u && u.uid === b.uid ? { ...u, hp: 1 } : u));
    s = { ...s, players: [s.players[0], { ...s.players[1], field: hurt }] };
    expect(chooseTarget(s.players[1], me, 1)).toEqual({ kind: 'unit', uid: b.uid }); // HP の低い方
  });

  it('一度狙った敵カードは、倒すまで変えない（もっと近いカードが出ても）', () => {
    let s = fresh(AUTO);
    let me: Unit;
    let far: Unit;
    [s, me] = place(s, 0, 0, 'lancer', 5000);
    [s, far] = place(s, 1, 2, 'recruit', 99_999);
    s = tick(s, 100);
    expect(unitOf(s, 0, me.uid)!.reserved).toEqual({ kind: 'unit', uid: far.uid });
    [s] = place(s, 1, 0, 'recruit', 99_999);
    s = tick(s, 100);
    expect(unitOf(s, 0, me.uid)!.reserved).toEqual({ kind: 'unit', uid: far.uid });
  });

  it('クールタイムが明けると自分で攻撃する。敵カードがいなければプレイヤーへ', () => {
    let s = fresh(AUTO);
    [s] = place(s, 0, 0, 'lancer', 0);
    s = tick(s, 50);
    s = tick(s, WINDUP_MS + 50);
    expect(s.players[1].hp).toBe(20 - CARDS.lancer.atk);
  });

  it('プレイヤー優先: 狙えればプレイヤー、ブロッカーがいればユニット優先と同じ', () => {
    let s = fresh(AUTO);
    let me: Unit;
    let g: Unit;
    [s, me] = place(s, 0, 0, 'herald');
    [s] = place(s, 1, 0, 'recruit');
    expect(chooseTarget(s.players[1], me, 0)).toEqual({ kind: 'player' });
    [s, g] = place(s, 1, 2, 'guard');
    expect(chooseTarget(s.players[1], me, 0)).toEqual({ kind: 'unit', uid: g.uid });
  });

  it('手動の攻撃は受け付けない', () => {
    let s = fresh(AUTO);
    let me: Unit;
    [s, me] = place(s, 0, 0, 'lancer');
    const n = step(s, { type: 'attack', p: 0, uid: me.uid, target: { kind: 'player' } });
    expect(n).toBe(s);
  });

  it('案 3（反撃なし）: 攻撃したカードは反撃を受けない。案 2 は受ける', () => {
    for (const [rules, hurt] of [
      [AUTO, true],
      [AUTO_NO_COUNTER, false],
    ] as [Rules, boolean][]) {
      let s = fresh(rules);
      let me: Unit;
      [s, me] = place(s, 0, 0, 'lancer', 0);
      [s] = place(s, 1, 0, 'recruit', 99_999);
      s = tick(s, 50);
      s = tick(s, WINDUP_MS + 50);
      expect(unitOf(s, 0, me.uid)!.hp < CARDS.lancer.hp).toBe(hurt);
    }
  });

  it('クールタイムの倍率: 0.5 なら攻撃のあとのクールタイムが半分', () => {
    let s = fresh({ auto: true, counter: true, cdScale: 0.5 });
    let me: Unit;
    [s, me] = place(s, 0, 0, 'lancer', 0);
    s = tick(s, 50);
    expect(unitOf(s, 0, me.uid)!.readyAt).toBe(s.time + Math.round(CARDS.lancer.cd * 0.5));
  });
});
