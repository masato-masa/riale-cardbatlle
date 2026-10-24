import { describe, expect, it } from 'vitest';

import { RIVAL_DECKS } from '../src/game/cards';
import { applyTrophies, ARENAS, arenaIndex, rivalFor, trophyDelta } from '../src/storage/trophy';

describe('トロフィーとアリーナ', () => {
  it('アリーナは閾値で上がる', () => {
    expect(arenaIndex(0)).toBe(0);
    expect(arenaIndex(299)).toBe(0);
    expect(arenaIndex(300)).toBe(1);
    expect(arenaIndex(5000)).toBe(ARENAS.length - 1);
  });

  it('強い CPU に勝つほど多く増え、弱い CPU に負けるほど多く減る。引き分けは変わらない', () => {
    expect(trophyDelta('hard', 0)).toBeGreaterThan(trophyDelta('normal', 0));
    expect(trophyDelta('normal', 0)).toBeGreaterThan(trophyDelta('easy', 0));
    expect(trophyDelta('easy', 1)).toBeLessThan(trophyDelta('hard', 1));
    expect(trophyDelta('normal', null)).toBe(0);
  });

  it('0 未満にならず、いまのアリーナの下限より下へは落ちない（昇格は下がらない）', () => {
    expect(applyTrophies(5, 'easy', 1)).toBe(0);
    expect(applyTrophies(305, 'easy', 1)).toBe(300);
    expect(applyTrophies(300, 'normal', 0)).toBe(325);
  });

  it('アリーナごとに出る相手デッキの幅が広がり、プールの名前はすべて実在する', () => {
    const names = new Set(RIVAL_DECKS.map((d) => d.name));
    for (const a of ARENAS) for (const n of a.pool) expect(names.has(n)).toBe(true);
    for (let i = 1; i < ARENAS.length; i++) expect(ARENAS[i]!.from).toBeGreaterThan(ARENAS[i - 1]!.from);
    const seen0 = new Set(Array.from({ length: 60 }, (_, s) => rivalFor(s, 0).name));
    expect([...seen0].every((n) => ARENAS[0]!.pool.includes(n))).toBe(true);
    const seenTop = new Set(Array.from({ length: 200 }, (_, s) => rivalFor(s, 5000).name));
    expect(seenTop.size).toBe(RIVAL_DECKS.length);
  });
});
