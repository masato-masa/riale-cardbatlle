// ルールの案ごとのカードの数値。カードは全案共通にせず、案ごとにバランスを分ける（ユーザー指定 2026-10-25）。
// cards.ts の CARDS が案 1（手動で攻撃）の数値。案を選ぶと applyRuleBalance がその案の上書きを CARDS に重ねる
// （1 度に遊ぶのは 1 つの案だけなので、表を差し替える形にした。シミュレーションも案ごとに呼び直す）。

import { CARDS, setAimOverrides, type Aim, type CardDef, type CardId } from './cards';

export type BalanceMode = 1 | 2 | 3;

type Stats = Partial<Pick<CardDef, 'summon' | 'atk' | 'hp' | 'cd'>>;

interface ModeBalance {
  /** カードの数値の上書き。 */
  cards?: Partial<Record<CardId, Stats>>;
  /** 自動攻撃の狙い方の上書き（能力からの既定 aimOf を変える）。 */
  aim?: Partial<Record<CardId, Aim>>;
}

/** 案ごとの上書き。案 1 は cards.ts のまま。 */
export const MODE_BALANCE: Record<BalanceMode, ModeBalance> = {
  1: {},
  // 案 2（自動攻撃・反撃あり）: 結界持ちが強く（自動の殴り合いで最初の一撃を必ず防ぐ）、守りのカードが弱い（攻撃してこない壁は自動では無視されやすい）
  2: {
    cards: {
      double: { summon: 4 },
      stalwart: { summon: 5 },
      tradingHouse: { summon: 2 },
      bulwark: { hp: 10 },
      wallguard: { hp: 6 },
      wall: { hp: 11 },
      marksman: { atk: 3 },
      medic: { hp: 3 },
      quarry: { summon: 3 },
      // 相手デッキの偏り（狙撃・連撃が弱く、工房・奇襲・死霊が強い）
      priest: { summon: 4 },
      twin: { hp: 4 },
      duelist: { hp: 5 },
      factory: { summon: 6 },
      spy: { hp: 2 },
      martyr: { summon: 8, hp: 4 },
      warden: { summon: 9, atk: 5 },
      bloodknight: { summon: 6, hp: 4 },
      heir: { summon: 4 },
      usurper: { summon: 4 },
      conqueror: { summon: 6 },
      warlord: { summon: 8 },
    },
    // 狙い撃ち（ブロッカー・壁を越えられる）は、プレイヤーを狙わせると強みが活きる（弱った敵優先だと狙撃デッキが 0%）
    // ポラン（1 コスト・速攻）はプレイヤー優先だと毎試合 4 回近く顔を殴り、安いユニットを並べる死霊デッキが 90% 勝った
    aim: { sniper: 'player', marksman: 'player', herald: 'unit' },
  },
  // 案 3（自動攻撃・反撃なし）: 鐘楼（クールタイム短縮）が半分のクールタイムとかさなって強すぎ、入れ替え向けのステルス持ちが弱い
  3: {
    cards: {
      cathedral: { summon: 4 },
      trickster: { atk: 4 },
      swindler: { atk: 3 },
      inspector: { atk: 4 },
      quarry: { summon: 3 },
      // 相手デッキの偏り（毒・商人・討伐・工房が強く、連撃・死霊・呪術が弱い）
      poisoner: { summon: 5 },
      champion: { summon: 9 },
      banker: { summon: 4 },
      usurer: { atk: 1 },
      hunter: { atk: 1 },
      slayer: { atk: 4 },
      factory: { summon: 5 },
      duelist: { hp: 5 },
      bloodknight: { hp: 6 },
      martyr: { hp: 6 },
      warcry: { summon: 1 },
      quake: { summon: 3 },
    },
  },
};

/** 案 1 の数値（上書きを外すときに戻す）。 */
const BASE: Partial<Record<CardId, Stats>> = {};

let applied: BalanceMode = 1;

/** その案の数値をカードの表に重ねる（前の案の上書きは戻してから）。 */
export function applyRuleBalance(mode: BalanceMode): void {
  for (const [id, base] of Object.entries(BASE) as [CardId, Stats][]) Object.assign(CARDS[id], base);
  const { cards = {}, aim = {} } = MODE_BALANCE[mode];
  for (const [id, stats] of Object.entries(cards) as [CardId, Stats][]) {
    const def = CARDS[id];
    if (!BASE[id]) BASE[id] = { summon: def.summon, atk: def.atk, hp: def.hp, cd: def.cd };
    Object.assign(def, stats);
  }
  setAimOverrides(aim);
  applied = mode;
}

/** いま重ねている案。 */
export function appliedRuleBalance(): BalanceMode {
  return applied;
}
