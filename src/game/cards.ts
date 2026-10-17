// カードの定義。値と能力はカードごとに固定。

export type CardId =
  | 'herald'
  | 'miner'
  | 'usurer'
  | 'spy'
  | 'craftsman'
  | 'guard'
  | 'banker'
  | 'informer'
  | 'festival'
  | 'taxman'
  | 'double'
  | 'inspector'
  | 'blockader'
  | 'architect'
  | 'boss'
  | 'apprentice';

/** 召喚したときに起きること。strike と stun は相手のカードを 1 枚選ぶ。 */
export type OnSummon =
  | { kind: 'token' }
  | { kind: 'heal'; amount: number }
  | { kind: 'strike'; amount: number }
  | { kind: 'stun'; ms: number };

/** 倒れたときに起きること。 */
export type OnDeath = { kind: 'face'; amount: number };

export interface Abilities {
  /** ブロッカー: 相手はブロッカーしか攻撃できない */
  blocker?: true;
  /** 速攻: 召喚してすぐ攻撃できる */
  haste?: true;
  /** プレイヤーへのダメージ +N */
  faceBonus?: number;
  /** カードへのダメージ +N（反撃も含む） */
  unitBonus?: number;
  /** 受けるダメージ -N */
  armor?: number;
  /** 場にいる間、コインのたまる速さ +割合（0.25 = 25%） */
  coinBoost?: number;
  /** なぎ払い: カードを攻撃すると相手のカード全員にダメージ。反撃は選んだ相手からだけ */
  sweep?: true;
  /** 遠隔: 自分から攻撃したときは反撃を受けない */
  ranged?: true;
  /** バリア: 最初に受けるダメージを 0 にする */
  barrier?: true;
  /** 鼓舞: ほかの味方の攻撃力 +N */
  rally?: number;
  onSummon?: OnSummon;
  onDeath?: OnDeath;
}

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
  ab: Abilities;
  /** カードの上端に出す、能力の短い名前（2 文字）。ブロッカーだけのカードは盾の印なので空。 */
  chip: string;
  /** デッキに入らないカード（能力で出てくるもの） */
  token?: true;
}

const def = (
  id: CardId,
  name: string,
  summon: number,
  attackCost: number,
  atk: number,
  hp: number,
  chip: string,
  ab: Abilities = {},
  token?: true,
): CardDef => ({ id, name, summon, attackCost, atk, hp, chip, ab, ...(token ? { token } : {}) });

export const CARDS: Record<CardId, CardDef> = {
  herald: def('herald', '伝令', 1, 1, 1, 2, '速攻', { haste: true }),
  miner: def('miner', '採掘師', 2, 2, 1, 2, '仲間', { onSummon: { kind: 'token' } }),
  usurer: def('usurer', '高利貸', 2, 2, 2, 2, '遺言', { onDeath: { kind: 'face', amount: 2 } }),
  spy: def('spy', '買収者', 3, 1, 2, 2, '奇襲', { faceBonus: 1 }),
  craftsman: def('craftsman', '職人', 3, 2, 2, 4, '討伐', { unitBonus: 2 }),
  guard: def('guard', '衛兵', 2, 2, 1, 6, '', { blocker: true }),
  banker: def('banker', '銀行家', 3, 3, 1, 4, '増収', { coinBoost: 0.18 }),
  informer: def('informer', '密告者', 2, 2, 2, 3, '足止', { onSummon: { kind: 'stun', ms: 3000 } }),
  festival: def('festival', '楽団', 3, 2, 2, 4, '鼓舞', { rally: 1 }),
  taxman: def('taxman', '徴税官', 4, 2, 3, 3, '狙撃', { onSummon: { kind: 'strike', amount: 2 } }),
  double: def('double', '影武者', 3, 2, 3, 3, '結界', { barrier: true }),
  inspector: def('inspector', '検査官', 4, 3, 3, 4, '遠隔', { ranged: true }),
  blockader: def('blockader', '封鎖者', 4, 3, 2, 5, '鉄壁', { blocker: true, armor: 1 }),
  architect: def('architect', '建築家', 5, 3, 4, 5, '修復', { onSummon: { kind: 'heal', amount: 3 } }),
  boss: def('boss', '顔役', 5, 3, 4, 7, '薙払', { sweep: true }),
  apprentice: def('apprentice', '見習い', 1, 1, 1, 1, '', {}, true),
};

/** 自分の最初のデッキ（10 枚固定）。 */
export const STARTER_DECK: CardId[] = [
  'herald',
  'miner',
  'spy',
  'guard',
  'craftsman',
  'informer',
  'taxman',
  'double',
  'inspector',
  'boss',
];

/** CPU のデッキ（10 枚固定）。 */
export const RIVAL_DECK: CardId[] = [
  'herald',
  'usurer',
  'spy',
  'banker',
  'craftsman',
  'festival',
  'taxman',
  'blockader',
  'inspector',
  'architect',
];

export function isBlocker(card: CardId): boolean {
  return !!CARDS[card].ab.blocker;
}

/** 召喚するときに相手のカードを 1 枚選ぶか。 */
export function needsTarget(card: CardId): boolean {
  const k = CARDS[card].ab.onSummon?.kind;
  return k === 'strike' || k === 'stun';
}

/** 能力の説明（長押しの説明・ドラッグ中の案内）。 */
export function abilityLines(card: CardId): string[] {
  const a = CARDS[card].ab;
  const lines: string[] = [];
  if (a.blocker) lines.push('ブロッカー: 相手はこのカードがいる間、ブロッカーしか攻撃できない');
  if (a.haste) lines.push('速攻: 召喚してすぐ攻撃できる');
  if (a.faceBonus) lines.push(`奇襲: プレイヤーへのダメージ +${a.faceBonus}`);
  if (a.unitBonus) lines.push(`討伐: カードへのダメージ +${a.unitBonus}（反撃も）`);
  if (a.armor) lines.push(`鉄壁: 受けるダメージ -${a.armor}`);
  if (a.coinBoost) lines.push(`増収: 場にいる間、コインのたまる速さ +${Math.round(a.coinBoost * 100)}%`);
  if (a.sweep) lines.push('薙払: カードを攻撃すると、相手のカード全員にダメージ。反撃は選んだ相手からだけ受ける');
  if (a.ranged) lines.push('遠隔: 自分から攻撃したときは反撃を受けない');
  if (a.barrier) lines.push('結界: 最初に受けるダメージを 0 にする');
  if (a.rally) lines.push(`鼓舞: ほかの味方の攻撃力 +${a.rally}`);
  const s = a.onSummon;
  if (s?.kind === 'token') lines.push('仲間: 召喚したとき、空いている枠に見習い（すべて 1）を出す');
  if (s?.kind === 'heal') lines.push(`修復: 召喚したとき、自分の HP を ${s.amount} 回復`);
  if (s?.kind === 'strike') lines.push(`狙撃: 相手のカードの上で召喚すると、そのカードに ${s.amount} ダメージ`);
  if (s?.kind === 'stun') lines.push(`足止: 相手のカードの上で召喚すると、そのカードは ${s.ms / 1000} 秒攻撃できない`);
  if (a.onDeath?.kind === 'face') lines.push(`遺言: 倒れたとき、相手のプレイヤーに ${a.onDeath.amount} ダメージ`);
  return lines;
}

/** 壁の説明（ヘルプと案内で使う）。 */
export const WALL_TEXT = '場が 5 枚うまっている間、そのプレイヤーは攻撃されない（壁）';
