// 効果音の録音（ElevenLabs で生成した候補。scripts/build-sfx.mjs で軽くして src/assets/sfx/<名前>-<番号>.wav へ）。
// 音ごとに複数の候補があり、サウンドテスト（?sounds）で選べる。選んだ番号は localStorage に保存する:
//   1〜 = その番号の録音、未選択 = 録音の候補をランダムに（同じ音が続いても単調にならない）。
// コードで合成した音は使わない。録音が無い音・まだ読み込めていない音は、鳴らさない。

/** 効果音の名前。録音のファイル名（src/assets/sfx/<名前>-<番号>.wav）と同じ。 */
export type VoiceName =
  | 'tap' | 'select' | 'summonSmall' | 'summonBig' | 'hitUnit' | 'hitBlocker' | 'hitPlayer' | 'death'
  | 'ready' | 'heal' | 'barrier' | 'horn' | 'win' | 'lose' | 'battleStart' | 'spellCast';

const urls = import.meta.glob('../assets/sfx/*.wav', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const buffers = new Map<VoiceName, Map<number, AudioBuffer>>();
const PICK_KEY = 'riale-cardbatlle:sfx-pick';

/** 録音の音量は scripts/build-sfx.mjs が目標の実効音量にそろえてあるので、ここでは補正しない。 */
export const sampleTrimDb = (_name: VoiceName): number => 0;

export function loadSamples(ctx: BaseAudioContext): void {
  for (const [path, url] of Object.entries(urls)) {
    const m = /\/(\w+)-(\d+)\.wav$/.exec(path);
    if (!m) continue;
    const name = m[1] as VoiceName;
    const n = Number(m[2]);
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((d) => ctx.decodeAudioData(d))
      .then((buf) => {
        let map = buffers.get(name);
        if (!map) buffers.set(name, (map = new Map()));
        map.set(n, buf);
      })
      .catch(() => {
        // 読めなければ合成音のまま
      });
  }
}

/** 読み込めている候補の番号（昇順）。 */
export function variantsOf(name: VoiceName): number[] {
  return [...(buffers.get(name)?.keys() ?? [])].sort((a, b) => a - b);
}

/** 録音の候補の番号（ファイルがあるもの。読み込み前でも数えられる）。 */
export function knownVariants(name: VoiceName): number[] {
  const out: number[] = [];
  for (const p of Object.keys(urls)) {
    const m = /\/(\w+)-(\d+)\.wav$/.exec(p);
    if (m && m[1] === name) out.push(Number(m[2]));
  }
  return out.sort((a, b) => a - b);
}

function readPicks(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(PICK_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

/** 選んだ候補（未選択は null）。 */
export function getPick(name: VoiceName): number | null {
  const v = readPicks()[name];
  return typeof v === 'number' ? v : null;
}

export function setPick(name: VoiceName, n: number | null): void {
  const p = readPicks();
  if (n === null) delete p[name];
  else p[name] = n;
  try {
    localStorage.setItem(PICK_KEY, JSON.stringify(p));
  } catch {
    // 保存できなくても、この場では聴ける
  }
}

const KIT_KEY = 'riale-cardbatlle:sfx-kit';

/** 効果音セット（1〜4）。音ごとの個別の選択が無いとき、全部の音をこの番号の録音でそろえる。 */
export function getKit(): number {
  try {
    const v = Number(localStorage.getItem(KIT_KEY));
    return v >= 1 && v <= 9 ? v : 1;
  } catch {
    return 1;
  }
}

export function setKit(n: number): void {
  try {
    localStorage.setItem(KIT_KEY, String(n));
  } catch {
    // 保存できなくても、この場では聴ける
  }
}

/** いま鳴らす録音。同じ操作は必ず同じ音（個別の選択 → セットの番号 → いちばん若い番号の順）。無ければ null。 */
export function chooseBuffer(name: VoiceName, forceVariant?: number): AudioBuffer | null {
  const map = buffers.get(name);
  if (!map || map.size === 0) return null;
  for (const n of [forceVariant, getPick(name), getKit()]) {
    if (n != null && map.has(n)) return map.get(n)!;
  }
  return map.get(Math.min(...map.keys()))!;
}
