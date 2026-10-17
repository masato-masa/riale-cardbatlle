// CPU 同士の対戦を回して、勝率・試合時間などを表にする。
// 使い方: npm run simulate -- [試合数=200]
import { createBrain, cpuStep, type CpuLevel } from '../src/ai/cpu';
import { STARTER_DECK } from '../src/game/cards';
import { createGame, step, type Action, type GameState, type PlayerIndex } from '../src/game/engine';
import { makeRng } from '../src/game/rng';

const DT = 50;

interface Stat {
  wins: number;
  losses: number;
  draws: number;
  timeouts: number;
  totalMs: number;
  summons: number;
  attacks: number;
}

function play(levels: [CpuLevel, CpuLevel], seed: number): { state: GameState; summons: number; attacks: number } {
  let state = createGame([STARTER_DECK, STARTER_DECK], seed);
  const brains = [createBrain(), createBrain()];
  const rands = [makeRng(seed * 2 + 1), makeRng(seed * 2 + 2)];
  let summons = 0;
  let attacks = 0;
  while (!state.result) {
    state = step(state, { type: 'tick', dt: DT });
    for (const p of [0, 1] as PlayerIndex[]) {
      if (state.result) break;
      const r = cpuStep(state, p, brains[p]!, levels[p], rands[p]!);
      brains[p] = r.brain;
      for (const a of r.actions as Action[]) {
        const next = step(state, a);
        if (next !== state) {
          if (a.type === 'summon') summons++;
          else if (a.type === 'attack') attacks++;
        }
        state = next;
      }
    }
  }
  return { state, summons, attacks };
}

/** a 対 b。a が先手・後手になる試合を半々にする。 */
function match(a: CpuLevel, b: CpuLevel, n: number): Stat {
  const st: Stat = { wins: 0, losses: 0, draws: 0, timeouts: 0, totalMs: 0, summons: 0, attacks: 0 };
  for (let i = 0; i < n; i++) {
    const aSide: PlayerIndex = i % 2 === 0 ? 0 : 1;
    const levels: [CpuLevel, CpuLevel] = aSide === 0 ? [a, b] : [b, a];
    const r = play(levels, i + 1);
    const res = r.state.result!;
    if (res.winner === null) st.draws++;
    else if (res.winner === aSide) st.wins++;
    else st.losses++;
    if (res.reason === 'time') st.timeouts++;
    st.totalMs += r.state.time;
    st.summons += r.summons;
    st.attacks += r.attacks;
  }
  return st;
}

const n = Number(process.argv.slice(2).find((x) => /^\d+$/.test(x)) ?? 200);
const pairs: [CpuLevel, CpuLevel][] = [
  ['easy', 'easy'],
  ['normal', 'normal'],
  ['hard', 'hard'],
  ['hard', 'normal'],
  ['normal', 'easy'],
  ['hard', 'easy'],
];

const pct = (x: number) => `${((x / n) * 100).toFixed(1)}%`;
console.log(`${n} 試合ずつ（左の CPU の成績。先手・後手は半々）`);
console.log('組み合わせ        | 勝率   | 引分  | 敗率   | 平均時間 | 時間切れ | 召喚/試合 | 攻撃/試合');
console.log('------------------|--------|-------|--------|----------|----------|-----------|----------');
for (const [a, b] of pairs) {
  const s = match(a, b, n);
  console.log(
    `${`${a} vs ${b}`.padEnd(17)} | ${pct(s.wins).padStart(6)} | ${pct(s.draws).padStart(5)} | ${pct(s.losses).padStart(6)} | ${`${(s.totalMs / n / 1000).toFixed(1)}s`.padStart(8)} | ${pct(s.timeouts).padStart(8)} | ${(s.summons / n).toFixed(1).padStart(9)} | ${(s.attacks / n).toFixed(1).padStart(9)}`,
  );
}
