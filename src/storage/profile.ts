// プレイヤーの戦績と、最後に選んだ難易度。localStorage に入れる（読めなければ初期値）。

import type { CpuLevel } from '@/ai/cpu';

const RECORD_KEY = 'riale-cardbatlle:record';
const LEVEL_KEY = 'riale-cardbatlle:level';

export interface Record {
  win: number;
  lose: number;
  draw: number;
  /** いまの連勝（負けで 0、引き分けは変えない）と、これまでの最高連勝。 */
  streak: number;
  best: number;
}

const EMPTY: Record = { win: 0, lose: 0, draw: 0, streak: 0, best: 0 };

export function loadRecord(): Record {
  try {
    const raw = localStorage.getItem(RECORD_KEY);
    if (raw) {
      const r = JSON.parse(raw) as Partial<Record>;
      const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
      return { win: n(r.win), lose: n(r.lose), draw: n(r.draw), streak: n(r.streak), best: n(r.best) };
    }
  } catch {
    // 読めなければ 0 勝 0 敗
  }
  return { ...EMPTY };
}

/** 決着を記録する。winner は 0=自分 / 1=相手 / null=引き分け。 */
export function addResult(winner: 0 | 1 | null): void {
  const r = loadRecord();
  if (winner === 0) {
    r.win += 1;
    r.streak += 1;
    r.best = Math.max(r.best, r.streak);
  } else if (winner === 1) {
    r.lose += 1;
    r.streak = 0;
  } else r.draw += 1;
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(r));
  } catch {
    // 保存できなくても遊べる
  }
}

const LEVELS: CpuLevel[] = ['easy', 'normal', 'hard'];

export function loadLevel(): CpuLevel {
  try {
    const v = localStorage.getItem(LEVEL_KEY);
    if (v && (LEVELS as string[]).includes(v)) return v as CpuLevel;
  } catch {
    // 読めなければふつう
  }
  return 'normal';
}

export function saveLevel(level: CpuLevel): void {
  try {
    localStorage.setItem(LEVEL_KEY, level);
  } catch {
    // 保存できなくても遊べる
  }
}

/** 記録を消しても残す設定（音・振動・名前・難易度・テスト用の切り替え）。 */
const KEEP_ON_RESET = new Set(['sound', 'bgm', 'haptics', 'sfx-kit', 'sfx-pick', 'speed', 'name', 'unlockall', 'level']);

/** テスト用: 記録（トロフィー・カード・宝箱・デッキ・戦績・ミッション・案内）を消して最初からにする。設定は残す。 */
export function resetProgress(): void {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('riale-cardbatlle:') && !KEEP_ON_RESET.has(k.slice('riale-cardbatlle:'.length))) localStorage.removeItem(k);
    }
  } catch {
    // 消せなければそのまま
  }
}

const NAME_KEY = 'riale-cardbatlle:name';
/** 名前の最大の長さ（盤面の帯に収まる長さ）。 */
export const NAME_MAX = 8;

/** 自分の名前（設定で変えられる。空なら「あなた」）。 */
export function loadName(): string {
  try {
    const v = (localStorage.getItem(NAME_KEY) ?? '').trim().slice(0, NAME_MAX);
    return v || 'あなた';
  } catch {
    return 'あなた';
  }
}

export function saveName(name: string): void {
  try {
    const v = name.trim().slice(0, NAME_MAX);
    if (v) localStorage.setItem(NAME_KEY, v);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    // 保存できなくても遊べる
  }
  // ホームなど、開いている画面に知らせる
  window.dispatchEvent(new Event('riale:name'));
}

const TUTORIAL_KEY = 'riale-cardbatlle:tutorial';

/** 初回の遊びかた案内を終えたか。 */
export function isTutorialDone(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return true;
  }
}

export function setTutorialDone(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    // 保存できなくても遊べる
  }
}

const TIPS_KEY = 'riale-cardbatlle:tips';

/** 場面ごとの一言案内（予約・割り込み・チェンジ）のうち、もう見たもの。 */
export function seenTips(): Set<string> {
  try {
    const raw = localStorage.getItem(TIPS_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function markTip(id: string): void {
  try {
    localStorage.setItem(TIPS_KEY, JSON.stringify([...seenTips(), id]));
  } catch {
    // 保存できなくても遊べる
  }
}

/** 初回の案内をもう一度出す（場面ごとの一言案内も）。 */
export function resetTutorial(): void {
  try {
    localStorage.removeItem(TIPS_KEY);
    localStorage.removeItem(TUTORIAL_KEY);
  } catch {
    // 消せなくても遊べる
  }
}
