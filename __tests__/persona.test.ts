import { describe, expect, it } from 'vitest';

import { cpuStep, createBrain, moodOf, WHIM_MS, type CpuPersona } from '../src/ai/cpu';
import { RIVAL_DECKS, STARTER_DECK } from '../src/game/cards';
import { createGame, step, type Action, type PlayerIndex } from '../src/game/engine';
import { makeRng } from '../src/game/rng';
import { ARENAS } from '../src/storage/trophy';

/** 相手（1 番）の性格だけを変えて 1 試合。召喚した時刻の列を返す。 */
function play(persona: CpuPersona, seed: number): number[] {
  let st = createGame([STARTER_DECK, RIVAL_DECKS[0]!.deck], seed);
  const br = [createBrain(), createBrain(persona, seed)];
  const rd = [makeRng(seed * 2 + 1), makeRng(seed * 2 + 2)];
  const times: number[] = [];
  while (!st.result && st.time < 60_000) {
    st = step(st, { type: 'tick', dt: 50 });
    for (const p of [0, 1] as PlayerIndex[]) {
      const r = cpuStep(st, p, br[p]!, 'normal', rd[p]!);
      br[p] = r.brain;
      for (const a of r.actions as Action[]) {
        if (a.type === 'summon' && p === 1) times.push(st.time);
        st = step(st, a);
      }
    }
  }
  return times;
}

describe('CPU の性格', () => {
  it('既定（plain）は性格を付ける前と同じ打ち方', () => {
    expect(play('plain', 3)).toEqual(play('plain', 3));
    expect(createBrain().persona).toBe('plain');
  });

  it('性格が違えば打ち方が変わる', () => {
    const plain = play('plain', 5);
    expect(play('rush', 5)).not.toEqual(plain);
    expect(play('hoard', 5)).not.toEqual(plain);
  });

  it('きまぐれは 30 秒ごとに 3 つの性格を乗り換える', () => {
    const b = createBrain('whim', 1);
    const seen = new Set([0, 1, 2].map((k) => moodOf(b, k * WHIM_MS + 1)));
    expect(seen).toEqual(new Set(['rush', 'guard', 'hoard']));
  });

  it('アリーナごとに性格が違う', () => {
    expect(new Set(ARENAS.map((a) => a.persona)).size).toBe(ARENAS.length);
  });
});
