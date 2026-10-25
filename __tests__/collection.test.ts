import { beforeEach, describe, expect, it } from 'vitest';

import { awardMatch, CHEST_COST, CHEST_GAIN, loadNew, loadPoints, loadUnlocked, markSeen, openChest, pickReward, START_CARDS } from '../src/storage/collection';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
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
  it('勝つと 20pt、負けると 10pt たまる。宝箱は自動では開かない', () => {
    expect(awardMatch(0).gained).toBe(CHEST_GAIN.win);
    expect(awardMatch(1).gained).toBe(CHEST_GAIN.lose);
    expect(loadPoints()).toBe(CHEST_GAIN.win + CHEST_GAIN.lose);
    expect(loadUnlocked().size).toBe(new Set(START_CARDS).size);
  });
  it('20pt 払って宝箱を開けると、持っていないカードが 1 枚増えて NEW が付く。足りなければ開かない', () => {
    expect(openChest(() => 0.1)).toBeNull();
    awardMatch(0);
    const r = openChest(() => 0.1)!;
    expect(r.points).toBe(CHEST_GAIN.win - CHEST_COST);
    expect(loadUnlocked().has(r.card)).toBe(true);
    expect(loadNew().has(r.card)).toBe(true);
    markSeen(r.card);
    expect(loadNew().has(r.card)).toBe(false);
    expect(openChest(() => 0.1)).toBeNull();
  });
  it('以前の宝箱ゲージ（1 点）は 10pt に移る', () => {
    localStorage.setItem('riale-cardbatlle:points', '1');
    expect(loadPoints()).toBe(10);
  });
  it('全部持っていれば何も出ない', () => {
    (globalThis as unknown as { location: { search: string } }).location = { search: '?unlockall' };
    expect(pickReward(loadUnlocked(), () => 0.5)).toBeNull();
  });
});

import { addResult, loadRecord } from '../src/storage/profile';

describe('戦績の連勝', () => {
  it('勝ちで連勝が伸び、負けで 0 に戻り、最高は残る', () => {
    addResult(0);
    addResult(0);
    addResult(0);
    expect(loadRecord().streak).toBe(3);
    addResult(1);
    const r = loadRecord();
    expect(r.streak).toBe(0);
    expect(r.best).toBe(3);
  });
});

import { markTip, seenTips } from '../src/storage/profile';

describe('場面ごとの一言案内', () => {
  it('見た案内を覚える', () => {
    expect(seenTips().size).toBe(0);
    markTip('interrupt');
    markTip('reserve');
    expect([...seenTips()].sort()).toEqual(['interrupt', 'reserve']);
  });
});
