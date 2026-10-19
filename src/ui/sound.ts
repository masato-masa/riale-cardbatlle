// 効果音。音源ファイルは持たず、WebAudio で合成する（sfx-voices.ts の定義、instruments.ts の部品）。
// 読み込みゼロ・容量ゼロ・遅延ゼロ。すべての音は同じ調（ハ長調／イ短調のペンタトニック）で、
// 共通の残響（audio-graph.ts）をくぐるので、重なっても濁らず、ひとつの空間で鳴って聞こえる。
//
// AudioContext はページ読み込み時ではなく、最初のユーザー操作で作る。作れなかった場合・
// 設定で切ってある場合は、何もせず黙って続行する（例外を投げない）。
// 直前の音から近すぎる音は間引く（勝ち負け・合図は必ず鳴らす）。

import { getGraph, whenGraphCreated } from './audio-graph';
import { stopBgm } from './bgm';
import { isSoundEnabled } from './settings';
import { dbToGain, shouldPlay } from './sound-plan';
import { chooseBuffer, loadSamples, sampleTrimDb } from './samples';
import { VOICES, VOICE_TRIM_DB, type VoiceName } from './sfx-voices';

whenGraphCreated((g) => loadSamples(g.ctx));

/** 呼び出し全体を try/catch で包む。鳴らせなくても例外は外に出さない。 */
function play(name: VoiceName, force = false, variant?: number): void {
  if (!isSoundEnabled()) return;
  const now = performance.now();
  if (!shouldPlay(now, lastPlayedAt, force)) return;
  lastPlayedAt = now;
  try {
    const g = getGraph();
    if (!g) return;
    // 録音（ElevenLabs の候補）があればそれを、無ければ合成音を鳴らす
    const buf = chooseBuffer(name, variant);
    if (buf) {
      const src = g.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.03; // 鳴らすたびにわずかに音程をゆらす
      const amp = g.ctx.createGain();
      amp.gain.value = dbToGain(sampleTrimDb(name)) * (0.92 + Math.random() * 0.16);
      src.connect(amp);
      amp.connect(g.sfxBus);
      src.start(g.ctx.currentTime + 0.005);
      return;
    }
    // 音ごとの補正（VOICE_TRIM_DB）を掛けてから効果音バスへ
    const trim = g.ctx.createGain();
    trim.gain.value = dbToGain(VOICE_TRIM_DB[name]);
    trim.connect(g.sfxBus);
    VOICES[name](g.ctx, trim, g.ctx.currentTime + 0.005);
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
