import { FIELD_SLOTS } from './rules';

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
  /** 攻撃時：カードへのダメージ +N（反撃には乗らない） */
  unitBonus?: number;
  /** ステルス: 自分で攻撃するまで、相手に選ばれない・壁に数えない（全体に当たるものは当たる） */
  stealth?: true;
  /** 受けるダメージ -N */
  armor?: number;
  /** 場にいる間、コインのたまる速さ +割合（0.25 = 25%） */
  coinBoost?: number;
  /** 攻撃時: 狙った相手のほかの敵カード全員に N ダメージ */
  splash?: number;
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
  /** 二つ名（説明で名前の下に出す）。 */
  epithet?: string;
  /** 一言（セリフ・ひとこと）。 */
  flavor?: string;
  /** 召喚コスト（左上） */
  summon: number;
  /** 攻撃力（左下）。建築物・呪文は 0。 */
  atk: number;
  /** HP（右下）。呪文は 0。 */
  hp: number;
  /** クールタイム（ms、右上）。攻撃したあと・召喚したあと、これだけ待つ。ユニットだけ。 */
  cd: number;
  ab: Abilities;
  /** デッキに入らないカード（能力で出てくるもの） */
  token?: true;
}

/** 二つ名。説明のシートで名前の下に出す（ゲームの数値には関係しない）。 */
const EPITHET: Partial<Record<CardId, string>> = {
  herald: '韋駄天の斥候',
  miner: '野営の工兵',
  usurer: '道連れの狂戦士',
  spy: '影の刺客',
  craftsman: '破城の斧兵',
  guard: '盾の新兵',
  banker: '兵站の将',
  informer: '罠師',
  taxman: '狙撃手',
  double: '聖盾の騎士',
  inspector: '長弓の射手',
  blockader: '鉄壁の重装兵',
  architect: '癒やしの神官',
  boss: '戦斧の将軍',
  apprentice: '駆けつけた若者',
  wall: '石の防壁',
  exchange: '物資の集積地',
  tradingHouse: '翻る軍旗',
  factory: '兵を送り出す',
  cathedral: '進軍の鐘',
  fortress: '弩砲を備えた石の砦',
  quarry: '燃える岩が降る',
  quake: '地を砕く一撃',
  roadblock: '進軍を阻む柵',
  festival: '全軍の雄叫び',
};

/** 一言（説明のシートの下に出す。ゲームの数値には関係しない）。 */
const FLAVOR: Partial<Record<CardId, string>> = {
  herald: '戦場に一番乗りするのは、いつも俺だ。',
  miner: '穴を掘れば道ができる。道ができれば仲間が来る。',
  usurer: '倒れるときは、敵の大将も道連れだ！',
  spy: '気づいたときには、もう背後にいる。',
  craftsman: '城も盾も、斧で割れば同じことだ。',
  guard: 'ここは通さない。まだ新兵だけどな。',
  banker: '飢えた軍は戦えません。補給はお任せを。',
  informer: '縄一本あれば、足止めには十分さ。',
  taxman: '狙った的は外さない。息を止めて、撃つ。',
  double: '光の盾よ、仲間を一度だけ守れ！',
  inspector: '矢は風より遠く、反撃より速く。',
  blockader: '鉄の壁は、そう簡単には崩れない。',
  architect: '大丈夫、傷はわたしが癒やします。',
  boss: '全軍、俺に続け！ 立ちはだかる者は薙ぎ払う！',
  apprentice: '俺だって戦える！ 戦わせてくれ！',
  wall: '何百年も敵を阻んできた、石の壁。',
  exchange: '物資さえあれば、兵はいくらでも動く。',
  tradingHouse: '軍旗が翻る限り、兵の士気は落ちない。',
  factory: 'ここから新たな兵が駆け出していく。',
  cathedral: '鐘の音とともに、全軍が走り出す。',
  fortress: '弩砲が唸れば、弱った敵から倒れていく。',
  quarry: '燃える巨岩よ、敵の頭上に落ちろ！',
  quake: '大地ごと砕け。敵に逃げ場はない。',
  roadblock: 'この杭の森を、越えられるものか。',
  festival: '鬨の声を上げよ！ 全軍、疲れを忘れろ！',
};

/** cdSec はクールタイム（秒）。 */
const unit = (id: CardId, name: string, summon: number, atk: number, hp: number, cdSec: number, ab: Abilities = {}): CardDef => ({
  id,
  type: 'unit',
  name,
  epithet: EPITHET[id],
  flavor: FLAVOR[id],
  summon,
  atk,
  hp,
  cd: cdSec * 1000,
  ab,
});
const building = (id: CardId, name: string, summon: number, hp: number, ab: Abilities): CardDef => ({
  id,
  type: 'building',
  name,
  epithet: EPITHET[id],
  flavor: FLAVOR[id],
  summon,
  atk: 0,
  hp,
  cd: 0,
  ab,
});
const spell = (id: CardId, name: string, summon: number, effect: SpellEffect): CardDef => ({
  id,
  type: 'spell',
  name,
  epithet: EPITHET[id],
  flavor: FLAVOR[id],
  summon,
  atk: 0,
  hp: 0,
  cd: 0,
  ab: { spell: effect },
});

export const CARDS: Record<CardId, CardDef> = {
  herald: unit('herald', 'ポラン', 1, 2, 2, 10, { haste: true }),
  miner: unit('miner', 'ドルガ', 2, 1, 2, 12, { onSummon: { kind: 'token' } }),
  usurer: unit('usurer', 'バルク', 2, 4, 2, 11, { onDeath: { kind: 'face', amount: 2 } }),
  spy: unit('spy', 'カゲマル', 3, 3, 2, 11, { faceBonus: 1, stealth: true }),
  craftsman: unit('craftsman', 'ゴルド', 3, 4, 3, 14, { unitBonus: 2 }),
  guard: unit('guard', 'ロイ', 2, 1, 3, 16, { blocker: true }),
  banker: unit('banker', 'ミレーヌ', 3, 3, 3, 16, { coinBoost: 0.22 }),
  informer: unit('informer', 'シオ', 2, 2, 2, 12, { onSummon: { kind: 'stun', ms: 6000 } }),
  taxman: unit('taxman', 'リオ', 4, 4, 3, 14, { onSummon: { kind: 'strike', amount: 2 } }),
  double: unit('double', 'ジーク', 3, 4, 3, 14, { barrier: true }),
  inspector: unit('inspector', 'アリア', 4, 4, 3, 16, { ranged: true }),
  blockader: unit('blockader', 'ガストン', 4, 4, 4, 16, { blocker: true, armor: 1 }),
  architect: unit('architect', 'セラ', 5, 4, 4, 16, { onSummon: { kind: 'heal', amount: 3 } }),
  boss: unit('boss', 'ヴァルガ', 5, 3, 6, 20, { splash: 1 }),
  apprentice: { ...unit('apprentice', '志願兵', 1, 1, 1, 12), token: true },

  wall: building('wall', '城壁', 2, 8, { blocker: true }),
  exchange: building('exchange', '補給所', 3, 5, { coinBoost: 0.3 }),
  tradingHouse: building('tradingHouse', '戦旗塔', 3, 4, { rally: 1 }),
  factory: building('factory', '兵舎', 4, 5, { pulse: { everyMs: 6000, kind: 'token' } }),
  cathedral: building('cathedral', '鐘楼', 4, 6, { cooldownCut: 0.3 }),
  fortress: building('fortress', '砦', 5, 8, { pulse: { everyMs: 9000, kind: 'snipe', amount: 1 } }),

  quarry: spell('quarry', '投石', 4, { kind: 'bolt', amount: 5 }),
  quake: spell('quake', '大地割り', 4, { kind: 'blast', amount: 2 }),
  roadblock: spell('roadblock', 'バリケード', 3, { kind: 'freeze', ms: 8000 }),
  festival: spell('festival', '鬨の声', 2, { kind: 'ready' }),
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

/** 能力の説明（長押しの説明・ドラッグ中の案内）。ドラクエライバルズの書き方にそろえる:
 *  キーワード（ブロッカー・速攻・結界）はそのまま、時機のある能力は「召喚時：」「攻撃時：」「死亡時：」
 *  「N 秒ごと：」を頭に付け、いつでも効く能力は効果だけを書く。
 *  言葉: 敵カード＝相手のユニットと建築物、敵ユニット＝相手のユニットだけ、敵プレイヤー＝相手。 */
export function abilityLines(card: CardId): string[] {
  const a = CARDS[card].ab;
  const lines: string[] = [];
  if (a.blocker) lines.push('ブロッカー（相手はブロッカーしか攻撃できない）');
  if (a.haste) lines.push('速攻（召喚してすぐ攻撃できる）');
  if (a.barrier) lines.push('結界（最初に受けるダメージを 0 にする）');
  if (a.stealth) lines.push('ステルス（自分で攻撃するまで、相手に選ばれない）');
  const s = a.onSummon;
  if (s?.kind === 'token') lines.push('召喚時：空いている枠に志願兵（攻撃 1・HP 1）を出す');
  if (s?.kind === 'heal') lines.push(`召喚時：自分の HP を ${s.amount} 回復`);
  if (s?.kind === 'strike') lines.push(`召喚時：敵カード 1 枚に ${s.amount} ダメージ`);
  if (s?.kind === 'stun') lines.push(`召喚時：敵ユニット 1 体のクールタイム +${s.ms / 1000} 秒`);
  if (a.ranged) lines.push('攻撃時：反撃を受けない');
  if (a.splash) lines.push(`攻撃時：ほかの敵カード全員に ${a.splash} ダメージ`);
  if (a.onDeath?.kind === 'face') lines.push(`死亡時：敵プレイヤーに ${a.onDeath.amount} ダメージ`);
  const p = a.pulse;
  if (p?.kind === 'token') lines.push(`${p.everyMs / 1000} 秒ごと：空いている枠に志願兵を出す`);
  if (p?.kind === 'snipe') lines.push(`${p.everyMs / 1000} 秒ごと：HP がいちばん低い敵カードに ${p.amount} ダメージ`);
  if (a.faceBonus) lines.push(`敵プレイヤーへのダメージ +${a.faceBonus}`);
  if (a.unitBonus) lines.push(`攻撃時：敵カードへのダメージ +${a.unitBonus}`);
  if (a.armor) lines.push(`受けるダメージ -${a.armor}`);
  if (a.rally) lines.push(`ほかの味方ユニットの攻撃力 +${a.rally}`);
  if (a.coinBoost) lines.push(`コインのたまる速さ +${Math.round(a.coinBoost * 100)}%`);
  if (a.cooldownCut) lines.push(`味方ユニットのクールタイム -${Math.round(a.cooldownCut * 100)}%`);
  const sp = a.spell;
  if (sp?.kind === 'bolt') lines.push(`敵カード 1 枚に ${sp.amount} ダメージ`);
  if (sp?.kind === 'blast') lines.push(`敵カード全員に ${sp.amount} ダメージ`);
  if (sp?.kind === 'freeze') lines.push(`敵ユニット全員のクールタイム +${sp.ms / 1000} 秒`);
  if (sp?.kind === 'ready') lines.push('味方ユニット全員のクールタイムをなくす');
  return lines;
}

/** 使い方の補足（説明の下に小さく出す）。 */
export function usageNote(card: CardId): string | null {
  const def = CARDS[card];
  if (needsTarget(card)) return def.type === 'spell' ? '敵カードの上へドラッグして使う' : '敵カードの上へドラッグして召喚すると、そのカードに効く';
  if (def.type === 'spell') return '盤面へドラッグして使う';
  if (def.type === 'building') return '攻撃しない。場にあるだけで効く';
  return null;
}

/** 壁の説明（ヘルプと案内で使う）。 */
export const WALL_TEXT = `場が ${FIELD_SLOTS} 枚うまっている間、そのプレイヤーは攻撃されない（壁）`;
