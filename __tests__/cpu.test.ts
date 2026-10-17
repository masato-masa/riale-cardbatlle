import { describe, expect, it } from 'vitest';

import { cpuStep, createBrain } from '../src/ai/cpu';
import { CARDS, STARTER_DECK, type CardId } from '../src/game/cards';
import { createGame, isWalled, step, type GameState, type PlayerIndex, type Unit } from '../src/game/engine';
import { COIN_MAX, FIELD_SLOTS } from '../src/game/rules';
import { makeRng } from '../src/game/rng';

function setup(hand: CardId[], mine: CardId[], foe: [CardId, number?][]): GameState {
  const s = createGame([STARTER_DECK, STARTER_DECK], 1);
  let uid = 1;
  const mk = (card: CardId, hp?: number): Unit => ({
    uid: uid++,
    card,
    hp: hp ?? CARDS[card].hp,
    readyAt: 0,
    barrier: !!CARDS[card].ab.barrier,
  });
  const field = (list: [CardId, number?][]) =>
    Array.from({ length: FIELD_SLOTS }, (_, i) => (list[i] ? mk(list[i]![0], list[i]![1]) : null));
  return {
    ...s,
    time: 5000,
    nextUid: 100,
    players: [
      { ...s.players[0], hand, coins: COIN_MAX, field: field(mine.map((c) => [c] as [CardId])) },
      { ...s.players[1], coins: 0, field: field(foe) },
    ],
  };
}

/** 何度か考えさせて、出てきた操作をすべて集める。 */
function actionsOf(s: GameState, p: PlayerIndex, level: 'easy' | 'normal' | 'hard' = 'hard') {
  const out = [];
  for (let seed = 1; seed <= 20; seed++) {
    const r = cpuStep(s, p, { ...createBrain(), nextThinkAt: 0 }, level, makeRng(seed));
    out.push(...r.actions);
  }
  return out;
}

describe('CPU の能力の使い方', () => {
  it('狙撃は相手のカードを選んで target を渡す（倒せる相手）', () => {
    const s = setup(['taxman', 'guard', 'guard', 'guard'], [], [['herald', 2], ['guard'], ['craftsman']]);
    const a = actionsOf(s, 0).filter((x) => x.type === 'summon' && x.handIndex === 0);
    expect(a.length).toBeGreaterThan(0);
    for (const x of a) {
      expect(x.type === 'summon' && x.target).toBeTruthy();
    }
    // 最初の的（uid 1: 体力 2 の伝令）は倒せるので選ばれる
    expect(a.some((x) => x.type === 'summon' && x.target === 1)).toBe(true);
  });

  it('足止も target を渡す。渡された操作を engine が受け付ける', () => {
    const s = setup(['informer', 'guard', 'guard', 'guard'], [], [['inspector'], ['herald']]);
    const a = actionsOf(s, 0).find((x) => x.type === 'summon' && x.handIndex === 0);
    expect(a).toBeTruthy();
    const n = step(s, a!);
    expect(n).not.toBe(s);
    expect(n.events.some((e) => e.kind === 'stun')).toBe(true);
  });

  it('相手が壁なら顔を攻撃しない', () => {
    const s = setup(['guard', 'guard', 'guard', 'guard'], ['craftsman'], [
      ['herald'], ['herald'], ['herald'], ['herald'], ['herald'],
    ]);
    expect(isWalled(s.players[1])).toBe(true);
    for (const x of actionsOf(s, 0)) {
      if (x.type === 'attack') expect(x.target.kind).toBe('unit');
    }
  });
});
