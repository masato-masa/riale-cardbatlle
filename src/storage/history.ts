// 対戦の履歴（直近 50 試合）。戦績の画面で、難易度別・相手デッキ別の勝率と、よく出すカードを見せる。localStorage に入れる。

import type { CpuLevel } from '@/ai/cpu';
import { CARDS, type CardId } from '@/game/cards';

const KEY = 'riale-cardbatlle:history';
const KEEP = 50;

export interface MatchRecord {
  /** 'win' | 'lose' | 'draw' */
  result: 'win' | 'lose' | 'draw';
  level: CpuLevel;
  rival: string;
  /** 自分が出したカード（呪文を含む）と回数。 */
  played: Partial<Record<CardId, number>>;
  /** 試合の長さ（秒）。 */
  sec: number;
}

export function loadHistory(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as MatchRecord[]).filter((r) => r && typeof r.result === 'string') : [];
  } catch {
    return [];
  }
}

export function pushHistory(r: MatchRecord): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([r, ...loadHistory()].slice(0, KEEP)));
  } catch {
    // 保存できなくても遊べる
  }
}

/** 難易度のおすすめ: その難易度で直近 3 試合すべて負けなら一段下、すべて勝ちなら一段上を勧める（決めるのはプレイヤー）。 */
export function suggestLevel(list: MatchRecord[], level: CpuLevel): { to: CpuLevel; why: 'lose' | 'win' } | null {
  const order: CpuLevel[] = ['easy', 'normal', 'hard'];
  const recent = list.filter((r) => r.level === level).slice(0, 3);
  if (recent.length < 3) return null;
  const i = order.indexOf(level);
  if (recent.every((r) => r.result === 'lose') && i > 0) return { to: order[i - 1]!, why: 'lose' };
  if (recent.every((r) => r.result === 'win') && i < order.length - 1) return { to: order[i + 1]!, why: 'win' };
  return null;
}

export interface Rate {
  label: string;
  n: number;
  /** 勝率（引き分けは半分）。0〜100。 */
  pct: number;
}

function rateOf(label: string, rs: MatchRecord[]): Rate {
  const pts = rs.reduce((n, r) => n + (r.result === 'win' ? 1 : r.result === 'draw' ? 0.5 : 0), 0);
  return { label, n: rs.length, pct: rs.length ? Math.round((pts / rs.length) * 100) : 0 };
}

export interface Summary {
  total: Rate;
  byLevel: Rate[];
  /** 相手デッキ別（試合数の多い順）。 */
  byRival: Rate[];
  /** よく出すカード（多い順に 5 枚）。 */
  topCards: { card: CardId; count: number }[];
  avgSec: number;
}

const LEVEL_LABEL: Record<CpuLevel, string> = { easy: 'よわい', normal: 'ふつう', hard: 'つよい' };

export function summarize(list: MatchRecord[]): Summary {
  const byLevel = (['easy', 'normal', 'hard'] as CpuLevel[])
    .map((lv) => rateOf(LEVEL_LABEL[lv], list.filter((r) => r.level === lv)))
    .filter((r) => r.n > 0);
  const names = [...new Set(list.map((r) => r.rival))];
  const byRival = names.map((n) => rateOf(n, list.filter((r) => r.rival === n))).sort((a, b) => b.n - a.n);
  const counts = new Map<CardId, number>();
  // 削除したカード（待ち伏せなど）が記録に残っていても数えない
  for (const r of list) for (const [c, k] of Object.entries(r.played)) if (c in CARDS) counts.set(c as CardId, (counts.get(c as CardId) ?? 0) + (k ?? 0));
  const topCards = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([card, count]) => ({ card, count }));
  const avgSec = list.length ? Math.round(list.reduce((n, r) => n + r.sec, 0) / list.length) : 0;
  return { total: rateOf('全体', list), byLevel, byRival, topCards, avgSec };
}
