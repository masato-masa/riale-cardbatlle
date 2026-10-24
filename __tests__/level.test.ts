import { beforeEach, describe, expect, it } from 'vitest';

import { CARDS, STARTER_DECK } from '../src/game/cards';
import { attackOf, createGame, levelBonus, maxHpOf, step, units } from '../src/game/engine';
import { addCopy, awardMatch, copiesToNext, loadLevels, type CardProgress } from '../src/storage/collection';

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

describe('カードのレベル', () => {
  it('Lv2 で HP+1、Lv3 で攻撃+1、Lv4 で HP+2、Lv5 で攻撃+2', () => {
    expect(levelBonus(1)).toEqual({ atk: 0, hp: 0 });
    expect(levelBonus(2)).toEqual({ atk: 0, hp: 1 });
    expect(levelBonus(3)).toEqual({ atk: 1, hp: 1 });
    expect(levelBonus(4)).toEqual({ atk: 1, hp: 2 });
    expect(levelBonus(5)).toEqual({ atk: 2, hp: 2 });
    expect(levelBonus(9)).toEqual({ atk: 2, hp: 2 });
  });

  it('場に出たとき、そのプレイヤーのレベルぶん攻撃力・HP が上がる（相手のレベルは関係ない）', () => {
    const card = STARTER_DECK.find((c) => CARDS[c].type === 'unit' && CARDS[c].summon <= 3)!;
    let s = createGame([STARTER_DECK, STARTER_DECK], 3, [{ [card]: 5 }, {}]);
    const hand = [card, card, card, card];
    s = { ...s, players: [{ ...s.players[0], hand, coins: 10 }, { ...s.players[1], hand, coins: 10 }] };
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    s = step(s, { type: 'summon', p: 1, handIndex: 0, slot: 0 });
    s = step(s, { type: 'tick', dt: 2000 });
    const mine = units(s.players[0])[0]!;
    const theirs = units(s.players[1])[0]!;
    expect(mine.hp).toBe(CARDS[card].hp + 2);
    expect(maxHpOf(mine)).toBe(CARDS[card].hp + 2);
    expect(attackOf(s.players[0], mine)).toBe(CARDS[card].atk + 2);
    expect(theirs.hp).toBe(CARDS[card].hp);
    expect(attackOf(s.players[1], theirs)).toBe(CARDS[card].atk);
  });

  it('重ねるとレベルが上がる（Lv N → N+1 に N 枚）。最大 Lv5', () => {
    const prog: Partial<Record<'herald', CardProgress>> = {};
    const ups: number[] = [];
    for (let i = 0; i < 20; i++) {
      const r = addCopy(prog as never, 'herald');
      if (r.leveledUp) ups.push(i + 1);
    }
    // 1 枚目で Lv2、+2 枚で Lv3、+3 枚で Lv4、+4 枚で Lv5
    expect(ups).toEqual([1, 3, 6, 10]);
    expect(prog.herald!.level).toBe(5);
    expect(copiesToNext(1)).toBe(1);
  });

  it('宝箱で重ねが出ると、保存したレベルが対戦に渡る', () => {
    // 乱数 0.1: 重ね（COPY_CHANCE 未満）、持っているカードから選ぶ
    for (let i = 0; i < 6; i++) awardMatch(0, () => 0.1);
    const lv = loadLevels();
    expect(Object.values(lv).some((v) => (v ?? 1) >= 2)).toBe(true);
  });
});
