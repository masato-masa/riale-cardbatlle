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
  | 'veteran'
  | 'executioner'
  | 'strategist'
  | 'colossus'
  | 'archmage'
  | 'apprentice'
  // 追加のユニット（基礎スタッツ 9 枚と、能力つき 24 枚）
  | 'recruit'
  | 'footman'
  | 'lancer'
  | 'knight'
  | 'captain'
  | 'warlord'
  | 'champion'
  | 'ogre'
  | 'dragoon'
  | 'needle'
  | 'medic'
  | 'bulwark'
  | 'creeper'
  | 'marksman'
  | 'twin'
  | 'bloody'
  | 'bard'
  | 'sealer'
  | 'binder'
  | 'poisoner'
  | 'stalwart'
  | 'drummer'
  | 'duelist'
  | 'sniper'
  | 'priest'
  | 'bloodknight'
  | 'hexer'
  | 'raider'
  | 'martyr'
  | 'warden'
  | 'ironwall'
  | 'banner'
  | 'reaper'
  // 建築物
  | 'wall'
  | 'exchange'
  | 'tradingHouse'
  | 'factory'
  | 'cathedral'
  | 'fortress'
  | 'infirmary'
  | 'altar'
  | 'forge'
  // 呪文
  | 'quarry'
  | 'quake'
  | 'roadblock'
  | 'rain'
  | 'warcry'
  | 'miasma'
  | 'edict'
  | 'festival'
  // 割り込み・上書きの能力
  | 'warder'
  | 'shieldmaid'
  | 'ambusher'
  | 'gatekeeper'
  | 'diehard'
  | 'berserk'
  | 'offering'
  | 'bomber'
  | 'heir'
  | 'phoenix'
  | 'usurper'
  | 'conqueror'
  | 'parry';

export type CardType = 'unit' | 'building' | 'spell';

/** 召喚したときに起きること。strike と stun は相手のカードを 1 枚選ぶ。 */
export type OnSummon =
  | { kind: 'token' }
  | { kind: 'heal'; amount: number }
  | { kind: 'strike'; amount: number }
  | { kind: 'stun'; ms: number }
  /** 敵ユニット 1 体を破壊する（結界・軽減を無視）。 */
  | { kind: 'destroy' }
  /** 自分の場の、ほかのユニットのクールタイムを減らす。 */
  | { kind: 'cdCut'; ms: number }
  /** 場の、ほかのユニットをすべて破壊する（敵味方。建築物は除く）。 */
  | { kind: 'wipe' }
  /** 味方ユニット 1 体を選んで HP を回復する。 */
  | { kind: 'healAlly'; amount: number }
  /** 味方ユニット 1 体を選んで、攻撃力と HP を上げる。 */
  | { kind: 'buffAlly'; atk: number; hp: number }
  /** 自分のほかのユニット全員の攻撃力と HP を上げる。 */
  | { kind: 'buffAllies'; atk: number; hp: number }
  /** 敵ユニット 1 体に毒を与える（毒: 攻撃するたびに N ダメージを受ける）。 */
  | { kind: 'poison'; amount: number }
  /** 敵ユニット 1 体を封印する（能力を無効にする）。 */
  | { kind: 'seal' }
  /** 敵ユニット 1 体を、しばらく攻撃不能にする。 */
  | { kind: 'disarm'; ms: number };

/** 倒れたときに起きること。 */
export type OnDeath =
  | { kind: 'face'; amount: number }
  /** 味方ユニット全員の攻撃力と HP を上げる。 */
  | { kind: 'buffAllies'; atk: number; hp: number }
  /** 敵ユニット全員に毒を与える。 */
  | { kind: 'poisonFoes'; amount: number };

/** 割り込み: このブロッカーのせいで、相手の攻撃が中断されたときに起きること（攻撃元に効く）。 */
export type OnInterrupt =
  | { kind: 'strike'; amount: number }
  | { kind: 'stun'; ms: number }
  /** 自分のコインが増える。 */
  | { kind: 'coin'; amount: number };

/** 自分の攻撃が（割り込まれて・対象が消えて）中断されたときに起きること。 */
export type OnCancelled =
  /** クールタイムがなくなる（すぐ攻撃し直せる）。 */
  | { kind: 'ready' }
  | { kind: 'buff'; atk: number; hp: number };

/** 生贄時: 自分のカードの上に別のカードを召喚されて、場から除かれたときに起きること。 */
export type OnReplaced =
  | { kind: 'coin'; amount: number }
  | { kind: 'face'; amount: number }
  | { kind: 'heal'; amount: number }
  /** 上書きした新しいカードの攻撃力と HP を上げる。 */
  | { kind: 'buffNew'; atk: number; hp: number };

/** 上書き召喚時: 自分のカードの上に召喚したときに起きること。 */
export type OnOverwrite =
  | { kind: 'buff'; atk: number; hp: number }
  /** 上書きされたカードのコストの半分（切り捨て）のコインが戻る。 */
  | { kind: 'refund' }
  /** すぐ攻撃できる。 */
  | { kind: 'haste' };

/** 建築物が一定時間ごとに起こすこと。 */
export type Pulse =
  | { everyMs: number; kind: 'token' }
  /** 相手のいちばん HP の低いカード（同じなら左）にダメージ */
  | { everyMs: number; kind: 'snipe'; amount: number }
  /** HP が最も減っている味方ユニットを回復 */
  | { everyMs: number; kind: 'heal'; amount: number }
  /** 敵ユニット 1 体（攻撃力が最も高い）に毒を重ねる */
  | { everyMs: number; kind: 'poison'; amount: number }
  /** 味方ユニット 1 体（攻撃力が最も低い）の攻撃力を上げる */
  | { everyMs: number; kind: 'buff'; atk: number };

/** 呪文の効果。bolt は相手のカードを 1 枚選ぶ。 */
export type SpellEffect =
  | { kind: 'bolt'; amount: number }
  | { kind: 'blast'; amount: number }
  | { kind: 'freeze'; ms: number }
  | { kind: 'ready' }
  /** 味方ユニット全員の HP を回復 */
  | { kind: 'healAll'; amount: number }
  /** 味方ユニット全員の攻撃力と HP を上げる */
  | { kind: 'buffAll'; atk: number; hp: number }
  /** 敵ユニット全員に毒 */
  | { kind: 'poisonAll'; amount: number }
  /** 敵ユニット全員を封印 */
  | { kind: 'sealAll' }
  /** 相手の溜め中の攻撃をすべて中断させ、その攻撃元のクールタイムを延ばす（溜めなしですぐ効く）。 */
  | { kind: 'parry'; ms: number };

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
  /** 狙い撃ち: ブロッカー・壁を無視して、好きな相手（プレイヤー・ユニット）を攻撃できる */
  freeAim?: true;
  /** 連撃: 1 回のクールタイムで 2 回攻撃する */
  doubleStrike?: true;
  /** 攻撃できない（壁役） */
  cannotAttack?: true;
  /** 吸血: 攻撃で与えたダメージぶん、自分（プレイヤー）の HP を回復 */
  lifesteal?: true;
  /** 不屈: 最初に倒されるとき、HP 1 で耐える */
  endure?: true;
  /** 毒の牙: 攻撃した敵ユニットに毒 N を与える */
  venom?: number;
  onSummon?: OnSummon;
  onDeath?: OnDeath;
  /** 割り込み時（ブロッカーが、相手の攻撃を中断させたとき） */
  onInterrupt?: OnInterrupt;
  /** 攻撃中断時（自分の攻撃が中断されたとき） */
  onCancelled?: OnCancelled;
  /** 生贄時（自分のカードの上に召喚されて場から除かれたとき） */
  onReplaced?: OnReplaced;
  /** 上書き召喚時（自分のカードの上に召喚したとき） */
  onOverwrite?: OnOverwrite;
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
  recruit: '若き剣士',
  footman: '隊列の歩兵',
  lancer: '槍兵',
  knight: '誓いの騎士',
  captain: '頼れる隊長',
  warlord: '軍団長',
  champion: '無敗の闘士',
  ogre: '怪力の大男',
  dragoon: '空駆ける竜騎士',
  needle: '毒針の少年',
  medic: '衛生兵',
  bulwark: '動かぬ壁',
  creeper: '毒蛇使い',
  marksman: '壁越えの狙撃兵',
  twin: '双剣士',
  bloody: '血啜りの戦士',
  bard: '吟遊詩人',
  sealer: '封印師',
  binder: '鎖使い',
  poisoner: '毒使い',
  stalwart: '不屈の戦士',
  drummer: '太鼓打ち',
  duelist: '決闘者',
  sniper: '狙い撃ちの名手',
  priest: '聖職者',
  bloodknight: '血の騎士',
  hexer: '呪術師',
  raider: '突撃隊長',
  martyr: '殉教の戦士',
  warden: '血の狙撃手',
  ironwall: '不倒の要塞兵',
  banner: '軍旗の乙女',
  reaper: '双鎌の死神',
  infirmary: '傷を癒やす小屋',
  altar: '毒煙の祭壇',
  forge: '刃を鍛える炉',
  rain: '癒しの雨が降る',
  warcry: '全軍を奮い立たせる',
  miasma: '敵陣を覆う毒',
  edict: '敵の力を封じる',
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
  veteran: '歴戦の剣士',
  executioner: '無慈悲な処刑人',
  strategist: '号令の軍師',
  colossus: '不動の巨人',
  archmage: '終焉の大魔導',
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
  warder: '割り込みの番人',
  shieldmaid: '盾の少女',
  ambusher: '待ち伏せの傭兵',
  gatekeeper: '不落の門番',
  diehard: '不屈の兵',
  berserk: '怒れる女戦士',
  offering: '供物の巫女',
  bomber: '自爆の狂信者',
  heir: '継承の姫',
  phoenix: '灰からよみがえる者',
  usurper: '玉座の簒奪者',
  conqueror: '踏み越える征服王',
  parry: '剣を弾く一閃',
};

/** 一言（説明のシートの下に出す。ゲームの数値には関係しない）。 */
const FLAVOR: Partial<Record<CardId, string>> = {
  recruit: '初陣だ。震えてなんかいない。',
  footman: '隊列を乱すな。前へ、前へ！',
  lancer: '間合いは槍の命。近づけさせない。',
  knight: '名誉にかけて、一歩も退かぬ。',
  captain: '全員、無事に帰るぞ。俺について来い。',
  warlord: '軍団の力を、思い知らせてやる。',
  champion: '強い奴はどこだ。退屈していたところだ。',
  ogre: 'ぶっ飛べ！',
  dragoon: '空から来る者に、盾は届かぬ。',
  needle: 'ちくっとするよ。あとが怖いけど。',
  medic: '動かないで。すぐに手当てするわ。',
  bulwark: '……（黙って仲間の前に立っている）',
  creeper: 'あたしが倒れても、毒は残るよ。',
  marksman: '壁の向こうでも、見えてるよ。',
  twin: '一太刀目は挨拶。二太刀目が本番！',
  bloody: '傷は癒える。敵の血でな。',
  bard: '歌え、戦え、勝利の歌を！',
  sealer: 'その力、しばらく預かるよ。',
  binder: '鎖につながれた者は、剣を振れない。',
  poisoner: 'じわじわ効くのが、いいのよ。',
  stalwart: 'まだだ。まだ倒れん！',
  drummer: 'ドン、ドン、ドン！ 士気を上げろ！',
  duelist: '二度、突く。それで終わり。',
  sniper: 'どこに隠れても、無駄だ。',
  priest: '祈りよ、傷を癒やして。',
  bloodknight: '敵の命が、俺の力になる。',
  hexer: '呪いは、触れた者を蝕む。',
  raider: '切って、また切る。止まるな！',
  martyr: '俺の死を、仲間の力に変えろ。',
  warden: '狙い、奪い、生き延びる。',
  ironwall: '壁は、倒れてなお、立つ。',
  banner: '旗の下に集え！ 勝利は我らの手に！',
  reaper: '刈り取る。二度。',
  infirmary: '傷ついた兵は、ここで息を吹き返す。',
  altar: '禍々しい煙が、敵の足を蝕む。',
  forge: '打て、鍛えろ。刃は何度でも研がれる。',
  rain: '恵みの雨よ、傷を洗い流せ。',
  warcry: '今だ！ 全軍、力を振り絞れ！',
  miasma: '吸えば最後。咳き込む間もない。',
  edict: '魔よ、眠れ。力を封じよ。',
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
  veteran: '数え切れない戦場を生き延びた。それだけで十分だ。',
  executioner: '指名された者は、もう立っていない。',
  strategist: '全軍、動け。時は待ってくれません。',
  colossus: '……通さぬ。',
  archmage: '終わらせましょう。敵も、味方も。',
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
  warder: '通さん。ここから先へは、一歩もな。',
  shieldmaid: 'えいっ！ ……あれ、止まった？',
  ambusher: '飛び出した先に、金貨が落ちてる。',
  gatekeeper: '閉ざされた門は、誰にも破れない。',
  diehard: '止められた？ 何度でも、行くさ。',
  berserk: '邪魔をするな。その怒り、返してやる！',
  offering: '私を捧げます。どうか、力を。',
  bomber: '見て！ きれいな花火が上がるよ！',
  heir: '私が倒れても、王冠は次へ継がれる。',
  phoenix: '灰の中から、また立ち上がる。',
  usurper: '玉座は、奪うものだ。',
  conqueror: '踏み越えるたび、俺は強くなる。',
  parry: 'そこだ！ 剣を弾き返せ！',
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
  herald: unit('herald', 'ポラン', 1, 1, 1, 10, { haste: true }),
  miner: unit('miner', 'ドルガ', 2, 1, 2, 12, { onSummon: { kind: 'token' } }),
  usurer: unit('usurer', 'バルク', 2, 2, 2, 13, { onDeath: { kind: 'face', amount: 2 } }),
  spy: unit('spy', 'カゲマル', 3, 3, 2, 11, { stealth: true }),
  craftsman: unit('craftsman', 'ゴルド', 3, 3, 3, 14, { unitBonus: 2 }),
  guard: unit('guard', 'ロイ', 2, 1, 3, 16, { blocker: true }),
  banker: unit('banker', 'ミレーヌ', 3, 3, 3, 16, { coinBoost: 0.22 }),
  informer: unit('informer', 'シオ', 2, 2, 2, 12, { onSummon: { kind: 'stun', ms: 6000 } }),
  taxman: unit('taxman', 'リオ', 4, 3, 3, 14, { onSummon: { kind: 'strike', amount: 2 } }),
  double: unit('double', 'ジーク', 3, 3, 2, 18, { barrier: true }),
  inspector: unit('inspector', 'アリア', 4, 3, 3, 16, { ranged: true }),
  blockader: unit('blockader', 'ガストン', 4, 2, 3, 16, { blocker: true, armor: 1 }),
  architect: unit('architect', 'セラ', 5, 4, 5, 16, { onSummon: { kind: 'heal', amount: 3 } }),
  boss: unit('boss', 'ヴァルガ', 5, 3, 6, 20, { splash: 1 }),
  // コスト 6 以上（基準: 能力なしならスタッツ合計 ≒ コスト×2+1、能力ぶんだけ減らす）
  veteran: unit('veteran', 'ダリウス', 6, 7, 7, 15),
  executioner: unit('executioner', 'ネロ', 7, 4, 8, 20, { onSummon: { kind: 'destroy' } }),
  strategist: unit('strategist', 'ルナ', 8, 8, 8, 10, { onSummon: { kind: 'cdCut', ms: 10000 } }),
  colossus: unit('colossus', 'グラム', 9, 7, 10, 15, { blocker: true }),
  archmage: unit('archmage', 'オルガ', 10, 10, 10, 30, { onSummon: { kind: 'wipe' } }),
  apprentice: { ...unit('apprentice', '志願兵', 1, 1, 1, 12), token: true },

  // ---- 基礎スタッツ（能力なし）: コスト 1〜5 は 攻撃/HP がコスト・コスト+1（どちらかが +1）、コスト 7 以上は コスト+1 / コスト+1 ----
  recruit: unit('recruit', 'アルト', 1, 1, 2, 10),
  footman: unit('footman', 'ベン', 2, 3, 2, 12),
  lancer: unit('lancer', 'ソーマ', 3, 3, 4, 14),
  knight: unit('knight', 'レオン', 4, 5, 4, 15),
  captain: unit('captain', 'ハンス', 5, 5, 6, 16),
  warlord: unit('warlord', 'ガイウス', 7, 8, 8, 16),
  champion: unit('champion', 'ヴォルフ', 8, 9, 9, 16),
  ogre: unit('ogre', 'ドーン', 9, 10, 10, 12),
  dragoon: unit('dragoon', 'ファイ', 10, 11, 11, 10),

  // ---- 能力つき（能力ぶんだけスタッツを減らす） ----
  needle: unit('needle', 'ピオ', 1, 1, 1, 10, { venom: 1 }),
  medic: unit('medic', 'ララ', 2, 1, 2, 12, { onSummon: { kind: 'healAlly', amount: 3 } }),
  bulwark: unit('bulwark', 'モルド', 2, 0, 6, 16, { blocker: true, cannotAttack: true }),
  creeper: unit('creeper', 'ハッカ', 2, 1, 2, 12, { onDeath: { kind: 'poisonFoes', amount: 1 } }),
  marksman: unit('marksman', 'リュカ', 3, 2, 3, 14, { freeAim: true }),
  twin: unit('twin', 'ミルカ', 3, 2, 3, 15, { doubleStrike: true }),
  bloody: unit('bloody', 'グレン', 3, 3, 3, 14, { lifesteal: true }),
  bard: unit('bard', 'ノア', 3, 2, 2, 14, { onSummon: { kind: 'buffAlly', atk: 1, hp: 1 } }),
  sealer: unit('sealer', 'ヴィク', 4, 3, 4, 15, { onSummon: { kind: 'seal' } }),
  binder: unit('binder', 'カイ', 4, 4, 3, 16, { onSummon: { kind: 'disarm', ms: 10000 } }),
  poisoner: unit('poisoner', 'ゾーラ', 4, 3, 4, 15, { onSummon: { kind: 'poison', amount: 2 } }),
  stalwart: unit('stalwart', 'バーナ', 4, 3, 5, 16, { endure: true }),
  drummer: unit('drummer', 'オッド', 4, 3, 3, 15, { onSummon: { kind: 'buffAllies', atk: 1, hp: 0 } }),
  duelist: unit('duelist', 'セシル', 5, 4, 4, 16, { doubleStrike: true }),
  sniper: unit('sniper', 'ガルム', 5, 4, 5, 16, { freeAim: true }),
  priest: unit('priest', 'イリス', 5, 4, 5, 16, { onSummon: { kind: 'healAlly', amount: 5 } }),
  bloodknight: unit('bloodknight', 'ブラッド', 5, 4, 5, 16, { lifesteal: true }),
  hexer: unit('hexer', 'ケイン', 5, 4, 4, 16, { venom: 2 }),
  raider: unit('raider', 'アーク', 6, 5, 6, 16, { doubleStrike: true }),
  martyr: unit('martyr', 'ネメア', 6, 5, 5, 16, { onDeath: { kind: 'buffAllies', atk: 2, hp: 0 } }),
  warden: unit('warden', 'エルヴァ', 7, 6, 6, 16, { freeAim: true, lifesteal: true }),
  ironwall: unit('ironwall', 'ヴァル', 8, 6, 10, 18, { blocker: true, endure: true }),
  banner: unit('banner', 'ミナ', 9, 6, 6, 16, { onSummon: { kind: 'buffAllies', atk: 2, hp: 2 } }),
  reaper: unit('reaper', 'ラスト', 10, 9, 9, 17, { doubleStrike: true }),

  wall: building('wall', '城壁', 2, 8, { blocker: true }),
  exchange: building('exchange', '補給所', 3, 5, { coinBoost: 0.3 }),
  tradingHouse: building('tradingHouse', '戦旗塔', 2, 5, { rally: 1 }),
  factory: building('factory', '兵舎', 4, 5, { pulse: { everyMs: 6000, kind: 'token' } }),
  cathedral: building('cathedral', '鐘楼', 2, 6, { cooldownCut: 0.3 }),
  fortress: building('fortress', '砦', 5, 8, { pulse: { everyMs: 9000, kind: 'snipe', amount: 1 } }),
  infirmary: building('infirmary', '治療所', 1, 5, { pulse: { everyMs: 8000, kind: 'heal', amount: 2 } }),
  altar: building('altar', '毒の祭壇', 3, 5, { pulse: { everyMs: 8000, kind: 'poison', amount: 1 } }),
  forge: building('forge', '鍛冶場', 3, 6, { pulse: { everyMs: 7000, kind: 'buff', atk: 1 } }),

  quarry: spell('quarry', '投石', 4, { kind: 'bolt', amount: 5 }),
  quake: spell('quake', '大地割り', 4, { kind: 'blast', amount: 2 }),
  roadblock: spell('roadblock', 'バリケード', 2, { kind: 'freeze', ms: 10000 }),
  festival: spell('festival', '鬨の声', 2, { kind: 'ready' }),

  // ---- 割り込み（ブロッカーが攻撃を中断させる）・攻撃中断・生贄（上書き）・上書き召喚の能力 ----
  warder: unit('warder', 'ヴィゴ', 3, 2, 4, 15, { blocker: true, onInterrupt: { kind: 'strike', amount: 2 } }),
  shieldmaid: unit('shieldmaid', 'ミーア', 2, 1, 4, 14, { blocker: true, onInterrupt: { kind: 'stun', ms: 4000 } }),
  ambusher: unit('ambusher', 'ザック', 4, 3, 4, 15, { blocker: true, onInterrupt: { kind: 'coin', amount: 2 } }),
  gatekeeper: unit('gatekeeper', 'ドミニク', 6, 5, 8, 17, { blocker: true, onInterrupt: { kind: 'strike', amount: 4 } }),
  diehard: unit('diehard', 'ボルク', 3, 3, 3, 14, { onCancelled: { kind: 'ready' } }),
  berserk: unit('berserk', 'ジーナ', 4, 3, 4, 15, { onCancelled: { kind: 'buff', atk: 1, hp: 1 } }),
  offering: unit('offering', 'ユラ', 2, 2, 2, 12, { onReplaced: { kind: 'coin', amount: 3 } }),
  bomber: unit('bomber', 'ガイ', 3, 3, 2, 14, { onReplaced: { kind: 'face', amount: 4 } }),
  heir: unit('heir', 'リーゼ', 3, 3, 3, 14, { onReplaced: { kind: 'buffNew', atk: 3, hp: 3 } }),
  phoenix: unit('phoenix', 'フェン', 4, 4, 4, 15, { onReplaced: { kind: 'heal', amount: 6 } }),
  usurper: unit('usurper', 'クロウ', 3, 3, 3, 14, { onOverwrite: { kind: 'buff', atk: 2, hp: 2 } }),
  conqueror: unit('conqueror', 'レグ', 5, 4, 4, 16, { onOverwrite: { kind: 'refund' } }),
  parry: spell('parry', 'パリィ', 1, { kind: 'parry', ms: 5000 }),
  rain: spell('rain', '癒しの雨', 1, { kind: 'healAll', amount: 5 }),
  warcry: spell('warcry', '戦の号令', 2, { kind: 'buffAll', atk: 1, hp: 1 }),
  miasma: spell('miasma', '毒霧', 3, { kind: 'poisonAll', amount: 2 }),
  edict: spell('edict', '封印の儀', 5, { kind: 'sealAll' }),
};

/** 自分の最初のデッキ（10 枚固定）。 */
export const STARTER_DECK: CardId[] = [
  'herald',
  'guard',
  'craftsman',
  'double',
  'taxman',
  'architect',
  'fortress',
  'quarry',
  'veteran',
  'executioner',
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
  'roadblock',
  'quake',
  'strategist',
];

/** CPU のデッキ（テーマ別。試合ごとに 1 つ選ぶ。どれも 10 枚）。 */
export const RIVAL_DECKS: { name: string; deck: CardId[] }[] = [
  { name: '商人', deck: RIVAL_DECK },
  { name: '毒', deck: ['needle', 'creeper', 'medic', 'footman', 'poisoner', 'hexer', 'altar', 'miasma', 'knight', 'raider'] },
  { name: '巨人', deck: ['recruit', 'bulwark', 'lancer', 'stalwart', 'captain', 'warlord', 'champion', 'ironwall', 'ogre', 'forge'] },
  { name: '連撃', deck: ['herald', 'recruit', 'twin', 'bloody', 'drummer', 'duelist', 'bloodknight', 'warcry', 'raider', 'reaper'] },
  { name: '狙撃', deck: ['guard', 'marksman', 'bard', 'lancer', 'sniper', 'priest', 'infirmary', 'rain', 'warden', 'banner'] },
  { name: '割り込み', deck: ['recruit', 'shieldmaid', 'warder', 'diehard', 'ambusher', 'berserk', 'knight', 'gatekeeper', 'parry', 'captain'] },
  { name: '生贄', deck: ['offering', 'bomber', 'heir', 'footman', 'usurper', 'phoenix', 'conqueror', 'knight', 'captain', 'recruit'] },
  { name: '封印', deck: ['informer', 'spy', 'sealer', 'binder', 'blockader', 'knight', 'quarry', 'captain', 'poisoner', 'martyr'] },
];

export function isBlocker(card: CardId): boolean {
  return !!CARDS[card].ab.blocker;
}

/** 登場時に、敵のユニット・カードを選ぶ効果。 */
const FOE_PICK = new Set(['strike', 'stun', 'destroy', 'poison', 'seal', 'disarm']);
/** 登場時に、味方のユニットを選ぶ効果。 */
const ALLY_PICK = new Set(['healAlly', 'buffAlly']);

/** 登場時に選ぶ相手の側（敵 / 味方）。選ばないカードは null。 */
export function summonSide(card: CardId): 'foe' | 'ally' | null {
  const k = CARDS[card].ab.onSummon?.kind;
  if (!k) return null;
  return FOE_PICK.has(k) ? 'foe' : ALLY_PICK.has(k) ? 'ally' : null;
}

/** 使うときに対象を 1 枚選ぶか（登場時に敵・味方を選ぶ効果、単体の呪文）。 */
export function needsTarget(card: CardId): boolean {
  return summonSide(card) !== null || CARDS[card].ab.spell?.kind === 'bolt';
}

/** 選ばないと効かない（単体の呪文）。狙撃・足止は選ばなくても召喚はできる。 */
export function requiresTarget(card: CardId): boolean {
  return CARDS[card].ab.spell?.kind === 'bolt';
}

export const TYPE_NAME: Record<CardType, string> = { unit: 'ユニット', building: '建築物', spell: '呪文' };

/** 「攻撃力 +1・HP +1」のような文。 */
function buffText(atk: number, hp: number): string {
  const parts: string[] = [];
  if (atk) parts.push(`攻撃力 +${atk}`);
  if (hp) parts.push(`HP +${hp}`);
  return parts.join('・');
}

/** 状態の説明（説明シートの下に出す）。 */
export const STATUS_NOTES: string[] = [
  '割り込み: 攻撃の溜め中に相手のブロッカーが出ると、その攻撃は中断される（クールタイムは戻る）',
  '上書き: 自分のカードの上に召喚すると入れ替わる。入れ替わったカードの「生贄時」の能力が起きる',
  '生贄: 上書きされて場から消えること',
  '毒: 攻撃するたびに、その数だけダメージを受ける',
  '封印: 能力がすべて無効になる',
  '攻撃不能: しばらく、または能力で、攻撃できない',
];

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
  if (s?.kind === 'destroy') lines.push('召喚時：敵ユニット 1 体を破壊する');
  if (s?.kind === 'cdCut') lines.push(`召喚時：自分のほかのユニットのクールタイムを ${s.ms / 1000} 秒減らす`);
  if (s?.kind === 'wipe') lines.push('召喚時：ほかのユニットを敵味方すべて破壊する');
  if (s?.kind === 'healAlly') lines.push(`召喚時：味方ユニット 1 体の HP を ${s.amount} 回復`);
  if (s?.kind === 'buffAlly') lines.push(`召喚時：味方ユニット 1 体の${buffText(s.atk, s.hp)}`);
  if (s?.kind === 'buffAllies') lines.push(`召喚時：自分のほかのユニット全員の${buffText(s.atk, s.hp)}`);
  if (s?.kind === 'poison') lines.push(`召喚時：敵ユニット 1 体に毒 ${s.amount} を与える`);
  if (s?.kind === 'seal') lines.push('召喚時：敵ユニット 1 体を封印する（能力を無効にする）');
  if (s?.kind === 'disarm') lines.push(`召喚時：敵ユニット 1 体を ${s.ms / 1000} 秒間、攻撃不能にする`);
  if (a.freeAim) lines.push('狙い撃ち（ブロッカー・壁を無視して、好きな相手を攻撃できる）');
  if (a.doubleStrike) lines.push('連撃（1 回のクールタイムで 2 回攻撃する）');
  if (a.cannotAttack) lines.push('攻撃できない');
  if (a.lifesteal) lines.push('吸血（攻撃で与えたダメージぶん、自分の HP を回復）');
  if (a.endure) lines.push('不屈（最初に倒されるとき、HP 1 で耐える）');
  if (a.venom) lines.push(`攻撃時：攻撃した敵ユニットに毒 ${a.venom} を与える`);
  if (a.ranged) lines.push('攻撃時：反撃を受けない');
  if (a.splash) lines.push(`攻撃時：ほかの敵カード全員に ${a.splash} ダメージ`);
  if (a.onDeath?.kind === 'face') lines.push(`死亡時：敵プレイヤーに ${a.onDeath.amount} ダメージ`);
  if (a.onDeath?.kind === 'buffAllies') lines.push(`死亡時：味方ユニット全員の${buffText(a.onDeath.atk, a.onDeath.hp)}`);
  const oi = a.onInterrupt;
  if (oi?.kind === 'strike') lines.push(`割り込み時：中断させた敵ユニットに ${oi.amount} ダメージ`);
  if (oi?.kind === 'stun') lines.push(`割り込み時：中断させた敵ユニットのクールタイム +${oi.ms / 1000} 秒`);
  if (oi?.kind === 'coin') lines.push(`割り込み時：コイン +${oi.amount}`);
  const oc = a.onCancelled;
  if (oc?.kind === 'ready') lines.push('攻撃中断時：クールタイムがなくなる');
  if (oc?.kind === 'buff') lines.push(`攻撃中断時：自分の${buffText(oc.atk, oc.hp)}`);
  const or = a.onReplaced;
  if (or?.kind === 'coin') lines.push(`生贄時：コイン +${or.amount}`);
  if (or?.kind === 'face') lines.push(`生贄時：敵プレイヤーに ${or.amount} ダメージ`);
  if (or?.kind === 'heal') lines.push(`生贄時：自分の HP を ${or.amount} 回復`);
  if (or?.kind === 'buffNew') lines.push(`生贄時：上書きしたカードの${buffText(or.atk, or.hp)}`);
  const oo = a.onOverwrite;
  if (oo?.kind === 'buff') lines.push(`上書き召喚時：自分の${buffText(oo.atk, oo.hp)}`);
  if (oo?.kind === 'refund') lines.push('上書き召喚時：上書きされたカードのコストの半分のコインが戻る');
  if (oo?.kind === 'haste') lines.push('上書き召喚時：すぐ攻撃できる');
  if (a.onDeath?.kind === 'poisonFoes') lines.push(`死亡時：敵ユニット全員に毒 ${a.onDeath.amount} を与える`);
  const p = a.pulse;
  if (p?.kind === 'token') lines.push(`${p.everyMs / 1000} 秒ごと：空いている枠に志願兵を出す`);
  if (p?.kind === 'snipe') lines.push(`${p.everyMs / 1000} 秒ごと：HP がいちばん低い敵カードに ${p.amount} ダメージ`);
  if (p?.kind === 'heal') lines.push(`${p.everyMs / 1000} 秒ごと：HP がいちばん減っている味方ユニットを ${p.amount} 回復`);
  if (p?.kind === 'poison') lines.push(`${p.everyMs / 1000} 秒ごと：攻撃力がいちばん高い敵ユニットに毒 ${p.amount} を重ねる`);
  if (p?.kind === 'buff') lines.push(`${p.everyMs / 1000} 秒ごと：攻撃力がいちばん低い味方ユニットの攻撃力 +${p.atk}`);
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
  if (sp?.kind === 'healAll') lines.push(`味方ユニット全員の HP を ${sp.amount} 回復`);
  if (sp?.kind === 'buffAll') lines.push(`味方ユニット全員の${buffText(sp.atk, sp.hp)}`);
  if (sp?.kind === 'poisonAll') lines.push(`敵ユニット全員に毒 ${sp.amount} を与える`);
  if (sp?.kind === 'sealAll') lines.push('敵ユニット全員を封印する（能力を無効にする）');
  if (sp?.kind === 'parry') lines.push(`溜め中の敵の攻撃をすべて中断させ、攻撃元のクールタイム +${sp.ms / 1000} 秒（すぐ効く）`);
  return lines;
}

/** 使い方の補足（説明の下に小さく出す）。 */
export function usageNote(card: CardId): string | null {
  const def = CARDS[card];
  if (needsTarget(card)) {
    if (def.type === 'spell') return '敵カードの上へドラッグして使う';
    return summonSide(card) === 'ally'
      ? '場へ置いたあと、効かせる味方ユニットをタップする（選べる味方がいなければ、そのまま置ける）'
      : '場へ置いたあと、効かせる敵カードをタップする（選ばないと置けない）';
  }
  if (def.type === 'spell') return '盤面へドラッグして使う';
  if (def.type === 'building') return '攻撃しない。場にあるだけで効く';
  return null;
}

/** 壁の説明（ヘルプと案内で使う）。 */
export const WALL_TEXT = `場が ${FIELD_SLOTS} 枚うまっている間、そのプレイヤーは攻撃されない（壁）`;
