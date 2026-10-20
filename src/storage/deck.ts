// 自分のデッキの保存。localStorage に 8 枚の id を入れる。
// 読めない・壊れている・知らない id が混ざっているときは最初のデッキに戻す。

import { CARDS, STARTER_DECK, type CardId } from '@/game/cards';

const KEY = 'riale-cardbatlle:deck';
export const DECK_SIZE = 8;

/** デッキに入れられるカード（能力で出てくる見習いは除く）。 */
export const COLLECTION: CardId[] = (Object.keys(CARDS) as CardId[]).filter((id) => !CARDS[id].token);

export function isValidDeck(deck: unknown): deck is CardId[] {
  return (
    Array.isArray(deck) &&
    deck.length === DECK_SIZE &&
    new Set(deck).size === DECK_SIZE &&
    deck.every((id) => typeof id === 'string' && COLLECTION.includes(id as CardId))
  );
}

export function loadDeck(): CardId[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const deck: unknown = JSON.parse(raw);
      if (isValidDeck(deck)) return deck;
      // 10 枚だった頃の保存は、先頭の 8 枚を引き継ぐ
      if (Array.isArray(deck) && deck.length > DECK_SIZE) {
        const cut = deck.slice(0, DECK_SIZE);
        if (isValidDeck(cut)) return cut;
      }
    }
  } catch {
    // 読めなければ最初のデッキ
  }
  return [...STARTER_DECK];
}

export function saveDeck(deck: CardId[]): void {
  if (!isValidDeck(deck)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(deck));
  } catch {
    // 保存できなくても、この場では使える
  }
}

/** 平均コスト（クラロワと同じく小数 1 桁）。 */
export function averageCost(deck: CardId[]): number {
  return Math.round((deck.reduce((n, id) => n + CARDS[id].summon, 0) / deck.length) * 10) / 10;
}
