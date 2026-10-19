// 音の配線。AudioContext と、効果音・BGM の 2 本のバス、共通の残響、全体のコンプレッサー＋リミッター。
//
//   効果音 → sfxBus ──────────────┬→ master ┐
//                      └→ 残響へ送る ┐       │
//   BGM → bgmFilter → bgmBus ──────┼→ master ┤→ comp（やさしくならす）→ limiter（割れ止め）→ destination
//                      └→ 残響へ送る ┘       │
//   残響（部屋の響き）→ reverbReturn ────────┘
//
// 残響を効果音と BGM で共有することで、すべての音が「ひとつの部屋」で鳴っているように聞こえて、
// 耳に刺さる感じが減り、まとまりが出る。
// AudioContext はページ読み込み時ではなく、最初のユーザー操作で作る（作れなければ何もしない）。

import { BGM_BUS_DB, dbToGain, SFX_BUS_DB } from './sound-plan';

export interface AudioGraph {
  ctx: AudioContext;
  sfxBus: GainNode;
  /** BGM の音量（設定・曲ごと）。 */
  bgmBus: GainNode;
  /** BGM のローパス（終盤で開く）。 */
  bgmFilter: BiquadFilterNode;
  master: GainNode;
  comp: DynamicsCompressorNode;
  limiter: DynamicsCompressorNode;
}

let graph: AudioGraph | null = null;
let unavailable = false;
const onCreate: ((g: AudioGraph) => void)[] = [];

/** グラフが作られたときに呼ぶ。 */
export function whenGraphCreated(fn: (g: AudioGraph) => void): void {
  onCreate.push(fn);
  if (graph) fn(graph);
}

/** 部屋の響きのインパルス応答を作る（ノイズを減衰させ、時間とともに高域を丸める）。
 *  長さ 1.7 秒・手前に 14ms の間（プリディレイ）。ステレオで左右を少しずらして広がりを出す。 */
export function makeImpulse(c: BaseAudioContext, seconds = 1.7, decay = 3.2): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  const pre = Math.floor(c.sampleRate * 0.014);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let seed = 777 + ch * 131;
    let prev = 0;
    for (let i = pre; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const n = (seed / 0x7fffffff) * 2 - 1;
      const t = (i - pre) / c.sampleRate;
      // 時間がたつほど高域が落ちる（ローパスの係数を小さくしていく）
      const k = Math.max(0.08, 0.7 - t * 0.5);
      prev += (n - prev) * k;
      d[i] = prev * Math.pow(1 - (i - pre) / (len - pre), decay);
    }
  }
  return buf;
}

function build(ctx: AudioContext): AudioGraph {
  const master = ctx.createGain();
  master.gain.value = 1;
  // 全体をやさしくならす: -20dB を超えたぶんを 2.5:1 でゆっくり抑える（音が重なっても飛び出さない）
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 12;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.008;
  comp.release.value = 0.22;
  // 割れ止め: -1.5dB の上はほぼ通さない
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.1;

  const sfxBus = ctx.createGain();
  sfxBus.gain.value = dbToGain(SFX_BUS_DB);
  const bgmFilter = ctx.createBiquadFilter();
  bgmFilter.type = 'lowpass';
  bgmFilter.frequency.value = 3200;
  bgmFilter.Q.value = 0.5;
  const bgmBus = ctx.createGain();
  bgmBus.gain.value = dbToGain(BGM_BUS_DB);

  // 共通の残響
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx);
  const sfxSend = ctx.createGain();
  sfxSend.gain.value = 0.26;
  const bgmSend = ctx.createGain();
  bgmSend.gain.value = 0.34;
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.8;

  sfxBus.connect(master);
  sfxBus.connect(sfxSend);
  sfxSend.connect(reverb);
  bgmFilter.connect(bgmBus);
  bgmBus.connect(master);
  bgmBus.connect(bgmSend);
  bgmSend.connect(reverb);
  reverb.connect(reverbReturn);
  reverbReturn.connect(master);
  master.connect(comp);
  comp.connect(limiter);
  limiter.connect(ctx.destination);
  return { ctx, sfxBus, bgmBus, bgmFilter, master, comp, limiter };
}

/** グラフを返す（無ければ作る）。止まっていたら再開を試みる。作れなければ null。 */
export function getGraph(): AudioGraph | null {
  if (unavailable) return null;
  if (graph) {
    if (graph.ctx.state === 'suspended') {
      graph.ctx.resume().catch(() => {
        // 再開できなくても致命的ではない
      });
    }
    return graph;
  }
  try {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) {
      unavailable = true;
      return null;
    }
    const g = build(new Ctor());
    graph = g;
    // ブラウザは最初の操作まで音を出させない。操作のたびに再開を試みる（動き出したら外す）。
    // スマホでは pointerdown が「操作」と数えられないことがあるので、離した・タップ・キーも拾う。
    const wakeEvents = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
    const wake = () => {
      if (g.ctx.state === 'running') {
        for (const ev of wakeEvents) window.removeEventListener(ev, wake, true);
        return;
      }
      g.ctx.resume().catch(() => {
        // 何もしない
      });
    };
    for (const ev of wakeEvents) window.addEventListener(ev, wake, true);
    for (const fn of onCreate) fn(g);
    if (import.meta.env.DEV) (window as unknown as { __cbAudio?: unknown }).__cbAudio = g;
    return g;
  } catch {
    unavailable = true;
    return null;
  }
}

/** 作られていればグラフを返す（作らない）。 */
export function peekGraph(): AudioGraph | null {
  return graph;
}
