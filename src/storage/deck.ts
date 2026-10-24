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

/** 保存できるデッキの数。 */
export const DECK_SLOTS = 5;
const SLOTS_KEY = 'riale-cardbatlle:decks';

export interface DeckBook {
  /** 5 つのデッキ。 */
  decks: CardId[][];
  /** 対戦で使うデッキの番号（0〜4）。 */
  active: number;
}

function cutOld(deck: unknown): CardId[] | null {
  if (isValidDeck(deck)) return deck;
  // 10 枚だった頃の保存は、先頭の 8 枚を引き継ぐ
  if (Array.isArray(deck) && deck.length > DECK_SIZE) {
    const cut = deck.slice(0, DECK_SIZE);
    if (isValidDeck(cut)) return cut;
  }
  return null;
}

/** 5 つのデッキと、使っている番号。無ければ、これまでの 1 つのデッキを 1 番に、残りは最初のデッキで埋める。 */
export function loadBook(): DeckBook {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (raw) {
      const b = JSON.parse(raw) as Partial<DeckBook>;
      if (Array.isArray(b.decks)) {
        const decks = Array.from({ length: DECK_SLOTS }, (_, i) => cutOld(b.decks![i]) ?? [...STARTER_DECK]);
        const active = typeof b.active === 'number' && b.active >= 0 && b.active < DECK_SLOTS ? Math.floor(b.active) : 0;
        return { decks, active };
      }
    }
    // 以前の保存（1 つだけ）を 1 番に
    const old = cutOld(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
    if (old) return { decks: [old, ...Array.from({ length: DECK_SLOTS - 1 }, () => [...STARTER_DECK])], active: 0 };
  } catch {
    // 読めなければ最初のデッキ
  }
  return { decks: Array.from({ length: DECK_SLOTS }, () => [...STARTER_DECK]), active: 0 };
}

export function saveBook(book: DeckBook): void {
  if (!book.decks.every(isValidDeck)) return;
  try {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(book));
  } catch {
    // 保存できなくても、この場では使える
  }
}

/** いま使っているデッキ。 */
export function loadDeck(): CardId[] {
  const b = loadBook();
  return b.decks[b.active]!;
}

/** いま使っているデッキを書き換えて保存する。 */
export function saveDeck(deck: CardId[]): void {
  if (!isValidDeck(deck)) return;
  const b = loadBook();
  b.decks[b.active] = deck;
  saveBook(b);
}

/** コンセプトデッキを、持っているカードだけで作る。持っていないカードは、いまのデッキのカード（重ならないもの）で補う。 */
export function applyPreset(preset: CardId[], current: CardId[], owned: Set<CardId>): { deck: CardId[]; missing: number } {
  const deck = preset.filter((id) => owned.has(id));
  const missing = preset.length - deck.length;
  for (const id of [...current, ...COLLECTION.filter((c) => owned.has(c))]) {
    if (deck.length >= DECK_SIZE) break;
    if (!deck.includes(id)) deck.push(id);
  }
  return { deck, missing };
}

/** デッキコード（友だちと見せ合う・別の端末へ写すための文字列）。例: RCB:herald,guard,... */
export function deckCode(deck: CardId[]): string {
  return `RCB:${deck.join(',')}`;
}

/** デッキコードを読む。知らないカード・重複は除き、1 枚以上あればその並び（足りない分は applyPreset で補う）。 */
export function parseDeckCode(code: string): CardId[] | null {
  const m = code.trim().match(/^RCB:([a-z0-9,]+)$/i);
  if (!m) return null;
  const ids = m[1]!.split(',').filter((id, i, arr) => id in CARDS && !CARDS[id as CardId].token && arr.indexOf(id) === i) as CardId[];
  return ids.length > 0 ? ids.slice(0, DECK_SIZE) : null;
}

/** 平均コスト（クラロワと同じく小数 1 桁）。 */
export function averageCost(deck: CardId[]): number {
  return Math.round((deck.reduce((n, id) => n + CARDS[id].summon, 0) / deck.length) * 10) / 10;
}
