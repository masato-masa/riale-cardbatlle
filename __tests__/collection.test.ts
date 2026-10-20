import { beforeEach, describe, expect, it } from 'vitest';

import { awardMatch, loadPoints, loadUnlocked, pickReward, START_CARDS } from '../src/storage/collection';

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
  (globalThis as unknown as { location: { search: string } }).location = { search: '' };
});

describe('カードの解放', () => {
  it('最初は最初のカードだけ', () => {
    expect(loadUnlocked().size).toBe(new Set(START_CARDS).size);
  });
  it('勝つと 2 点で宝箱が開き、新しいカードが 1 枚増える', () => {
    const r = awardMatch(0, () => 0.1);
    expect(r.cards.length).toBe(1);
    expect(loadUnlocked().has(r.cards[0]!)).toBe(true);
    expect(loadPoints()).toBe(0);
  });
  it('負けは 1 点、2 回で宝箱', () => {
    expect(awardMatch(1, () => 0.5).cards.length).toBe(0);
    expect(loadPoints()).toBe(1);
    expect(awardMatch(1, () => 0.5).cards.length).toBe(1);
  });
  it('全部持っていれば何も出ない', () => {
    (globalThis as unknown as { location: { search: string } }).location = { search: '?unlockall' };
    expect(pickReward(loadUnlocked(), () => 0.5)).toBeNull();
  });
});
