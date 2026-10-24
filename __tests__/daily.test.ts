import { beforeEach, describe, expect, it } from 'vitest';

import { loadDaily, missionsFor, MISSIONS, recordDaily } from '../src/storage/daily';

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

const stats = { won: true, summons: 6, interrupts: 1, spells: 1, faceDamage: 12 };

describe('デイリーミッション', () => {
  it('日付ごとに 3 つ、同じ日は同じ。勝つ系は 1 つまで', () => {
    for (const day of ['2026-10-24', '2026-10-25', '2026-11-01', '2027-01-09']) {
      const m = missionsFor(day);
      expect(m).toHaveLength(3);
      expect(new Set(m).size).toBe(3);
      expect(m.filter((x) => x === 'win1' || x === 'win3').length).toBeLessThanOrEqual(1);
      expect(missionsFor(day)).toEqual(m);
    }
  });

  it('試合ごとに進み、目標に届いた試合で 1 回だけ達成になる。日付が変わると新しくなる', () => {
    const day = '2026-10-24';
    const ids = loadDaily(day).missions;
    const doneAll = new Set<string>();
    for (let i = 0; i < 6; i++) for (const id of recordDaily(stats, day)) {
      expect(doneAll.has(id)).toBe(false);
      doneAll.add(id);
    }
    for (const id of ids) expect(loadDaily(day).progress[id]).toBeLessThanOrEqual(MISSIONS[id].goal);
    expect(loadDaily('2026-10-25').progress).toEqual({});
  });

  it('予約・チェンジ・建築のミッションは、その回数で進む', () => {
    // 3 つが選ばれる日を探して、1 試合ぶんの記録で進むことを見る
    const ids = ['reserve3', 'overwrite2', 'build2'] as const;
    for (const id of ids) {
      let day = '';
      for (let d = 1; d <= 365 && !day; d++) {
        const key = `2026-${String(Math.ceil(d / 28)).padStart(2, '0')}-${String(((d - 1) % 28) + 1).padStart(2, '0')}`;
        if (missionsFor(key).includes(id)) day = key;
      }
      expect(day).not.toBe('');
      recordDaily({ ...stats, reserves: 2, overwrites: 1, buildings: 1 }, day);
      expect(loadDaily(day).progress[id]).toBe({ reserve3: 2, overwrite2: 1, build2: 1 }[id]);
    }
  });
});
