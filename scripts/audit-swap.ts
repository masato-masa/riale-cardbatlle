// 1 枚差し替えの監査: 初期デッキの投石を X に替えたデッキで、初期デッキと hard CPU 同士で戦わせ、勝率と「X を場に出した試合」の割合を出す。
// 全カード監査（normal・ランダムデッキ）では誤差に埋もれる差も、ここなら見える。建築の調整に使った（2026-10-25）。
// 使い方: npx tsx scripts/audit-swap.ts [試合数=120]　CARDS=altar,forge のように X を指定（既定は建築すべて）
import { createBrain, cpuStep } from '../src/ai/cpu';
import { STARTER_DECK, type CardId } from '../src/game/cards';
import { createGame, step, type Action, type PlayerIndex } from '../src/game/engine';
import { makeRng } from '../src/game/rng';
const N = Number(process.argv[2] ?? 120);
const B = (process.env.CARDS ?? 'cathedral,factory,fortress,infirmary,altar,forge,wall,exchange,tradingHouse').split(',') as CardId[];
const out: string[] = [];
for (const b of B) {
  const deck = STARTER_DECK.map((c) => (c === 'quarry' ? b : c));
  let w = 0, played = 0;
  for (let g = 0; g < N; g++) {
    const first = g % 2 === 0;
    const decks = first ? [STARTER_DECK, deck] : [deck, STARTER_DECK];
    let st = createGame(decks as any, g + 7);
    const br = [createBrain(), createBrain()];
    const rd = [makeRng(g * 2 + 1), makeRng(g * 2 + 2)];
    const ri = first ? 1 : 0; let seen = false;
    while (!st.result) {
      st = step(st, { type: 'tick', dt: 50 });
      if (!seen && st.players[ri].field.some((u: any) => u && u.card === b)) seen = true;
      for (const p of [0, 1] as PlayerIndex[]) {
        if (st.result) break;
        const r = cpuStep(st, p, br[p]!, 'hard', rd[p]!);
        br[p] = r.brain;
        for (const a of r.actions as Action[]) st = step(st, a);
      }
    }
    if (seen) played++;
    if (st.result.winner === ri) w++; else if (st.result.winner === null) w += 0.5;
  }
  out.push(`${b.padEnd(13)} 勝率 ${((w / N) * 100).toFixed(0)}%  出した試合 ${((played / N) * 100).toFixed(0)}%`);
}
console.log(out.join('\n'));
