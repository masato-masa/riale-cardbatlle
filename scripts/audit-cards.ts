// 全カードの強さの監査: ランダムな 10 枚デッキ同士を CPU（normal）で戦わせ、カードごとに
// 「入っていたデッキの勝率」を出す。平均（約 50%）から大きく外れたカードが調整の候補。
// 使い方: npm run audit -- [試合数=600]
import { createBrain, cpuStep } from '../src/ai/cpu';
import { CARDS, type CardId } from '../src/game/cards';
import { createGame, step, type Action, type PlayerIndex } from '../src/game/engine';
import { makeRng } from '../src/game/rng';

const N = Number(process.argv[2] ?? 600);
const pool = (Object.keys(CARDS) as CardId[]).filter((id) => !CARDS[id].token);
const score = new Map<CardId, { n: number; s: number }>();

for (let g = 0; g < N; g++) {
  const rng = makeRng(1000 + g);
  const deck = () => {
    const a = [...pool];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a.slice(0, 10);
  };
  const decks = [deck(), deck()];
  let state = createGame(decks, g + 1);
  const brains = [createBrain(), createBrain()];
  const rands = [makeRng(g * 2 + 1), makeRng(g * 2 + 2)];
  while (!state.result) {
    state = step(state, { type: 'tick', dt: 50 });
    for (const p of [0, 1] as PlayerIndex[]) {
      if (state.result) break;
      const r = cpuStep(state, p, brains[p]!, 'normal', rands[p]!);
      brains[p] = r.brain;
      for (const a of r.actions as Action[]) state = step(state, a);
    }
  }
  const w = state.result!.winner;
  for (const p of [0, 1]) {
    const pts = w === null ? 0.5 : w === p ? 1 : 0;
    for (const c of decks[p]!) {
      const t = score.get(c) ?? { n: 0, s: 0 };
      t.n++;
      t.s += pts;
      score.set(c, t);
    }
  }
}
const rows = [...score.entries()].map(([id, t]) => ({ id, name: CARDS[id].name, cost: CARDS[id].summon, win: (t.s / t.n) * 100, n: t.n }));
rows.sort((a, b) => b.win - a.win);
for (const r of rows) console.log(`${r.id.padEnd(12)} ${r.name.padEnd(8, '　')} コスト${r.cost} 勝率${r.win.toFixed(1)}%  (${r.n})`);
