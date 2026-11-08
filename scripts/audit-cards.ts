// 全カードの強さの監査: ランダムな 10 枚デッキ同士を CPU（normal）で戦わせ、カードごとに
// 「入っていたデッキの勝率」を出す。平均（約 50%）から大きく外れたカードが調整の候補。
// 使い方: npm run audit -- [試合数=600]
import { createBrain, cpuStep } from '../src/ai/cpu';
import { CARDS, type CardId } from '../src/game/cards';
import { createGame, step, type Action, type PlayerIndex } from '../src/game/engine';
import { makeRng } from '../src/game/rng';
import { applyRuleBalance } from '../src/game/balance';
import { rulesOf, type RuleMode } from '../src/storage/profile';

const N = Number(process.argv[2] ?? 600);
// MODE=2 や MODE=3 で、ルールの案ごとに測る（その案のカードの数値とルールで）
const MODE = (Number(process.env.MODE ?? 1) || 1) as RuleMode;
applyRuleBalance(MODE);
const RULES = rulesOf(MODE);
const pool = (Object.keys(CARDS) as CardId[]).filter((id) => !CARDS[id].token);
const score = new Map<CardId, { n: number; s: number; plays: number }>();

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
  const decks: [CardId[], CardId[]] = [deck(), deck()];
  let state = createGame(decks, g + 1, RULES);
  const brains = [createBrain(), createBrain()];
  const rands = [makeRng(g * 2 + 1), makeRng(g * 2 + 2)];
  while (!state.result) {
    state = step(state, { type: 'tick', dt: 50 });
    for (const p of [0, 1] as PlayerIndex[]) {
      if (state.result) break;
      const r = cpuStep(state, p, brains[p]!, 'hard', rands[p]!);
      brains[p] = r.brain;
      for (const a of r.actions as Action[]) {
        // 出した枚数（手札から出る前に数える。出せなかった試みも含むので、実際に場へ出たかは見ない近似）
        const before = state;
        const cid = a.type === 'summon' ? before.players[a.p].hand[a.handIndex] : undefined;
        state = step(state, a);
        if (cid && state !== before) {
          const t = score.get(cid) ?? { n: 0, s: 0, plays: 0 };
          t.plays++;
          score.set(cid, t);
        }
      }
    }
  }
  const w = state.result!.winner;
  for (const p of [0, 1]) {
    const pts = w === null ? 0.5 : w === p ? 1 : 0;
    for (const c of decks[p]!) {
      const t = score.get(c) ?? { n: 0, s: 0, plays: 0 };
      t.n++;
      t.s += pts;
      score.set(c, t);
    }
  }
}
const rows = [...score.entries()].map(([id, t]) => ({ id, name: CARDS[id].name, cost: CARDS[id].summon, win: (t.s / t.n) * 100, n: t.n, use: t.plays / t.n }));
rows.sort((a, b) => b.win - a.win);
for (const r of rows) console.log(`${r.id.padEnd(12)} ${r.name.padEnd(8, '　')} コスト${r.cost} 勝率${r.win.toFixed(1)}%  (${r.n})  出す回数/試合 ${r.use.toFixed(2)}`);
const uses = rows.map((r) => r.use).sort((a, b) => a - b);
console.log(`勝率の幅 ${rows[rows.length - 1]!.win.toFixed(1)}〜${rows[0]!.win.toFixed(1)} / 標準偏差 ${Math.sqrt(rows.reduce((a, r) => a + (r.win - 50) ** 2, 0) / rows.length).toFixed(2)} / 40%未満${rows.filter((r) => r.win < 40).length}枚 60%超${rows.filter((r) => r.win > 60).length}枚 / 出す回数 中央${uses[uses.length >> 1]!.toFixed(2)} 0.3未満${uses.filter((u) => u < 0.3).length}枚`);
