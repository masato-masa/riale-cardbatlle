// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CardFace } from '../src/ui/CardFace';

describe('カードの面: 場のカードはコストを出さない', () => {
  it('場のカード（mine を渡す。登場待ちも同じ）は召喚コスト・クールタイムなし、攻撃・HP あり', () => {
    for (const mine of [true, false]) {
      const html = renderToStaticMarkup(createElement(CardFace, { card: 'craftsman', mine }));
      expect(html).not.toContain('pip-summon');
      expect(html).toContain('pip-atk');
      expect(html).toContain('pip-hp');
      expect(html).not.toContain('pip-cd');
    }
  });

  it('手札・一覧（mine なし）は召喚コストを出す。クールタイムはどこにも出さない', () => {
    expect(renderToStaticMarkup(createElement(CardFace, { card: 'craftsman' }))).toContain('pip-summon');
    expect(renderToStaticMarkup(createElement(CardFace, { card: 'craftsman' }))).not.toContain('pip-cd');
  });
});
