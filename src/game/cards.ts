// カードの定義。値はカードごとに固定。

export type CardId =
  | 'herald'
  | 'miner'
  | 'spy'
  | 'guard'
  | 'craftsman'
  | 'taxman'
  | 'blockader'
  | 'inspector'
  | 'architect'
  | 'boss';

export type Keyword = 'blocker';

export interface CardDef {
  id: CardId;
  name: string;
  /** 召喚コスト（左上） */
  summon: number;
  /** アタックコスト（右上） */
  attackCost: number;
  /** 攻撃力（左下） */
  atk: number;
  /** HP（右下） */
  hp: number;
  keywords: Keyword[];
}

const def = (
  id: CardId,
  name: string,
  summon: number,
  attackCost: number,
  atk: number,
  hp: number,
  keywords: Keyword[] = [],
): CardDef => ({ id, name, summon, attackCost, atk, hp, keywords });

export const CARDS: Record<CardId, CardDef> = {
  herald: def('herald', '伝令', 1, 1, 1, 2),
  miner: def('miner', '採掘師', 2, 2, 2, 3),
  spy: def('spy', '買収者', 3, 1, 2, 2),
  guard: def('guard', '衛兵', 3, 2, 1, 6, ['blocker']),
  craftsman: def('craftsman', '職人', 3, 2, 3, 3),
  taxman: def('taxman', '徴税官', 4, 2, 3, 4),
  blockader: def('blockader', '封鎖者', 4, 3, 2, 7, ['blocker']),
  inspector: def('inspector', '検査官', 4, 3, 4, 4),
  architect: def('architect', '建築家', 5, 4, 6, 5),
  boss: def('boss', '顔役', 6, 3, 5, 8),
};

/** 最初のデッキ（10 枚固定）。 */
export const STARTER_DECK: CardId[] = [
  'herald',
  'miner',
  'spy',
  'guard',
  'craftsman',
  'taxman',
  'blockader',
  'inspector',
  'architect',
  'boss',
];

export function isBlocker(card: CardId): boolean {
  return CARDS[card].keywords.includes('blocker');
}

export const KEYWORD_TEXT: Record<Keyword, string> = {
  blocker: 'ブロッカー: 相手はこのカードがいる間、ブロッカーしか攻撃できない',
};
