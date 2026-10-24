import { CARDS, STARTER_DECK } from '../src/game/cards';
import { averageCost, COLLECTION, isValidDeck, loadDeck, saveDeck } from '../src/storage/deck';

describe('deck storage', () => {
  beforeEach(() => localStorage.clear());

  it('falls back to the starter deck', () => {
    expect(loadDeck()).toEqual(STARTER_DECK);
    localStorage.setItem('riale-cardbatlle:deck', '{broken');
    expect(loadDeck()).toEqual(STARTER_DECK);
  });

  it('round-trips a valid deck and rejects invalid ones', () => {
    const deck = COLLECTION.slice(0, 8);
    saveDeck(deck);
    expect(loadDeck()).toEqual(deck);
    expect(isValidDeck([...deck.slice(0, 7), deck[0]])).toBe(false);
    expect(isValidDeck([...deck.slice(0, 7), 'apprentice'])).toBe(false);
    expect(isValidDeck(deck.slice(0, 7))).toBe(false);
  });

  it('excludes tokens from the collection', () => {
    expect(COLLECTION.some((id) => CARDS[id].token)).toBe(false);
    expect(averageCost(STARTER_DECK)).toBeGreaterThan(0);
  });
});

import { applyPreset, DECK_SLOTS, loadBook, saveBook } from '../src/storage/deck';

describe('デッキ 5 つの保存とコンセプトデッキ', () => {
  beforeEach(() => localStorage.clear());

  it('最初は 5 つとも最初のデッキ、使っているのは 1 番', () => {
    const b = loadBook();
    expect(b.decks.length).toBe(DECK_SLOTS);
    expect(b.active).toBe(0);
    expect(b.decks[3]).toEqual(STARTER_DECK);
  });

  it('以前の 1 つだけの保存は 1 番に引き継ぐ。saveDeck は使っている番号に書く', () => {
    const old = COLLECTION.slice(0, 8);
    localStorage.setItem('riale-cardbatlle:deck', JSON.stringify(old));
    const b = loadBook();
    expect(b.decks[0]).toEqual(old);
    b.active = 2;
    saveBook(b);
    const next = COLLECTION.slice(10, 18);
    saveDeck(next);
    expect(loadBook().decks[2]).toEqual(next);
    expect(loadBook().decks[0]).toEqual(old);
    expect(loadDeck()).toEqual(next);
  });

  it('コンセプトデッキは、持っているカードだけで作り、足りない分はいまのデッキで補う', () => {
    const preset = COLLECTION.slice(20, 28);
    const owned = new Set([...preset.slice(0, 5), ...STARTER_DECK]);
    const r = applyPreset(preset, STARTER_DECK, owned);
    expect(r.missing).toBe(3);
    expect(r.deck.length).toBe(8);
    expect(new Set(r.deck).size).toBe(8);
    expect(r.deck.slice(0, 5)).toEqual(preset.slice(0, 5));
  });
});

import { deckCode, parseDeckCode } from '../src/storage/deck';

describe('デッキコード', () => {
  it('書いて読むと同じデッキに戻る。知らないカード・重複・別の文字列は除く', () => {
    const d = ['herald', 'guard', 'double', 'taxman', 'knight', 'quarry', 'veteran', 'executioner'] as const;
    expect(parseDeckCode(deckCode([...d]))).toEqual([...d]);
    expect(parseDeckCode('RCB:herald,herald,nosuchcard,guard')).toEqual(['herald', 'guard']);
    expect(parseDeckCode('hello')).toBeNull();
    expect(parseDeckCode('RCB:nosuch')).toBeNull();
  });
});
