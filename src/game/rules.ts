// ルールの数値。ここ以外に書かない。変えたら npm run simulate で測り直す。

/** プレイヤーの HP。 */
export const PLAYER_HP = 30;
/** 試合の長さ（ms）。 */
export const MATCH_MS = 180_000;
/** この時刻（ms）からコインが 2 倍速になる。 */
export const DOUBLE_COIN_FROM_MS = 120_000;
/** コイン 1 枚がたまるまでの時間（ms）。 */
export const COIN_MS = 2800;
export const COIN_MAX = 10;
export const COIN_START = 5;
/** 場の枠の数。 */
export const FIELD_SLOTS = 5;
/** 手札の枚数（このほかに「次のカード」を 1 枚見せる）。 */
export const HAND_SIZE = 4;
/** 召喚してから攻撃できるまでの時間（ms）。 */
export const SUMMON_DELAY_MS = 1000;
/** クールタイム: 攻撃してから次の攻撃ができるまでの時間（ms）。攻撃を縛るのはこれだけ（コインは召喚にだけ使う）。 */
export let ATTACK_COOLDOWN_MS = 6000;
/** バランス測定（scripts/simulate.ts の cd=）専用。ゲーム本体は呼ばない。 */
export function overrideAttackCooldownForSimulation(ms: number): void {
  ATTACK_COOLDOWN_MS = ms;
}

/** その時刻のコインのたまる速さ（枚/ms）。 */
export function coinRate(timeMs: number): number {
  return (timeMs >= DOUBLE_COIN_FROM_MS ? 2 : 1) / COIN_MS;
}
