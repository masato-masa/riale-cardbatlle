// CPU。候補（召喚・攻撃・待つ）にスコアを付けて最大を選ぶ。
// 人間らしく、一定の間隔をあけて考える。state は変更しない。

import { CARDS, isBlocker, type CardId } from '../game/cards';
import {
  attackBlock,
  firstEmptySlot,
  other,
  step,
  summonBlock,
  type Action,
  type GameState,
  type PlayerIndex,
  type Target,
  type Unit,
} from '../game/engine';
import { COIN_MAX, FIELD_SLOTS } from '../game/rules';

export type CpuLevel = 'easy' | 'normal' | 'hard';

export interface CpuBrain {
  /** この時刻（ms）まで考えない。 */
  nextThinkAt: number;
}

export function createBrain(): CpuBrain {
  return { nextThinkAt: 1200 };
}

interface Tuning {
  /** 考える間隔（ms）の下限と幅。 */
  thinkMin: number;
  thinkSpan: number;
  /** スコアに足す揺らぎの大きさ。 */
  noise: number;
  /** 1 回の思考で 2 つ目の操作もする確率。 */
  second: number;
  /** とどめを見逃す確率。 */
  missLethal: number;
  /** 完全にでたらめな候補を選ぶ確率。 */
  random: number;
  /** 「何もしない」のスコア（これより低い候補は選ばない）。 */
  idle: number;
  /** 顔への攻撃の重み。 */
  face: number;
  /** 損得を考える度合い（交換の評価倍率）。 */
  trade: number;
  /** 脅威に備えてブロッカーを出す度合い。 */
  defend: number;
}

const TUNING: Record<CpuLevel, Tuning> = {
  easy: { thinkMin: 1600, thinkSpan: 800, noise: 4.5, second: 0.1, missLethal: 0.35, random: 0.25, idle: 0.5, face: 0.6, trade: 0.4, defend: 0.3 },
  normal: { thinkMin: 900, thinkSpan: 600, noise: 1.6, second: 0.3, missLethal: 0.05, random: 0.04, idle: 0.8, face: 0.8, trade: 0.9, defend: 0.8 },
  hard: { thinkMin: 500, thinkSpan: 400, noise: 0.5, second: 0.5, missLethal: 0, random: 0, idle: 0.0, face: 1.0, trade: 1.2, defend: 1.2 },
};

/** カードの強さの目安（盤面に残る価値）。 */
function cardValue(card: CardId): number {
  const d = CARDS[card];
  return d.atk * 1.1 + d.hp * 0.7 + (isBlocker(card) ? 1.5 : 0);
}

function unitValue(u: Unit): number {
  const d = CARDS[u.card];
  return d.atk * 1.1 + u.hp * 0.7 + (isBlocker(u.card) ? 1.5 : 0);
}

interface Candidate {
  action: Action;
  score: number;
  /** 顔へのとどめか。 */
  lethal: boolean;
}

function summonCandidates(state: GameState, p: PlayerIndex, t: Tuning): Candidate[] {
  const me = state.players[p];
  const foe = state.players[other(p)];
  const slot = firstEmptySlot(me);
  if (slot < 0) return [];
  const foeAtk = foe.field.reduce((n, u) => n + (u ? CARDS[u.card].atk : 0), 0);
  const myBlockers = me.field.filter((u) => u && isBlocker(u.card)).length;
  const foeBlockers = foe.field.filter((u) => u && isBlocker(u.card)).length;
  const filled = me.field.filter(Boolean).length;
  // 守りの必要度: 相手の攻撃力の合計が自分の HP に対して大きいほど高い
  const danger = Math.min(2, foeAtk / Math.max(4, me.hp));
  const out: Candidate[] = [];
  me.hand.forEach((card, handIndex) => {
    if (summonBlock(state, p, handIndex, slot)) return;
    const d = CARDS[card];
    let s = cardValue(card) * 0.55 + d.summon * 0.15;
    // コインが余っているほど急いで出す、枠が空いているほど出す
    s += (me.coins - d.summon) * 0.05 + (FIELD_SLOTS - filled) * 0.25;
    if (me.coins >= COIN_MAX - 0.5) s += 1.5; // 上限で腐らせない
    if (isBlocker(card)) {
      s += myBlockers === 0 ? danger * 3 * t.defend : -1.0;
      if (foeBlockers === 0 && foeAtk === 0) s -= 0.5;
    }
    // 安いカードで高いカードの召喚を邪魔しない（もう少しで払えるなら貯める）
    const bigger = me.hand.some((c) => CARDS[c].summon > d.summon + 1 && CARDS[c].summon <= me.coins + 2.2 && CARDS[c].summon > me.coins);
    if (bigger && d.summon <= 2) s -= 1.2;
    out.push({ action: { type: 'summon', p, handIndex, slot }, score: s, lethal: false });
  });
  return out;
}

function attackCandidates(state: GameState, p: PlayerIndex, t: Tuning): Candidate[] {
  const me = state.players[p];
  const foe = state.players[other(p)];
  const out: Candidate[] = [];
  const targets: Target[] = [{ kind: 'player' }, ...foe.field.filter((u): u is Unit => !!u).map((u) => ({ kind: 'unit' as const, uid: u.uid }))];
  const foeAtkTotal = foe.field.reduce((n, u) => n + (u ? CARDS[u.card].atk : 0), 0);
  for (const unit of me.field) {
    if (!unit) continue;
    const d = CARDS[unit.card];
    for (const target of targets) {
      if (attackBlock(state, p, unit.uid, target)) continue;
      // コインの重み: アタックコストが高いほど割に合わない
      const costPenalty = d.attackCost * 0.35;
      if (target.kind === 'player') {
        const lethal = foe.hp <= d.atk;
        let s = d.atk * 0.9 * t.face - costPenalty + 0.6;
        // 相手の HP が減っているほど顔を狙う
        s += (1 - foe.hp / 20) * d.atk * 0.5;
        if (lethal) s += 100;
        out.push({ action: { type: 'attack', p, uid: unit.uid, target }, score: s, lethal });
      } else {
        const hit = foe.field.find((u) => u && u.uid === target.uid)!;
        const hd = CARDS[hit.card];
        const kills = d.atk >= hit.hp;
        const dies = hd.atk >= unit.hp;
        let s: number;
        if (kills && !dies) s = 2.5 + unitValue(hit) * 0.6 * t.trade + hd.atk * 0.3;
        else if (kills && dies) s = (unitValue(hit) - unitValue(unit) * 0.9) * 0.6 * t.trade - 0.3;
        else if (!kills && !dies) s = d.atk * 0.25 + hd.atk * 0.0 - 0.5; // 削るだけ
        else s = -4 * t.trade - unitValue(unit) * 0.3; // 倒せず死ぬ
        // 脅威（攻撃力が高い）を倒す価値
        if (kills) s += hd.atk * 0.25 * (foeAtkTotal > 6 ? 1.3 : 1);
        if (isBlocker(hit.card) && kills) s += 1.0; // 顔への道を開ける
        s -= costPenalty;
        out.push({ action: { type: 'attack', p, uid: unit.uid, target }, score: s, lethal: false });
      }
    }
  }
  return out;
}

function choose(state: GameState, p: PlayerIndex, t: Tuning, rand: () => number): Action | null {
  let cands = [...summonCandidates(state, p, t), ...attackCandidates(state, p, t)];
  if (cands.length === 0) return null;
  const lethal = cands.filter((c) => c.lethal);
  if (lethal.length > 0 && rand() >= t.missLethal) return lethal[0]!.action;
  if (lethal.length > 0) cands = cands.filter((c) => !c.lethal);
  if (cands.length === 0) return null;
  if (rand() < t.random) return cands[Math.floor(rand() * cands.length)]!.action;
  let best: Candidate | null = null;
  let bestScore = -Infinity;
  for (const c of cands) {
    const s = c.score + (rand() - 0.5) * 2 * t.noise;
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best && bestScore > t.idle ? best.action : null;
}

export function cpuStep(
  state: GameState,
  p: PlayerIndex,
  brain: CpuBrain,
  level: CpuLevel,
  rand: () => number,
): { brain: CpuBrain; actions: Action[] } {
  if (state.result || state.time < brain.nextThinkAt) return { brain, actions: [] };
  const t = TUNING[level];
  const actions: Action[] = [];
  const first = choose(state, p, t, rand);
  if (first) {
    actions.push(first);
    if (rand() < t.second) {
      // 1 つ目を実行した後の盤面で、もう 1 つ考える
      const second = choose(step(state, first), p, t, rand);
      if (second) actions.push(second);
    }
  }
  const wait = t.thinkMin + rand() * t.thinkSpan;
  return { brain: { ...brain, nextThinkAt: state.time + wait }, actions };
}
