// 音色の部品。効果音（sfx-voices.ts）と BGM（bgm.ts）が共通で使う、WebAudio だけの合成音。
// OfflineAudioContext でも同じものを鳴らせるよう BaseAudioContext を受け取る（音の検査用）。
//
// 心地よさの方針:
//  - 立ち上がりはゆるく（最短でも 3ms）、角の立つ矩形波は使わない。鋭い音は低域を丸めたノイズで作る
//  - 高域（6kHz 以上）は控えめに。ローパスで頭を丸める
//  - 音程はすべてハ長調／イ短調のペンタトニックから選ぶ（重なっても濁らない）
//  - 余韻は出口の残響（audio-graph.ts）にまかせ、各音は短く切る

export type Ctx = BaseAudioContext;

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** ハ長調ペンタトニック（C D E G A）。音階の度数からオクターブ込みの MIDI 番号を出す。 */
export const PENTA = [0, 2, 4, 7, 9];
export function penta(degree: number, base = 60): number {
  const oct = Math.floor(degree / 5);
  return base + oct * 12 + PENTA[((degree % 5) + 5) % 5]!;
}

const noiseCache = new WeakMap<Ctx, AudioBuffer>();

function noiseBuf(c: Ctx): AudioBuffer {
  let buf = noiseCache.get(c);
  if (!buf) {
    buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.6), c.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 20240607;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    noiseCache.set(c, buf);
  }
  return buf;
}

/** 音量の包絡線: 立ち上がり attack 秒、そこから長さ total 秒かけて減衰。 */
function env(g: AudioParam, t: number, peak: number, attack: number, total: number): void {
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.exponentialRampToValueAtTime(0.0001, t + total);
}

// ---------------------------------------------------------------------------
// 旋律・効果の音

export interface PluckOpts {
  midi: number;
  gain?: number;
  /** 余韻の長さ（秒） */
  dur?: number;
  /** 倍音の量（0〜1）。大きいほど明るい */
  bright?: number;
}

/** 木琴・カリンバのような、丸くて短い撥弦。UI・アルペジオ・旋律に使う。 */
export function pluck(c: Ctx, dest: AudioNode, t: number, o: PluckOpts): void {
  const { midi, gain = 0.2, dur = 0.35, bright = 0.5 } = o;
  const f = midiToHz(midi);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(5200, f * 6);
  lp.Q.value = 0.4;
  lp.connect(dest);
  const parts: [number, number, number][] = [
    [1, 1, 1],
    [2, 0.32 * bright + 0.05, 0.5],
    [3, 0.12 * bright, 0.28],
  ];
  for (const [ratio, amp, life] of parts) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f * ratio;
    const g = c.createGain();
    env(g.gain, t, gain * amp, 0.003, 0.003 + dur * life);
    osc.connect(g);
    g.connect(lp);
    osc.start(t);
    osc.stop(t + dur * life + 0.05);
  }
}

export interface BellOpts {
  midi: number;
  gain?: number;
  dur?: number;
}

/** 小さな鐘（グロッケン）。きらめき・完了の合図。倍音は少しだけ非整数にして金属の質感を出す。 */
export function bell(c: Ctx, dest: AudioNode, t: number, o: BellOpts): void {
  const { midi, gain = 0.16, dur = 1.1 } = o;
  const f = midiToHz(midi);
  const parts: [number, number, number][] = [
    [1, 1, 1],
    [2.0, 0.42, 0.62],
    [2.76, 0.2, 0.42],
    [5.4, 0.07, 0.22],
  ];
  for (const [ratio, amp, life] of parts) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f * ratio;
    const g = c.createGain();
    env(g.gain, t, gain * amp, 0.004, 0.004 + dur * life);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur * life + 0.05);
  }
}

export interface ThumpOpts {
  f0: number;
  f1: number;
  dur: number;
  gain: number;
}

/** 低いドン（重さ）。ピッチが一気に下がる丸いサイン。 */
export function thump(c: Ctx, dest: AudioNode, t: number, o: ThumpOpts): void {
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(o.f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 20), t + o.dur * 0.8);
  const g = c.createGain();
  env(g.gain, t, o.gain, 0.004, o.dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

export interface SwishOpts {
  dur: number;
  f0: number;
  f1: number;
  gain: number;
  q?: number;
}

/** 風を切る音（やわらかいシュッ）。バンドパスの中心を動かしたノイズ。 */
export function swish(c: Ctx, dest: AudioNode, t: number, o: SwishOpts): void {
  const src = c.createBufferSource();
  src.buffer = noiseBuf(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = o.q ?? 1.1;
  bp.frequency.setValueAtTime(o.f0, t);
  bp.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 60), t + o.dur);
  const g = c.createGain();
  // ふくらんでから消える（山形）
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(o.gain, 0.0002), t + o.dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  src.start(t, 0.05);
  src.stop(t + o.dur + 0.05);
}

export interface TickOpts {
  freq?: number;
  gain: number;
  dur?: number;
  q?: number;
}

/** ごく短いノイズの粒（コツッ・カチッ）。帯域を絞って耳に痛くしない。 */
export function tick(c: Ctx, dest: AudioNode, t: number, o: TickOpts): void {
  const src = c.createBufferSource();
  src.buffer = noiseBuf(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = o.freq ?? 2200;
  bp.Q.value = o.q ?? 0.9;
  const g = c.createGain();
  const dur = o.dur ?? 0.035;
  env(g.gain, t, o.gain, 0.002, dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  src.start(t, 0.1 + ((o.freq ?? 0) % 7) * 0.01);
  src.stop(t + dur + 0.03);
}

export interface PadOpts {
  midis: number[];
  dur: number;
  gain: number;
  attack?: number;
  release?: number;
  cutoff?: number;
  type?: OscillatorType;
}

/** 厚みのある持続音（弦・ブラスの代わり）。2 本をわずかにずらして重ね、ローパスで丸める。 */
export function pad(c: Ctx, dest: AudioNode, t: number, o: PadOpts): void {
  const attack = o.attack ?? 0.35;
  const release = o.release ?? 0.45;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = o.cutoff ?? 1100;
  lp.Q.value = 0.5;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.gain, t + attack);
  g.gain.setValueAtTime(o.gain, t + Math.max(attack, o.dur - release));
  g.gain.linearRampToValueAtTime(0.0001, t + o.dur);
  lp.connect(g);
  g.connect(dest);
  const per = o.gain / Math.max(1, o.midis.length);
  for (const m of o.midis) {
    for (const cents of [-7, 7]) {
      const osc = c.createOscillator();
      osc.type = o.type ?? 'sawtooth';
      osc.frequency.value = midiToHz(m);
      osc.detune.value = cents;
      const v = c.createGain();
      v.gain.value = per * 0.5;
      osc.connect(v);
      v.connect(lp);
      osc.start(t);
      osc.stop(t + o.dur + 0.05);
    }
  }
}

export interface BassOpts {
  midi: number;
  dur: number;
  gain: number;
}

/** 丸いベース。サインに少しだけのこぎり波を足し、ローパスで低域に寄せる。 */
export function bass(c: Ctx, dest: AudioNode, t: number, o: BassOpts): void {
  const f = midiToHz(o.midi);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 760;
  lp.Q.value = 0.6;
  const g = c.createGain();
  env(g.gain, t, o.gain, 0.012, o.dur);
  lp.connect(g);
  g.connect(dest);
  const a = c.createOscillator();
  a.type = 'sine';
  a.frequency.value = f;
  const b = c.createOscillator();
  b.type = 'sawtooth';
  b.frequency.value = f;
  const bg = c.createGain();
  bg.gain.value = 0.38;
  a.connect(lp);
  b.connect(bg);
  bg.connect(lp);
  a.start(t);
  b.start(t);
  a.stop(t + o.dur + 0.05);
  b.stop(t + o.dur + 0.05);
}

// ---------------------------------------------------------------------------
// リズム（BGM）

/** やわらかいキック。 */
export function kick(c: Ctx, dest: AudioNode, t: number, gain: number): void {
  thump(c, dest, t, { f0: 130, f1: 44, dur: 0.22, gain });
  tick(c, dest, t, { freq: 1800, gain: gain * 0.12, dur: 0.012, q: 0.7 });
}

/** やわらかいクラップ（2・4 拍）。ノイズを 2 度叩いて丸める。 */
export function clap(c: Ctx, dest: AudioNode, t: number, gain: number): void {
  tick(c, dest, t, { freq: 1500, gain, dur: 0.09, q: 0.6 });
  tick(c, dest, t + 0.012, { freq: 1900, gain: gain * 0.7, dur: 0.07, q: 0.6 });
}

/** 小さなハット（裏拍）。 */
export function hat(c: Ctx, dest: AudioNode, t: number, gain: number): void {
  tick(c, dest, t, { freq: 6500, gain, dur: 0.03, q: 1.2 });
}
