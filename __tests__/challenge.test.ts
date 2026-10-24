import { beforeEach, describe, expect, it } from 'vitest';

import { RIVAL_DECKS } from '../src/game/cards';
import { challengeFor, clearChallenge, isChallengeCleared } from '../src/storage/challenge';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
});

describe('きょうのチャレンジ', () => {
  it('相手は日付で決まり、実在するデッキ。日によって変わる', () => {
    const names = new Set(RIVAL_DECKS.map((d) => d.name));
    const days = Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`);
    for (const d of days) {
      expect(names.has(challengeFor(d))).toBe(true);
      expect(challengeFor(d)).toBe(challengeFor(d));
    }
    expect(new Set(days.map((d) => challengeFor(d))).size).toBeGreaterThan(5);
  });

  it('ごほうびはその日 1 回だけ。次の日はまた取れる', () => {
    expect(isChallengeCleared('2026-11-01')).toBe(false);
    expect(clearChallenge('2026-11-01')).toBe(true);
    expect(clearChallenge('2026-11-01')).toBe(false);
    expect(isChallengeCleared('2026-11-01')).toBe(true);
    expect(clearChallenge('2026-11-02')).toBe(true);
  });
});
