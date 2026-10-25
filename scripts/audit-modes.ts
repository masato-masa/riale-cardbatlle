// ルールの案（1 手動・2 自動攻撃・3 自動攻撃で反撃なし）ごとに、初期デッキ対 相手デッキ全種を hard CPU 同士で戦わせ、
// 試合時間・時間切れ・妨害の回数・相手デッキごとの勝率を出す。案ごとのバランス調整に使う。
// 使い方: npx tsx scripts/audit-modes.ts [1 デッキあたりの試合数=24] [案=1,2,3]
import { createBrain, cpuStep } from '../src/ai/cpu';
import { RIVAL_DECKS, STARTER_DECK } from '../src/game/cards';
import { applyRuleBalance } from '../src/game/balance';
import { createGame, step, type Action, type PlayerIndex } from '../src/game/engine';
import { makeRng } from '../src/game/rng';
import { rulesOf, type RuleMode } from '../src/storage/profile';

const N = Number(process.argv[2] ?? 24);
const MODES = (process.argv[3] ?? '1,2,3').split(',').map(Number) as RuleMode[];
const VERBOSE = process.argv.includes('--decks');

for (const mode of MODES) {
  applyRuleBalance(mode);
  // 試しに倍率を変えて測る: --cd=0.4 --coin=1.2
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  const rules = { ...rulesOf(mode), ...(arg('cd') ? { cdScale: Number(arg('cd')) } : {}), ...(arg('coin') ? { coinScale: Number(arg('coin')) } : {}) };
  let games = 0;
  let sec = 0;
  let timeouts = 0;
  let interrupts = 0;
  let faceHits = 0;
  const rates: { name: string; rate: number }[] = [];
  for (const { name, deck } of RIVAL_DECKS) {
    let w = 0;
    for (let g = 0; g < N; g++) {
      const first = g % 2 === 0;
      let st = createGame((first ? [STARTER_DECK, deck] : [deck, STARTER_DECK]) as [typeof deck, typeof deck], g + 13, rules);
      const br = [createBrain(), createBrain()];
      const rd = [makeRng(g * 2 + 1), makeRng(g * 2 + 2)];
      const seen = new Set<number>();
      while (!st.result) {
        st = step(st, { type: 'tick', dt: 50 });
        for (const p of [0, 1] as PlayerIndex[]) {
          if (st.result) break;
          const r = cpuStep(st, p, br[p]!, 'hard', rd[p]!);
          br[p] = r.brain;
          for (const a of r.actions as Action[]) st = step(st, a);
        }
        for (const e of st.events) {
          if (seen.has(e.id)) continue;
          seen.add(e.id);
          if (e.kind === 'cancel' && e.reason === 'blocked') interrupts++;
          if (e.kind === 'damage' && e.target.kind === 'player' && e.amount > 0) faceHits++;
        }
      }
      games++;
      sec += st.time / 1000;
      if (st.result.reason === 'time') timeouts++;
      const ri = first ? 1 : 0;
      if (st.result.winner === ri) w++;
      else if (st.result.winner === null) w += 0.5;
    }
    rates.push({ name, rate: Math.round((w / N) * 100) });
  }
  const sorted = rates.map((r) => r.rate).sort((a, b) => a - b);
  console.log(
    `案${mode}: 平均 ${Math.round(sec / games)} 秒・時間切れ ${Math.round((timeouts / games) * 100)}%・プレイヤーへの命中 ${(faceHits / games).toFixed(1)} 回/試合・妨害 ${(interrupts / games).toFixed(1)} 回/試合・相手デッキの勝率 ${sorted[0]}〜${sorted.at(-1)}%（中央 ${sorted[Math.floor(sorted.length / 2)]}%）`,
  );
  if (VERBOSE) console.log('  ' + rates.map((r) => `${r.name} ${r.rate}%`).join(' / '));
}
