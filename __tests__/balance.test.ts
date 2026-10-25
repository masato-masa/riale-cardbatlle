import { afterEach, describe, expect, it } from 'vitest';

import { applyRuleBalance, MODE_BALANCE } from '../src/game/balance';
import { aimOf, CARDS } from '../src/game/cards';

afterEach(() => applyRuleBalance(1));

describe('案ごとのカードの数値', () => {
  it('案を選ぶとその案の数値が重なり、案 1 に戻すと元の数値に戻る', () => {
    const base = { ...CARDS.double };
    applyRuleBalance(2);
    expect(CARDS.double.summon).toBe(MODE_BALANCE[2].cards!.double!.summon);
    applyRuleBalance(3);
    expect(CARDS.double.summon).toBe(base.summon); // 案 3 は上書きしていない
    applyRuleBalance(1);
    expect(CARDS.double).toEqual(base);
  });

  it('狙い方の上書きは、その案のときだけ効く', () => {
    expect(aimOf('sniper')).toBe('weak');
    applyRuleBalance(2);
    expect(aimOf('sniper')).toBe('player');
    applyRuleBalance(3);
    expect(aimOf('sniper')).toBe('weak');
  });
});
