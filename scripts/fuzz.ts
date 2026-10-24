// 荒らしテスト: hard の CPU 同士でランダムなデッキを 300 試合回し、例外・終わらない試合・おかしな値（HP・コイン・クールタイム）が無いか確かめる。
// 使い方: npm run fuzz（ルール・CPU・カードを変えたら回す）
import { createBrain, cpuStep } from '../src/ai/cpu';
import { CARDS, RIVAL_DECKS, STARTER_DECK, type CardId } from '../src/game/cards';
import { createGame, step, units, type Action, type PlayerIndex } from '../src/game/engine';
import { makeRng } from '../src/game/rng';
const all = (Object.keys(CARDS) as CardId[]).filter((c) => !CARDS[c].token);
const bad: string[] = [];
let games = 0;
for (let g = 0; g < 300; g++) {
  const r = makeRng(g * 7 + 3);
  const rnd = () => Array.from({ length: 8 }, () => all[Math.floor(r() * all.length)]!);
  const decks: [CardId[], CardId[]] = g % 3 === 0 ? [STARTER_DECK, RIVAL_DECKS[g % RIVAL_DECKS.length]!.deck] : [rnd(), rnd()];
  let st = createGame(decks, g);
  const br = [createBrain(), createBrain()]; const rd = [makeRng(g * 2 + 1), makeRng(g * 2 + 2)];
  let steps = 0;
  try {
    while (!st.result && steps < 20000) {
      st = step(st, { type: 'tick', dt: 50 }); steps++;
      for (const p of [0, 1] as PlayerIndex[]) { if (st.result) break; const res = cpuStep(st, p, br[p]!, 'hard', rd[p]!); br[p] = res.brain; for (const a of res.actions as Action[]) st = step(st, a); }
      for (const pl of st.players) {
        if (!Number.isFinite(pl.hp) || !Number.isFinite(pl.coins) || pl.coins < -1e-9 || pl.coins > 10.0001) bad.push(`g${g} coins/hp ${pl.hp} ${pl.coins}`);
        for (const u of units(pl)) if (!Number.isFinite(u.hp) || u.hp <= 0 || !Number.isFinite(u.readyAt)) bad.push(`g${g} unit ${u.card} hp ${u.hp} ready ${u.readyAt}`);
      }
      if (bad.length > 5) break;
    }
    if (!st.result) bad.push(`g${g} 終わらない`);
  } catch (e) { bad.push(`g${g} 例外 ${(e as Error).message}`); }
  games++;
  if (bad.length > 5) break;
}
console.log('試合', games, '異常', bad.length, bad.slice(0, 6));
