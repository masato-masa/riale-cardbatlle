// カードの定義。値と能力はカードごとに固定。
// 種類は 3 つ: ユニット（攻撃する）・建築物（場にあるだけで効く。HP だけ）・呪文（場に出ず、すぐ効く）。

export type CardId =
  // ユニット
  | 'herald'
  | 'miner'
  | 'usurer'
  | 'spy'
  | 'craftsman'
  | 'guard'
  | 'banker'
  | 'informer'
  | 'taxman'
  | 'double'
  | 'inspector'
  | 'blockader'
  | 'architect'
  | 'boss'
  | 'apprentice'
  // 建築物
  | 'wall'
  | 'exchange'
  | 'tradingHouse'
  | 'factory'
  | 'cathedral'
  | 'fortress'
  // 呪文
  | 'quarry'
  | 'quake'
  | 'roadblock'
  | 'festival';

export type CardType = 'unit' | 'building' | 'spell';

/** 召喚したときに起きること。strike と stun は相手のカードを 1 枚選ぶ。 */
export type OnSummon =
  | { kind: 'token' }
  | { kind: 'heal'; amount: number }
  | { kind: 'strike'; amount: number }
  | { kind: 'stun'; ms: number };

/** 倒れたときに起きること。 */
export type OnDeath = { kind: 'face'; amount: number };

/** 建築物が一定時間ごとに起こすこと。 */
export type Pulse =
  | { everyMs: number; kind: 'token' }
  /** 相手のいちばん HP の低いカード（同じなら左）にダメージ */
  | { everyMs: number; kind: 'snipe'; amount: number };

/** 呪文の効果。bolt は相手のカードを 1 枚選ぶ。 */
export type SpellEffect =
  | { kind: 'bolt'; amount: number }
  | { kind: 'blast'; amount: number }
  | { kind: 'freeze'; ms: number }
  | { kind: 'ready' };

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
  /** 場にいる間、味方ユニットのクールタイム -割合 */
  cooldownCut?: number;
  onSummon?: OnSummon;
  onDeath?: OnDeath;
  pulse?: Pulse;
  spell?: SpellEffect;
}

export interface CardDef {
  id: CardId;
  type: CardType;
  name: string;
  /** 召喚コスト（左上） */
  summon: number;
  /** 攻撃力（左下）。建築物・呪文は 0。 */
  atk: number;
  /** HP（右下）。呪文は 0。 */
  hp: number;
  ab: Abilities;
  /** カードの上端に出す、能力の短い名前（2 文字）。ブロッカーだけのカードは盾の印なので空。 */
  chip: string;
  /** デッキに入らないカード（能力で出てくるもの） */
  token?: true;
}

const unit = (id: CardId, name: string, summon: number, atk: number, hp: number, chip: string, ab: Abilities = {}): CardDef => ({
  id,
  type: 'unit',
  name,
  summon,
  atk,
  hp,
  chip,
  ab,
});
const building = (id: CardId, name: string, summon: number, hp: number, chip: string, ab: Abilities): CardDef => ({
  id,
  type: 'building',
  name,
  summon,
  atk: 0,
  hp,
  chip,
  ab,
});
const spell = (id: CardId, name: string, summon: number, chip: string, effect: SpellEffect): CardDef => ({
  id,
  type: 'spell',
  name,
  summon,
  atk: 0,
  hp: 0,
  chip,
  ab: { spell: effect },
});

export const CARDS: Record<CardId, CardDef> = {
  herald: unit('herald', '伝令', 1, 1, 2, '速攻', { haste: true }),
  miner: unit('miner', '採掘師', 2, 1, 2, '仲間', { onSummon: { kind: 'token' } }),
  usurer: unit('usurer', '高利貸', 2, 2, 2, '遺言', { onDeath: { kind: 'face', amount: 2 } }),
  spy: unit('spy', '買収者', 3, 2, 3, '奇襲', { faceBonus: 1 }),
  craftsman: unit('craftsman', '職人', 3, 2, 4, '討伐', { unitBonus: 2 }),
  guard: unit('guard', '衛兵', 2, 1, 5, '', { blocker: true }),
  banker: unit('banker', '銀行家', 3, 1, 4, '増収', { coinBoost: 0.15 }),
  informer: unit('informer', '密告者', 2, 2, 2, '足止', { onSummon: { kind: 'stun', ms: 3000 } }),
  taxman: unit('taxman', '徴税官', 4, 3, 3, '狙撃', { onSummon: { kind: 'strike', amount: 2 } }),
  double: unit('double', '影武者', 3, 3, 3, '結界', { barrier: true }),
  inspector: unit('inspector', '検査官', 4, 3, 4, '遠隔', { ranged: true }),
  blockader: unit('blockader', '封鎖者', 4, 2, 5, '鉄壁', { blocker: true, armor: 1 }),
  architect: unit('architect', '建築家', 5, 4, 5, '修復', { onSummon: { kind: 'heal', amount: 3 } }),
  boss: unit('boss', '顔役', 5, 4, 7, '薙払', { sweep: true }),
  apprentice: { ...unit('apprentice', '見習い', 1, 1, 1, ''), token: true },

  wall: building('wall', '城壁', 2, 8, '', { blocker: true }),
  exchange: building('exchange', '取引所', 3, 5, '増収', { coinBoost: 0.3 }),
  tradingHouse: building('tradingHouse', '商館', 3, 5, '鼓舞', { rally: 1 }),
  factory: building('factory', '工房', 4, 5, '生産', { pulse: { everyMs: 8000, kind: 'token' } }),
  cathedral: building('cathedral', '大聖堂', 4, 6, '祈り', { cooldownCut: 0.3 }),
  fortress: building('fortress', '砦', 5, 8, '砲撃', { pulse: { everyMs: 6000, kind: 'snipe', amount: 1 } }),

  quarry: spell('quarry', '落石', 4, '単体', { kind: 'bolt', amount: 5 }),
  quake: spell('quake', '地鳴り', 4, '全体', { kind: 'blast', amount: 2 }),
  roadblock: spell('roadblock', '通行止め', 3, '遅延', { kind: 'freeze', ms: 4000 }),
  festival: spell('festival', '祝祭', 2, '再動', { kind: 'ready' }),
};

/** 自分の最初のデッキ（10 枚固定）。 */
export const STARTER_DECK: CardId[] = [
  'herald',
  'guard',
  'spy',
  'craftsman',
  'double',
  'taxman',
  'boss',
  'cathedral',
  'factory',
  'quarry',
];

/** CPU のデッキ（10 枚固定）。 */
export const RIVAL_DECK: CardId[] = [
  'herald',
  'usurer',
  'banker',
  'inspector',
  'blockader',
  'architect',
  'tradingHouse',
  'fortress',
  'roadblock',
  'quake',
];

export function isBlocker(card: CardId): boolean {
  return !!CARDS[card].ab.blocker;
}

/** 使うときに相手のカードを 1 枚選ぶか（狙撃・足止・単体の呪文）。 */
export function needsTarget(card: CardId): boolean {
  const ab = CARDS[card].ab;
  return ab.onSummon?.kind === 'strike' || ab.onSummon?.kind === 'stun' || ab.spell?.kind === 'bolt';
}

/** 選ばないと効かない（単体の呪文）。狙撃・足止は選ばなくても召喚はできる。 */
export function requiresTarget(card: CardId): boolean {
  return CARDS[card].ab.spell?.kind === 'bolt';
}

export const TYPE_NAME: Record<CardType, string> = { unit: 'ユニット', building: '建築物', spell: '呪文' };

/** 能力の説明（長押しの説明・ドラッグ中の案内）。 */
export function abilityLines(card: CardId): string[] {
  const a = CARDS[card].ab;
  const lines: string[] = [];
  if (a.blocker) lines.push('ブロッカー: 相手はこのカードがいる間、ブロッカーしか攻撃できない');
  if (a.haste) lines.push('速攻: 召喚してすぐ攻撃できる');
  if (a.faceBonus) lines.push(`奇襲: プレイヤーへのダメージ +${a.faceBonus}`);
  if (a.unitBonus) lines.push(`討伐: カードへのダメージ +${a.unitBonus}（反撃も）`);
  if (a.armor) lines.push(`鉄壁: 受けるダメージ -${a.armor}`);
  if (a.coinBoost) lines.push(`増収: 場にある間、コインのたまる速さ +${Math.round(a.coinBoost * 100)}%`);
  if (a.sweep) lines.push('薙払: カードを攻撃すると、相手のカード全員にダメージ。反撃は選んだ相手からだけ受ける');
  if (a.ranged) lines.push('遠隔: 自分から攻撃したときは反撃を受けない');
  if (a.barrier) lines.push('結界: 最初に受けるダメージを 0 にする');
  if (a.rally) lines.push(`鼓舞: ほかの味方の攻撃力 +${a.rally}`);
  if (a.cooldownCut) lines.push(`祈り: 場にある間、味方ユニットのクールタイム -${Math.round(a.cooldownCut * 100)}%`);
  const s = a.onSummon;
  if (s?.kind === 'token') lines.push('仲間: 召喚したとき、空いている枠に見習い（攻撃 1・HP 1）を出す');
  if (s?.kind === 'heal') lines.push(`修復: 召喚したとき、自分の HP を ${s.amount} 回復`);
  if (s?.kind === 'strike') lines.push(`狙撃: 相手のカードの上で召喚すると、そのカードに ${s.amount} ダメージ`);
  if (s?.kind === 'stun') lines.push(`足止: 相手のカードの上で召喚すると、そのカードは ${s.ms / 1000} 秒攻撃できない`);
  if (a.onDeath?.kind === 'face') lines.push(`遺言: 倒れたとき、相手のプレイヤーに ${a.onDeath.amount} ダメージ`);
  const p = a.pulse;
  if (p?.kind === 'token') lines.push(`生産: ${p.everyMs / 1000} 秒ごとに、空いている枠に見習いを出す`);
  if (p?.kind === 'snipe') lines.push(`砲撃: ${p.everyMs / 1000} 秒ごとに、相手のいちばん HP の低いカードに ${p.amount} ダメージ`);
  const sp = a.spell;
  if (sp?.kind === 'bolt') lines.push(`単体: 相手のカードの上で使うと、そのカードに ${sp.amount} ダメージ`);
  if (sp?.kind === 'blast') lines.push(`全体: 相手のカード全員に ${sp.amount} ダメージ`);
  if (sp?.kind === 'freeze') lines.push(`遅延: 相手のユニット全員のクールタイム +${sp.ms / 1000} 秒`);
  if (sp?.kind === 'ready') lines.push('再動: 味方ユニット全員のクールタイムをなくす');
  if (CARDS[card].type === 'building') lines.push('建築物: 攻撃はしない。場にあるだけで効く');
  return lines;
}

/** 壁の説明（ヘルプと案内で使う）。 */
export const WALL_TEXT = '場が 5 枚うまっている間、そのプレイヤーは攻撃されない（壁）';
