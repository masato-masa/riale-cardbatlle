// CPU。候補（召喚・攻撃・待つ）にスコアを付けて最大を選ぶ。
// 人間らしく、一定の間隔をあけて考える。state は変更しない。

import { CARDS, isBlocker, needsTarget, type CardId } from '../game/cards';
import {
  attackBlock,
  attackOf,
  firstEmptySlot,
  isWalled,
  other,
  step,
  summonBlock,
  units,
  type Action,
  type GameState,
  type PlayerIndex,
  type PlayerState,
  type Target,
  type Unit,
} from '../game/engine';
import { COIN_MAX, FIELD_SLOTS, MATCH_MS, PLAYER_HP } from '../game/rules';

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
  /** 脅威に備えてブロッカー・壁を作る度合い。 */
  defend: number;
  /** 能力（狙撃・足止・増収・薙払など）を使いこなす度合い。 */
  skill: number;
  /** 高いカードのために、安い操作を我慢する度合い。 */
  save: number;
}

const TUNING: Record<CpuLevel, Tuning> = {
  easy: { thinkMin: 1600, thinkSpan: 800, noise: 5.5, second: 0.1, missLethal: 0.35, random: 0.25, idle: 0.5, face: 0.6, trade: 0.4, defend: 0.3, skill: 0.6, save: 0 },
  normal: { thinkMin: 900, thinkSpan: 600, noise: 2.0, second: 0.3, missLethal: 0.05, random: 0.04, idle: 0.8, face: 0.8, trade: 0.9, defend: 0.8, skill: 0.8, save: 0.5 },
  hard: { thinkMin: 250, thinkSpan: 150, noise: 1.0, second: 0.7, missLethal: 0, random: 0, idle: 0.0, face: 1.0, trade: 1.0, defend: 1.2, skill: 0.2, save: 1.0 },
};

/** カードの価値を測る基準のクールタイム（ms）。ユニットの平均あたり。 */
const REF_COOLDOWN_MS = 16_000;

/** 受けるダメージの実際の値（結界は 0、鉄壁で減る）。 */
function effective(u: Unit, amount: number): number {
  if (amount <= 0 || u.barrier) return 0;
  return Math.max(0, amount - (CARDS[u.card].ab.armor ?? 0));
}

/** カードの強さの目安（盤面に残る価値）。allies はそのカードを除いた味方の数（鼓舞の価値に使う）。 */
function worth(card: CardId, hp: number, atk: number, allies: number, barrier: boolean): number {
  const ab = CARDS[card].ab;
  // 攻撃力はクールタイムが短いほど価値が高い（ダメージ毎秒）。基準は 16 秒
  const cd = CARDS[card].cd;
  const rate = cd > 0 ? Math.min(1.6, Math.max(0.6, REF_COOLDOWN_MS / cd)) : 1;
  let v = atk * 1.1 * rate + hp * 0.7 + (isBlocker(card) ? 1.5 : 0);
  if (barrier) v += 1.0;
  if (ab.armor) v += ab.armor * 0.8;
  if (ab.ranged) v += 0.9;
  if (ab.splash) v += 0.6;
  // ステルス: 選ばれず壁にも数えない。奇襲と組むと顔へ安全に通る
  if (ab.stealth) v += 1.0 + (ab.faceBonus ?? 0) * 0.5;
  if (ab.unitBonus) v += ab.unitBonus * 0.35;
  if (ab.rally) v += ab.rally * (0.5 + allies * 0.5);
  if (ab.coinBoost) v += ab.coinBoost * 5;
  if (ab.onDeath) v += ab.onDeath.amount * 0.3;
  // 建築物の能力（壊せば止まる）
  if (ab.pulse?.kind === 'token') v += 1.2;
  if (ab.pulse?.kind === 'snipe') v += 1.6;
  if (ab.cooldownCut) v += ab.cooldownCut * 5;
  return v;
}

function unitWorth(owner: PlayerState, u: Unit): number {
  const allies = units(owner).length - 1;
  return worth(u.card, u.hp, attackOf(owner, u), allies, u.barrier);
}

function cardWorth(card: CardId, allies: number): number {
  const d = CARDS[card];
  return worth(card, d.hp, d.atk, allies, !!d.ab.barrier);
}

/** 倒すと遺言で受けるダメージ（その分だけ損）。 */
function deathCost(u: Unit): number {
  const od = CARDS[u.card].ab.onDeath;
  return od ? od.amount * 0.45 : 0;
}

/** 手札に高いカード（コスト 5 以上）があって、あと少しで払えるとき、ほかの操作に使うコインへの罰。 */
function savePenalty(me: PlayerState, cost: number, self: CardId | null, t: Tuning): number {
  if (t.save <= 0) return 0;
  let big = 0;
  for (const c of me.hand) {
    const sc = CARDS[c].summon;
    if (c === self || sc < 5 || sc <= me.coins || sc > me.coins + 3) continue;
    big = Math.max(big, sc);
  }
  if (big === 0 || me.coins - cost >= big) return 0;
  return Math.min(1.6, cost * 0.5) * t.save;
}

interface Candidate {
  action: Action;
  score: number;
  /** 顔へのとどめか。 */
  lethal: boolean;
}

/** 場の圧力: 相手の攻撃力の合計が自分の HP に対してどれだけ大きいか（0〜2）。 */
function pressure(me: PlayerState, foe: PlayerState): number {
  const foeAtk = units(foe).reduce((n, u) => n + attackOf(foe, u) + (CARDS[u.card].ab.faceBonus ?? 0), 0);
  return Math.min(2, foeAtk / Math.max(4, me.hp));
}

/** 狙撃で相手のカード u に与える損得。 */
function strikeValue(foe: PlayerState, u: Unit, amount: number, t: Tuning): number {
  const eff = effective(u, amount);
  if (u.barrier) return 0.9 * t.skill; // 結界を剥がす
  if (eff >= u.hp) return (1.6 + unitWorth(foe, u) * 0.7 * t.trade - deathCost(u)) * (0.4 + 0.6 * t.skill);
  // 倒せないときは、攻撃力の高い相手を削る
  return (eff * 0.45 + attackOf(foe, u) * 0.12) * t.skill;
}

/** 足止で相手のカード u を止める損得。攻撃待ちが明けそうな強いカードほど高い。 */
function stunValue(state: GameState, foe: PlayerState, u: Unit, ms: number, t: Tuning): number {
  const wait = Math.max(0, u.readyAt - state.time);
  // すでに長く待つカードを止めても意味が薄い
  const soon = wait < 1000 ? 1 : wait < 2000 ? 0.6 : 0.3;
  const threat = attackOf(foe, u) + (CARDS[u.card].ab.faceBonus ?? 0) * 0.5 + (CARDS[u.card].ab.unitBonus ?? 0) * 0.2;
  return (threat * 0.55 * soon * (ms / 3000) + (isBlocker(u.card) ? 0.2 : 0)) * t.skill;
}

/** 試合の残りの割合（0〜1）。建築物は残りが長いほど元が取れる。 */
function remaining(state: GameState): number {
  return Math.max(0, 1 - state.time / MATCH_MS);
}

/** 建築物を出す価値（能力ぶん。増収は早めに、生産・砲撃は残り時間と的の数、鼓舞・祈りは味方の数）。 */
function buildingValue(state: GameState, me: PlayerState, foe: PlayerState, card: CardId, t: Tuning): number {
  const ab = CARDS[card].ab;
  const left = remaining(state);
  const mine = units(me).filter((u) => CARDS[u.card].type === 'unit');
  let v = 0;
  // 建築物は攻撃しない。ユニットで盤面を作るほうを少し優先する
  v -= 0.6;
  if (ab.rally) v += ab.rally * (0.7 + mine.length * 0.9) * t.skill;
  if (ab.cooldownCut) v += ab.cooldownCut * 8 * Math.min(mine.length, 4) * (0.4 + left) * 0.6 * t.skill;
  if (ab.pulse?.kind === 'token') {
    const free = FIELD_SLOTS - units(me).length - 1;
    if (free > 0) v += Math.min(3, (left * (MATCH_MS / ab.pulse.everyMs)) * 0.25) * t.skill;
  }
  if (ab.pulse?.kind === 'snipe') {
    const shots = Math.min(5, (MATCH_MS * left) / ab.pulse.everyMs);
    v += Math.min(3.2, shots * ab.pulse.amount * 0.5 + (units(foe).length > 0 ? 0.6 : 0)) * t.skill;
  }
  return v;
}

/** 呪文の候補。単体は相手のカードごとに 1 つ、ほかは 1 つ。 */
function spellCandidates(state: GameState, p: PlayerIndex, handIndex: number, card: CardId, t: Tuning): Candidate[] {
  const me = state.players[p];
  const foe = state.players[other(p)];
  const sp = CARDS[card].ab.spell!;
  const cost = CARDS[card].summon;
  // ステルス中の相手は選べない（全体に当たるものだけ当たる）
  const foeAll = units(foe);
  const foeUnits = foeAll.filter((u) => !u.stealth);
  if (summonBlock(state, p, handIndex, -1, sp.kind === 'bolt' ? (foeUnits[0]?.uid ?? -1) : undefined)) return [];
  const foeFighters = foeAll.filter((u) => CARDS[u.card].type === 'unit');
  // 使うコインのぶんの基本の損（安いほど気軽に使う）。コインが余っているときは緩める。
  let base = -cost * 0.25 - savePenalty(me, cost, card, t);
  if (me.coins >= COIN_MAX - 0.5) base += 1.2;
  const out: Candidate[] = [];
  if (sp.kind === 'bolt') {
    for (const u of foeUnits) {
      const eff = effective(u, sp.amount);
      const w = unitWorth(foe, u);
      let v: number;
      if (u.barrier) v = 0.9 * t.skill; // 結界を剥がすだけでは弱い
      else if (eff >= u.hp) v = (1.4 + w * 0.8 * t.trade - deathCost(u)) * (0.4 + 0.6 * t.skill); // とどめ・大物
      else v = (eff * 0.3 + attackOf(foe, u) * 0.1) * t.skill; // 倒せないなら削るだけ。もったいない
      if (eff >= u.hp && w >= 6) v += 1.0; // 大物
      if (eff >= u.hp && isBlocker(u.card) && isWalled(foe)) v += 0.8;
      out.push({ action: { type: 'summon', p, handIndex, slot: -1, target: u.uid }, score: base + v, lethal: false });
    }
    return out;
  }
  let v = 0;
  if (sp.kind === 'blast') {
    let kills = 0;
    let total = 0;
    for (const u of foeAll) {
      const eff = effective(u, sp.amount);
      if (eff >= u.hp) {
        kills++;
        v += 1.0 + unitWorth(foe, u) * 0.6 * t.trade - deathCost(u);
      } else v += eff * 0.25;
      total += Math.min(eff, u.hp);
      if (u.barrier) v += 0.2;
    }
    // 相手が 2 枚以上倒れるか、大きく削れるときだけ
    if (kills < 2 && total < 6) v -= 3;
    v *= 0.4 + 0.6 * t.skill;
  } else if (sp.kind === 'freeze') {
    // 攻撃が明けそうなユニットが多いほど効く
    let soon = 0;
    for (const u of foeFighters) {
      const wait = Math.max(0, u.readyAt - state.time);
      if (wait < 1500) soon++;
      const threat = attackOf(foe, u) + (CARDS[u.card].ab.faceBonus ?? 0) * 0.5;
      v += threat * 0.7 * (wait < 1500 ? 1 : 0.3) * (sp.ms / 4000);
    }
    if (foeFighters.length < 2 || soon < 2) v -= 2.5;
    v *= t.skill;
  } else {
    // 再動: 味方のユニットがクールタイム中のとき
    let waiting = 0;
    for (const u of units(me)) {
      if (CARDS[u.card].type !== 'unit') continue;
      const wait = u.readyAt - state.time;
      if (wait <= 1000) continue;
      waiting++;
      v += Math.min(wait, 5000) / 1000 * 0.25 + attackOf(me, u) * 0.35;
    }
    if (waiting < 2) v -= 3;
    v *= t.skill;
  }
  out.push({ action: { type: 'summon', p, handIndex, slot: -1 }, score: base + v, lethal: false });
  return out;
}

function summonCandidates(state: GameState, p: PlayerIndex, t: Tuning): Candidate[] {
  const me = state.players[p];
  const foe = state.players[other(p)];
  const slot = firstEmptySlot(me);
  const foeUnits = units(foe).filter((u) => !u.stealth);
  const press = pressure(me, foe);
  const myBlockers = me.field.filter((u) => u && isBlocker(u.card)).length;
  const foeBlockers = foeUnits.filter((u) => isBlocker(u.card)).length;
  const filled = units(me).length;
  const foeAtk = foeUnits.reduce((n, u) => n + attackOf(foe, u), 0);
  const early = Math.max(0, 1 - state.time / (MATCH_MS * 0.7));
  const out: Candidate[] = [];
  me.hand.forEach((card, handIndex) => {
    const d = CARDS[card];
    const ab = d.ab;
    if (d.type === 'spell') {
      out.push(...spellCandidates(state, p, handIndex, card, t));
      return;
    }
    if (slot < 0 || summonBlock(state, p, handIndex, slot)) return;
    let s = cardWorth(card, filled) * 0.55 + d.summon * 0.15;
    // コインが余っているほど急いで出す、枠が空いているほど出す
    s += (me.coins - d.summon) * 0.05 + (FIELD_SLOTS - filled) * 0.25;
    if (me.coins >= COIN_MAX - 0.5) s += 1.5; // 上限で腐らせない
    if (isBlocker(card)) {
      s += myBlockers === 0 ? press * 3 * t.defend : -1.0;
      if (foeBlockers === 0 && foeAtk === 0) s -= 0.5;
    }
    // 安いカードで高いカードの召喚を邪魔しない（もう少しで払えるなら貯める）
    const bigger = me.hand.some((c) => CARDS[c].summon > d.summon + 1 && CARDS[c].summon <= me.coins + 2.2 && CARDS[c].summon > me.coins);
    if (bigger && d.summon <= 2) s -= 1.2;
    s -= savePenalty(me, d.summon, card, t);

    // 増収: 早く出すほど元が取れる
    if (ab.coinBoost) s += ab.coinBoost * 14 * early * t.skill;
    // 速攻: 出してすぐ殴れる
    if (ab.haste) s += 0.5 * t.skill;
    // 仲間: 空き枠が残っていれば見習いが付いてくる
    if (ab.onSummon?.kind === 'token' && filled + 1 < FIELD_SLOTS) s += 1.3 * t.skill;
    // 修復: 減っているぶんだけ価値がある
    if (ab.onSummon?.kind === 'heal') s += Math.min(PLAYER_HP - me.hp, ab.onSummon.amount) * 0.4 * t.skill - 0.3;
    // 壁: 場の 5 枚目で押されているなら価値が高い（ただの 5 枚目でも少し）
    if (!isWalled(me) && filled === FIELD_SLOTS - 1) s += (press * 2.4 + (me.hp < foe.hp ? 0.6 : 0.2)) * t.defend;
    // 薙払: 相手の場が厚いほど出したい
    if (ab.splash) s += Math.min(foeUnits.length, 4) * 0.12 * t.skill;
    // ステルス: 相手が選べないので、後から顔を狙う機会が残る（相手のカードが多いほど守りが固く、価値が高い）
    if (ab.stealth) s += (0.5 + Math.min(foeUnits.length, 4) * 0.1) * t.skill;
    if (d.type === 'building') s += buildingValue(state, me, foe, card, t);

    const os = ab.onSummon;
    if (needsTarget(card) && (os?.kind === 'strike' || os?.kind === 'stun')) {
      if (foeUnits.length === 0) {
        // 的が無い。出しても能力が空振りするので、的が来るまで少し待つ
        out.push({ action: { type: 'summon', p, handIndex, slot }, score: s - 1.2 * t.skill, lethal: false });
        return;
      }
      for (const u of foeUnits) {
        const v = os.kind === 'strike' ? strikeValue(foe, u, os.amount, t) : stunValue(state, foe, u, os.ms, t);
        out.push({ action: { type: 'summon', p, handIndex, slot, target: u.uid }, score: s + v, lethal: false });
      }
      return;
    }
    out.push({ action: { type: 'summon', p, handIndex, slot }, score: s, lethal: false });
  });
  return out;
}

function attackCandidates(state: GameState, p: PlayerIndex, t: Tuning): Candidate[] {
  const me = state.players[p];
  const foe = state.players[other(p)];
  const out: Candidate[] = [];
  const foeAllUnits = units(foe);
  const foeUnits = foeAllUnits.filter((u) => !u.stealth);
  const targets: Target[] = [{ kind: 'player' }, ...foeUnits.map((u) => ({ kind: 'unit' as const, uid: u.uid }))];
  const foeAtkTotal = foeAllUnits.reduce((n, u) => n + attackOf(foe, u), 0);
  const press = pressure(me, foe);
  const myWall = isWalled(me);
  const foeWall = isWalled(foe);
  for (const unit of me.field) {
    if (!unit) continue;
    const d = CARDS[unit.card];
    const ab = d.ab;
    const myAtk = attackOf(me, unit);
    for (const target of targets) {
      // 建築物・クールタイム中・狙えない相手は候補にしない
      if (attackBlock(state, p, unit.uid, target)) continue;
      if (target.kind === 'player') {
        const dmg = myAtk + (ab.faceBonus ?? 0);
        const lethal = foe.hp <= dmg;
        let s = dmg * 0.9 * t.face + 0.6;
        // ステルス中は反撃されず選ばれないまま顔を削れる。ただし攻撃すると解ける（顔へ通すなら惜しくない）
        if (unit.stealth) s += 0.4;
        // 相手の HP が減っているほど顔を狙う
        s += (1 - foe.hp / PLAYER_HP) * dmg * 0.5;
        if (lethal) s += 100;
        out.push({ action: { type: 'attack', p, uid: unit.uid, target }, score: s, lethal });
      } else {
        const hit = foeUnits.find((u) => u.uid === target.uid)!;
        const dmg = myAtk + (ab.unitBonus ?? 0);
        const dealt = effective(hit, dmg);
        const back = ab.ranged ? 0 : effective(unit, attackOf(foe, hit));
        const kills = dealt >= hit.hp;
        const dies = back >= unit.hp;
        let s: number;
        const hitWorth = unitWorth(foe, hit);
        const myWorth = unitWorth(me, unit);
        if (kills && !dies) s = 2.5 + hitWorth * 0.6 * t.trade + attackOf(foe, hit) * 0.3;
        else if (kills && dies) s = (hitWorth - myWorth * 0.9) * 0.6 * t.trade - 0.3;
        else if (!kills && !dies) {
          if (ab.ranged) s = dealt * 0.5 - 0.1; // 反撃を受けないので、削るだけでも得
          else s = dealt * 0.3 - 0.4; // 削るだけ
          if (hit.barrier) s += 0.7; // 結界を剥がす
        } else s = -4 * t.trade - myWorth * 0.3; // 倒せず死ぬ
        // 脅威（攻撃力が高い）を倒す価値
        if (kills) s += attackOf(foe, hit) * 0.25 * (foeAtkTotal > 6 ? 1.3 : 1);
        if (kills) s -= deathCost(hit);
        if (kills && isBlocker(hit.card)) s += 1.0; // 顔への道を開ける
        if (kills && foeWall) s += 1.2; // 壁を崩して顔を通す
        if (dies) {
          if (ab.onDeath) s += ab.onDeath.amount * 0.3; // 遺言で一矢報いる
          if (myWall) s -= 1.0 * press * t.defend + 0.5; // 壁が崩れる
        }
        // ステルスは自分で攻撃すると解ける。カード相手に使うのはもったいない
        if (unit.stealth) s -= 1.0;
        // 攻撃時: ほかの敵カードへの小ダメージの損得
        if (ab.splash) {
          for (const o of foeAllUnits) {
            if (o.uid === hit.uid) continue;
            const od = effective(o, ab.splash);
            if (od >= o.hp) s += (1.2 + unitWorth(foe, o) * 0.5 * t.trade - deathCost(o)) * (0.4 + 0.6 * t.skill);
            else s += od * 0.25 * t.skill;
            if (o.barrier) s += 0.4 * t.skill;
          }
        }
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
