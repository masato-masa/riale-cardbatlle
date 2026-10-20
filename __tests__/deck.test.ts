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
