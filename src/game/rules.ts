// ルールの数値。ここ以外に書かない。変えたら npm run simulate で測り直す。

/** プレイヤーの HP。 */
export const PLAYER_HP = 20;
/** プレイヤーの攻撃力。プレイヤーを攻撃したユニットは、この分の反撃を受ける（遠隔は受けない）。 */
export const PLAYER_ATK = 0;
/** 試合の長さ（ms）。 */
export const MATCH_MS = 240_000;
/** この時刻（ms）から、ユニットのクールタイムが 2 倍の速さで減る（コインは 2 倍にしない。膠着を防ぐため）。 */
export const FAST_COOLDOWN_FROM_MS = 120_000;
/** コイン 1 枚がたまるまでの時間（ms）。 */
export const COIN_MS = 3000;
export const COIN_MAX = 10;
export const COIN_START = 3;
/** 場の枠の数。 */
export const FIELD_SLOTS = 3;
/** 手札の枚数（このほかに「次のカード」を 1 枚見せる）。 */
export const HAND_SIZE = 4;

/** 溜め: 攻撃・呪文・召喚時の狙撃や足止は、選んでからこれだけたって効く（ms）。
 *  その間に攻撃元か対象が場から消えたら中断する。クールタイムとコインは選んだ時点で使う。 */
export const WINDUP_MS = 1000;

/** 登場の溜め: カードを配置してから、実際に登場するまでの時間（ms）。攻撃の溜め（WINDUP_MS）より短いので、溜めを見てから出したブロッカーで割り込める。
 *  相手の攻撃を見てから妨害のブロッカーを出しても間に合わないので、先読みが要る。0 にすると即時登場（テスト用）。 */
export let SUMMON_WINDUP_MS = 500;

/** テスト用: 登場の溜めを変える（0 で即時）。ゲームからは呼ばない。 */
export function overrideSummonWindupForTests(ms: number): void {
  SUMMON_WINDUP_MS = ms;
}

/** 妨害（ブロッカー・壁・チェンジで攻撃を中断させる）された側のユニットのクールタイムに足す時間（ms）。 */
export const INTERFERE_MS = 5000;

/** その時刻のコインのたまる速さ（枚/ms）。 */
export function coinRate(_timeMs: number): number {
  return 1 / COIN_MS;
}

/** クールタイムの倍率。カードごとのクールタイム（cards.ts の cd）に掛ける。ゲームでは 1 のまま。 */
export let COOLDOWN_SCALE = 1;

/** シミュレーションでクールタイムをまとめて伸び縮みさせる（scripts/simulate.ts の cdx=）。ゲームからは呼ばない。 */
export function overrideCooldownScaleForSimulation(scale: number): void {
  COOLDOWN_SCALE = scale;
}
