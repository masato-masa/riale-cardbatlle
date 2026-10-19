// 効果音。ElevenLabs で作った録音（src/assets/sfx/<名前>-<番号>.wav、samples.ts）を WebAudio で鳴らす。
// コードで合成した音は使わない。録音が無い音・まだ読み込めていない音は、鳴らさない。
// 鳴らすたびにわずかに音程と音量をゆらし、同じ音が続いても単調にならないようにする。
// 共通の残響（audio-graph.ts）をくぐるので、ひとつの空間で鳴って聞こえる。
//
// AudioContext はページ読み込み時ではなく、最初のユーザー操作で作る。作れなかった場合・
// 設定で切ってある場合は、何もせず黙って続行する（例外を投げない）。
// 直前の音から近すぎる音は間引く（勝ち負け・合図は必ず鳴らす）。

import { getGraph, whenGraphCreated } from './audio-graph';
import { stopBgm } from './bgm';
import { chooseBuffer, loadSamples, type VoiceName } from './samples';
import { isSoundEnabled } from './settings';
import { dbToGain, shouldPlay } from './sound-plan';

whenGraphCreated((g) => loadSamples(g.ctx));

/** 専用の録音が無い音は、近い録音を小さめに借りる（名前, 借りる音, 音量 dB）。 */
const BORROW: Record<string, [VoiceName, number]> = {
  pickup: ['select', -4],
  stun: ['barrier', -2],
  reject: ['tap', -3],
};

type PlayName = VoiceName | 'pickup' | 'stun' | 'reject';

/** 呼び出し全体を try/catch で包む。鳴らせなくても例外は外に出さない。 */
function play(name: PlayName, force = false, variant?: number): void {
  if (!isSoundEnabled()) return;
  const now = performance.now();
  if (!shouldPlay(now, lastPlayedAt, force)) return;
  lastPlayedAt = now;
  try {
    const g = getGraph();
    if (!g) return;
    const [voice, trimDb] = BORROW[name] ?? [name as VoiceName, 0];
    const buf = chooseBuffer(voice, variant);
    if (!buf) return;
    const src = g.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.03;
    const amp = g.ctx.createGain();
    amp.gain.value = dbToGain(trimDb) * (0.92 + Math.random() * 0.16);
    src.connect(amp);
    amp.connect(g.sfxBus);
    src.start(g.ctx.currentTime + 0.005);
  } catch {
    // 鳴らせなくても続行
  }
}

let lastPlayedAt = 0;

/** 最初のユーザー操作（ホームのボタンなど）で、なるべく早く AudioContext を用意しておく。 */
export function primeAudio(): void {
  if (!isSoundEnabled()) return;
  try {
    getGraph();
  } catch {
    // 何もしない
  }
}

/** ボタン・シートの開閉など、ゲームに関わらない UI の操作。 */
export const playUiTap = (): void => play('tap');
/** カードを選ぶ・予約するなど、小さな決定。 */
export const playSelect = (): void => play('select');
/** 手札を持ち上げた。 */
export const playPickup = (): void => play('pickup');
/** カードを召喚する。コスト 5 以上は大きい音。 */
export const playSummon = (cost: number): void => play(cost >= 5 ? 'summonBig' : 'summonSmall');
/** 攻撃が当たる。ブロッカーなら金属の音、プレイヤーへの直撃は重い一撃。 */
export const playHit = (kind: 'unit' | 'blocker' | 'player'): void =>
  play(kind === 'player' ? 'hitPlayer' : kind === 'blocker' ? 'hitBlocker' : 'hitUnit');
/** カードが倒れる。 */
export const playDeath = (): void => play('death', true);
/** 自分のユニットのクールタイムが明けた。 */
export const playReady = (): void => play('ready', true);
/** HP の回復。 */
export const playHeal = (): void => play('heal', true);
/** 足止め（氷・鎖）。 */
export const playStun = (): void => play('stun', true);
/** 結界が攻撃を弾いた。 */
export const playBarrier = (): void => play('barrier', true);
/** コイン 2 倍・終盤の合図。 */
export const playHorn = (): void => play('horn', true);
/** 打てない札を押した。 */
export const playReject = (): void => play('reject');
/** 対戦開始（VS の演出）。 */
export const playBattleStart = (): void => play('battleStart', true);
/** 呪文を唱え始めた。 */
export const playSpellCast = (): void => play('spellCast', true);

/** 勝ち: BGM は消し、ファンファーレだけを聴かせる。 */
export function playWin(): void {
  stopBgm(0.5);
  play('win', true);
}

/** 負け: BGM は消し、静かな 3 音を聴かせる。 */
export function playLose(): void {
  stopBgm(0.5);
  play('lose', true);
}

/** サウンドテスト画面用: 名前を指定して鳴らす（間引きなし）。 */
export const playVoice = (name: VoiceName, variant?: number): void => play(name, true, variant);
