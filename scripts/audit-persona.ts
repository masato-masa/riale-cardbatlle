// CPU の性格（RC-9）ごとの手ごたえを、プレイヤーが実際に当たる組み合わせで測る。
// 使い方: npx tsx scripts/audit-persona.ts [1 デッキあたりの試合数=40] [level=normal] [force=rush|guard|hoard|whim|plain] [--lows]
//   プレイヤー側 = 初期デッキ（normal の CPU で人の代わり、性格なし）。相手 = そのアリーナの相手デッキ（pool）を level の CPU で。
//   各アリーナで「性格なし（plain）」と「割り当てた性格」を同じシードで比べる。force= を付けると全アリーナでその性格を試す。
import { createBrain, cpuStep, LEANS, type CpuLevel, type CpuPersona } from '../src/ai/cpu';
import { CARDS, isBlocker, RIVAL_DECKS, STARTER_DECK, type CardId } from '../src/game/cards';
import { createGame, step, type Action, type PlayerIndex } from '../src/game/engine';
import { makeRng } from '../src/game/rng';
import { ARENAS } from '../src/storage/trophy';

const args = process.argv.slice(2);
const N = Number(args.find((x) => /^\d+$/.test(x)) ?? 40);
const level = (args.find((x) => x.startsWith('level='))?.slice(6) ?? 'normal') as CpuLevel;
const verbose = args.includes('--lows');
const only = args.find((x) => x.startsWith('arena='))?.slice(6).split(',').map(Number);
// 重みの試し: lean.rush='{"mul":{"face":1.5},"add":{"tempo":1}}' のように上書きできる
for (const x of args.filter((y) => y.startsWith('lean.'))) {
  const [k, v] = [x.slice(5, x.indexOf('=')), x.slice(x.indexOf('=') + 1)];
  (LEANS as Record<string, unknown>)[k] = JSON.parse(v);
}
const force = args.find((x) => x.startsWith('force='))?.slice(6) as CpuPersona | undefined;

interface Tally {
  games: number;
  foeScore: number;
  ms: number;
  timeouts: number;
  /** 相手の召喚（カードごと・デッキごと）。 */
  plays: Map<string, Map<CardId, number>>;
  costSum: number;
  playN: number;
  firstPlayMs: number;
  faceHits: number;
  coinSum: number;
  coinN: number;
  blockers: number;
  /** 相手が割り込んだ回数・プレイヤーの顔に与えたダメージ。 */
  interrupts: number;
  faceDmg: number;
  attacks: number;
}

function run(pool: string[], persona: CpuPersona): Tally {
  const t: Tally = { games: 0, foeScore: 0, ms: 0, timeouts: 0, plays: new Map(), costSum: 0, playN: 0, firstPlayMs: 0, faceHits: 0, coinSum: 0, coinN: 0, blockers: 0, interrupts: 0, faceDmg: 0, attacks: 0 };
  for (const { name, deck } of RIVAL_DECKS.filter((d) => pool.includes(d.name))) {
    const used = t.plays.get(name) ?? new Map<CardId, number>();
    t.plays.set(name, used);
    for (let g = 0; g < N; g++) {
      const foe: PlayerIndex = g % 2 === 0 ? 1 : 0;
      const decks = foe === 1 ? [STARTER_DECK, deck] : [deck, STARTER_DECK];
      const seed = g * 31 + 7;
      let st = createGame(decks as [CardId[], CardId[]], seed);
      const br = [createBrain(), createBrain()];
      br[foe] = createBrain(persona, seed);
      const lv: CpuLevel[] = [];
      lv[foe] = level;
      lv[1 - foe] = 'normal';
      const rd = [makeRng(seed * 2 + 1), makeRng(seed * 2 + 2)];
      let first = -1;
      let tick = 0;
      let seen = 0;
      while (!st.result) {
        for (const e of st.events) {
          if (e.id <= seen) continue;
          seen = e.id;
          if (e.kind === 'cancel' && e.reason === 'blocked' && e.pending.p !== foe) t.interrupts++;
          if (e.kind === 'damage' && e.p !== foe && e.target.kind === 'player') t.faceDmg += e.amount;
        }
        st = step(st, { type: 'tick', dt: 50 });
        if (++tick % 20 === 0) {
          t.coinSum += st.players[foe].coins;
          t.coinN++;
        }
        for (const p of [0, 1] as PlayerIndex[]) {
          if (st.result) break;
          const r = cpuStep(st, p, br[p]!, lv[p]!, rd[p]!);
          br[p] = r.brain;
          for (const a of r.actions as Action[]) {
            const card = a.type === 'summon' ? st.players[a.p].hand[a.handIndex] : undefined;
            const next = step(st, a);
            if (next !== st && a.type !== 'tick' && a.p === foe) {
              if (a.type === 'summon' && card) {
                used.set(card, (used.get(card) ?? 0) + 1);
                t.costSum += CARDS[card].summon;
                t.playN++;
                if (isBlocker(card)) t.blockers++;
                if (first < 0) first = st.time;
              } else if (a.type === 'attack') {
                t.attacks++;
                if (a.target.kind === 'player') t.faceHits++;
              }
            }
            st = next;
          }
        }
      }
      t.games++;
      t.ms += st.time;
      if (st.result.reason === 'time') t.timeouts++;
      if (st.result.winner === foe) t.foeScore++;
      else if (st.result.winner === null) t.foeScore += 0.5;
      t.firstPlayMs += Math.max(0, first);
    }
  }
  return t;
}

/** デッキごとの使用率（そのデッキの召喚に占める割合）で 5% 未満のカードの数と最小値。 */
function usage(t: Tally): { low: number; min: number; lows: string[] } {
  let low = 0;
  let min = 1;
  const lows: string[] = [];
  for (const [name, m] of t.plays) {
    const deck = RIVAL_DECKS.find((d) => d.name === name)!.deck;
    const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    for (const c of new Set(deck)) {
      const r = (m.get(c) ?? 0) / total;
      if (r < min) min = r;
      if (r < 0.05) {
        low++;
        lows.push(`${name}:${CARDS[c].name}${(r * 100).toFixed(1)}%`);
      }
    }
  }
  return { low, min, lows };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
console.log(`相手 ${level}（プレイヤー側 = 初期デッキ・normal・性格なし）、1 デッキ ${N} 戦`);
console.log('アリーナ | 性格 | 相手の勝率 | 平均時間 | 時間切れ | 初手 | 召喚/試合 | 平均コスト | ブロッカー率 | 攻撃/試合 | 顔攻撃/試合 | 顔ダメージ/試合 | 割り込み/試合 | 平均コイン | 使用率 5% 未満');
for (const [ai, a] of ARENAS.entries()) {
  if (only && !only.includes(ai)) continue;
  const list: CpuPersona[] = force ? ['plain', force] : a.persona === 'plain' ? ['plain'] : ['plain', a.persona];
  for (const pz of list) {
    const t = run(a.pool, pz);
    const u = usage(t);
    console.log(
      [
        a.name,
        pz,
        pct(t.foeScore / t.games),
        `${(t.ms / t.games / 1000).toFixed(0)}s`,
        pct(t.timeouts / t.games),
        `${(t.firstPlayMs / t.games / 1000).toFixed(1)}s`,
        (t.playN / t.games).toFixed(1),
        (t.costSum / t.playN).toFixed(2),
        pct(t.blockers / t.playN),
        (t.attacks / t.games).toFixed(1),
        (t.faceHits / t.games).toFixed(1),
        (t.faceDmg / t.games).toFixed(1),
        (t.interrupts / t.games).toFixed(2),
        (t.coinSum / t.coinN).toFixed(1),
        `${u.low} 枚（最小 ${(u.min * 100).toFixed(1)}%）${verbose && u.lows.length ? ' ' + u.lows.join(' ') : ''}`,
      ].join(' | '),
    );
  }
}
