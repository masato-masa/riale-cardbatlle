import { describe, expect, it } from 'vitest';

import { CARDS, RIVAL_DECKS } from '../src/game/cards';

describe('CPU のデッキ', () => {
  it('どれも 10 枚で重複なし、実在するカード', () => {
    for (const { name, deck } of RIVAL_DECKS) {
      expect(deck.length, name).toBe(8);
      expect(new Set(deck).size, name).toBe(8);
      for (const id of deck) expect(CARDS[id], `${name}:${id}`).toBeTruthy();
    }
  });
});
