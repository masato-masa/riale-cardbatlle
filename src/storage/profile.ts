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

/** 初回の案内をもう一度出す。 */
export function resetTutorial(): void {
  try {
    localStorage.removeItem(TUTORIAL_KEY);
  } catch {
    // 消せなくても遊べる
  }
}
