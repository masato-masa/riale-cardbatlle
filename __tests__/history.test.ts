import { beforeEach, describe, expect, it } from 'vitest';

import { loadHistory, pushHistory, summarize, type MatchRecord } from '../src/storage/history';

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

const rec = (result: MatchRecord['result'], level: MatchRecord['level'], rival: string, played: MatchRecord['played'] = {}): MatchRecord => ({ result, level, rival, played, sec: 120 });

describe('戦績', () => {
  it('直近 50 試合まで、新しい順に残す', () => {
    for (let i = 0; i < 60; i++) pushHistory(rec(i % 2 ? 'win' : 'lose', 'normal', '毒'));
    const h = loadHistory();
    expect(h).toHaveLength(50);
    expect(h[0]!.result).toBe('win');
  });
  it('難易度別・相手別の勝率（引き分けは半分）と、よく出すカード', () => {
    const s = summarize([
      rec('win', 'hard', '毒', { herald: 3, guard: 1 }),
      rec('draw', 'hard', '毒', { herald: 2 }),
      rec('lose', 'easy', '巨人', { guard: 1 }),
    ]);
    expect(s.total.pct).toBe(50);
    expect(s.byLevel.find((r) => r.label === 'つよい')!.pct).toBe(75);
    expect(s.byRival[0]!.label).toBe('毒');
    expect(s.topCards[0]).toEqual({ card: 'herald', count: 5 });
  });
});
