import { describe, expect, it } from 'vitest';

import { hintsFor, type MatchLog } from '../src/game/hints';

const base: MatchLog = { won: false, coinCapMs: 0, matchMs: 200_000, myAttacksBlocked: 0, interrupts: 0, interruptChances: 0, faceTaken: 0, faceDealt: 0, reserves: 3 };

describe('試合後の振り返り', () => {
  it('負け: コインのあふれ・割り込みの見逃しを、大事な順に 2 つまで', () => {
    const h = hintsFor({ ...base, coinCapMs: 40_000, interruptChances: 3, myAttacksBlocked: 4 });
    expect(h.map((x) => x.id)).toEqual(['coins', 'interrupt']);
  });
  it('負けで当てはまる点が無くても、何か一言出る', () => {
    expect(hintsFor(base)).toHaveLength(1);
  });
  it('勝ち: 良かった点を出す', () => {
    expect(hintsFor({ ...base, won: true, interrupts: 3 })[0]!.id).toBe('good-interrupt');
  });
});
