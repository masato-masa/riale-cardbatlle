// ルールの数値。ここ以外に書かない。変えたら npm run simulate で測り直す。

/** プレイヤーの HP。 */
export const PLAYER_HP = 20;
/** 試合の長さ（ms）。 */
export const MATCH_MS = 180_000;
/** この時刻（ms）からコインが 2 倍速になる。 */
export const DOUBLE_COIN_FROM_MS = 120_000;
/** コイン 1 枚がたまるまでの時間（ms）。 */
export const COIN_MS = 7000;
export const COIN_MAX = 10;
export const COIN_START = 5;
/** 場の枠の数。 */
export const FIELD_SLOTS = 3;
/** 手札の枚数（このほかに「次のカード」を 1 枚見せる）。 */
export const HAND_SIZE = 4;

/** 溜め: 攻撃・呪文・召喚時の狙撃や足止は、選んでからこれだけたって効く（ms）。
 *  その間に攻撃元か対象が場から消えたら中断する。クールタイムとコインは選んだ時点で使う。 */
export const WINDUP_MS = 1000;

/** その時刻のコインのたまる速さ（枚/ms）。 */
export function coinRate(timeMs: number): number {
  return (timeMs >= DOUBLE_COIN_FROM_MS ? 2 : 1) / COIN_MS;
}

/** クールタイムの倍率。カードごとのクールタイム（cards.ts の cd）に掛ける。ゲームでは 1 のまま。 */
export let COOLDOWN_SCALE = 1;

/** シミュレーションでクールタイムをまとめて伸び縮みさせる（scripts/simulate.ts の cdx=）。ゲームからは呼ばない。 */
export function overrideCooldownScaleForSimulation(scale: number): void {
  COOLDOWN_SCALE = scale;
}
