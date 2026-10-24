// 相手デッキ（テーマ別）ごとに、初期デッキ相手の勝率（hard CPU 同士）を測る。使い方: npx tsx scripts/audit-decks.ts
import { createBrain, cpuStep } from '../src/ai/cpu';
import { RIVAL_DECKS, STARTER_DECK } from '../src/game/cards';
import { createGame, step, type Action, type PlayerIndex } from '../src/game/engine';
import { makeRng } from '../src/game/rng';
const N = 120;
for (const { name, deck } of RIVAL_DECKS) {
  let w = 0;
  for (let g = 0; g < N; g++) {
    const first = g % 2 === 0;
    const decks = first ? [STARTER_DECK, deck] : [deck, STARTER_DECK];
    let st = createGame(decks as [typeof deck, typeof deck], g + 7);
    const br = [createBrain(), createBrain()];
    const rd = [makeRng(g * 2 + 1), makeRng(g * 2 + 2)];
    while (!st.result) {
      st = step(st, { type: 'tick', dt: 50 });
      for (const p of [0, 1] as PlayerIndex[]) {
        if (st.result) break;
        const r = cpuStep(st, p, br[p]!, 'hard', rd[p]!);
        br[p] = r.brain;
        for (const a of r.actions as Action[]) st = step(st, a);
      }
    }
    const rivalIdx = first ? 1 : 0;
    if (st.result.winner === rivalIdx) w++;
    else if (st.result.winner === null) w += 0.5;
  }
  console.log(name.padEnd(6), `相手デッキの勝率 ${((w / N) * 100).toFixed(0)}%`);
}
