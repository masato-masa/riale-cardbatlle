// CPU 同士の対戦を回して、勝率・試合時間・デッキ差・カードごとの成績を表にする。
// 使い方: npm run simulate -- [試合数=200] [cards=normal] [cd=3000,4000,5000]
//   cd= はクールタイム（ms）の上書き。複数並べると、それぞれで表を出す。省略は rules.ts の値。
//   先手・後手とデッキ（0 番 = STARTER_DECK、1 番 = RIVAL_DECK）は 4 通りを均等に回す。
//   カードの表は cards= で指定したレベル同士の試合から作る。
import { createBrain, cpuStep, type CpuLevel } from '../src/ai/cpu';
import { CARDS, RIVAL_DECK, STARTER_DECK, TYPE_NAME, type CardId } from '../src/game/cards';
import { ATTACK_COOLDOWN_MS, overrideAttackCooldownForSimulation } from '../src/game/rules';
import { createGame, step, type Action, type GameState, type PlayerIndex } from '../src/game/engine';
import { makeRng } from '../src/game/rng';

const DT = 50;
const DECKS: CardId[][] = [STARTER_DECK, RIVAL_DECK];
const DECK_NAME = ['STARTER', 'RIVAL'];

interface Game {
  state: GameState;
  summons: number;
  attacks: number;
  /** 側ごとの、カード別の召喚回数。 */
  played: [Map<CardId, number>, Map<CardId, number>];
}

function play(levels: [CpuLevel, CpuLevel], decks: [number, number], seed: number): Game {
  let state = createGame([DECKS[decks[0]]!, DECKS[decks[1]]!], seed);
  const brains = [createBrain(), createBrain()];
  const rands = [makeRng(seed * 2 + 1), makeRng(seed * 2 + 2)];
  const played: Game['played'] = [new Map(), new Map()];
  let summons = 0;
  let attacks = 0;
  while (!state.result) {
    state = step(state, { type: 'tick', dt: DT });
    for (const p of [0, 1] as PlayerIndex[]) {
      if (state.result) break;
      const r = cpuStep(state, p, brains[p]!, levels[p], rands[p]!);
      brains[p] = r.brain;
      for (const a of r.actions as Action[]) {
        const card = a.type === 'summon' ? state.players[a.p].hand[a.handIndex] : undefined;
        const next = step(state, a);
        if (next !== state) {
          if (a.type === 'summon') {
            summons++;
            played[a.p].set(card!, (played[a.p].get(card!) ?? 0) + 1);
          } else if (a.type === 'attack') attacks++;
        }
        state = next;
      }
    }
  }
  return { state, summons, attacks, played };
}

interface Tally {
  w: number;
  d: number;
  n: number;
}

interface Stat {
  wins: number;
  losses: number;
  draws: number;
  timeouts: number;
  totalMs: number;
  summons: number;
  attacks: number;
  /** 先手（0 番側）の勝ち */
  firstWins: number;
  /** デッキごとの勝ち・引き分け・試合数 */
  deck: [Tally, Tally];
}

interface CardStat {
  summons: number;
  /** 出した側の試合数と得点（勝ち 1・引分 0.5）、出さなかった側の同じもの */
  withN: number;
  withScore: number;
  withoutN: number;
  withoutScore: number;
}

const cardStats = new Map<CardId, CardStat>();
let cardGames = 0;

function recordCards(g: Game): void {
  cardGames++;
  const w = g.state.result!.winner;
  for (const p of [0, 1] as PlayerIndex[]) {
    const score = w === null ? 0.5 : w === p ? 1 : 0;
    for (const id of Object.keys(CARDS) as CardId[]) {
      if (CARDS[id].token) continue;
      const st = cardStats.get(id) ?? { summons: 0, withN: 0, withScore: 0, withoutN: 0, withoutScore: 0 };
      const c = g.played[p].get(id) ?? 0;
      st.summons += c;
      if (c > 0) {
        st.withN++;
        st.withScore += score;
      } else {
        st.withoutN++;
        st.withoutScore += score;
      }
      cardStats.set(id, st);
    }
  }
}

/** a 対 b。先手・後手とデッキの割り当てを 4 通り均等に回す。 */
function match(a: CpuLevel, b: CpuLevel, n: number, collect: boolean): Stat {
  const st: Stat = {
    wins: 0,
    losses: 0,
    draws: 0,
    timeouts: 0,
    totalMs: 0,
    summons: 0,
    attacks: 0,
    firstWins: 0,
    deck: [
      { w: 0, d: 0, n: 0 },
      { w: 0, d: 0, n: 0 },
    ],
  };
  for (let i = 0; i < n; i++) {
    const aSide: PlayerIndex = i % 2 === 0 ? 0 : 1;
    const aDeck = Math.floor(i / 2) % 2; // a が使うデッキ
    const levels: [CpuLevel, CpuLevel] = aSide === 0 ? [a, b] : [b, a];
    const deckOf: [number, number] = aSide === 0 ? [aDeck, 1 - aDeck] : [1 - aDeck, aDeck];
    const r = play(levels, deckOf, i + 1);
    const res = r.state.result!;
    if (res.winner === null) st.draws++;
    else if (res.winner === aSide) st.wins++;
    else st.losses++;
    if (res.reason === 'time') st.timeouts++;
    if (res.winner === 0) st.firstWins++;
    st.totalMs += r.state.time;
    st.summons += r.summons;
    st.attacks += r.attacks;
    for (const p of [0, 1] as PlayerIndex[]) {
      const dk = st.deck[deckOf[p]]!;
      dk.n++;
      if (res.winner === null) dk.d++;
      else if (res.winner === p) dk.w++;
    }
    if (collect) recordCards(r);
  }
  return st;
}

const args = process.argv.slice(2);
const n = Number(args.find((x) => /^\d+$/.test(x)) ?? 200);
const cds = (args.find((x) => x.startsWith('cd='))?.slice(3) ?? '').split(',').filter(Boolean).map(Number);
const cardLevel = (args.find((x) => x.startsWith('cards='))?.slice(6) ?? 'normal') as CpuLevel;
const pct = (x: number, d = n) => `${((x / d) * 100).toFixed(1)}%`;
const rate = (o: Tally) => (o.n ? ((o.w + o.d / 2) / o.n) * 100 : NaN);
const f1 = (x: number) => (Number.isNaN(x) ? '-' : x.toFixed(1));
const pairs: [CpuLevel, CpuLevel][] = [
  ['easy', 'easy'],
  ['normal', 'normal'],
  ['hard', 'hard'],
  ['hard', 'normal'],
  ['normal', 'easy'],
  ['hard', 'easy'],
];

function report(): void {
  cardStats.clear();
  cardGames = 0;
  console.log(`${n} 試合ずつ（左の CPU の成績。先手・後手とデッキは 4 通りを均等に）`);
  console.log('組み合わせ        | 勝率   | 引分  | 敗率   | 平均時間 | 時間切れ | 召喚/試合 | 攻撃/試合 | 先手勝率');
  console.log('------------------|--------|-------|--------|----------|----------|-----------|-----------|--------');
  const results: { a: CpuLevel; b: CpuLevel; s: Stat }[] = [];
  for (const [a, b] of pairs) {
    const s = match(a, b, n, a === cardLevel && b === cardLevel);
    results.push({ a, b, s });
    console.log(
      `${`${a} vs ${b}`.padEnd(17)} | ${pct(s.wins).padStart(6)} | ${pct(s.draws).padStart(5)} | ${pct(s.losses).padStart(6)} | ${`${(s.totalMs / n / 1000).toFixed(1)}s`.padStart(8)} | ${pct(s.timeouts).padStart(8)} | ${(s.summons / n).toFixed(1).padStart(9)} | ${(s.attacks / n).toFixed(1).padStart(9)} | ${pct(s.firstWins).padStart(7)}`,
    );
  }

  console.log('\nデッキの勝率（引き分けは半分。同じレベル同士の差が 10 ポイント以内が目安）');
  console.log('組み合わせ        | STARTER | RIVAL  | 差');
  console.log('------------------|---------|--------|------');
  for (const { a, b, s } of results) {
    const x = rate(s.deck[0]);
    const y = rate(s.deck[1]);
    console.log(`${`${a} vs ${b}`.padEnd(17)} | ${`${f1(x)}%`.padStart(7)} | ${`${f1(y)}%`.padStart(6)} | ${f1(x - y).padStart(5)}`);
  }

  console.log(`\nカードごとの成績（${cardLevel} 同士、${cardGames} 試合 = ${cardGames * 2} 側）`);
  console.log('カード     | 種類   | デッキ | 召喚/試合 | 出した試合 | 出した側の勝率 | 出さなかった側の勝率');
  console.log('-----------|--------|--------|-----------|------------|----------------|--------------------');
  const rows = [...cardStats.entries()].map(([id, st]) => {
    const inDecks = DECKS.map((d, i) => (d.includes(id) ? DECK_NAME[i]![0] : '')).join('');
    return { id, inDecks, st };
  });
  rows.sort((p, q) => {
    const wp = p.st.withN ? p.st.withScore / p.st.withN : 0;
    const wq = q.st.withN ? q.st.withScore / q.st.withN : 0;
    return wq - wp;
  });
  for (const { id, inDecks, st } of rows) {
    if (st.summons === 0 && st.withN === 0) continue;
    const w = st.withN ? (st.withScore / st.withN) * 100 : NaN;
    const wo = st.withoutN ? (st.withoutScore / st.withoutN) * 100 : NaN;
    console.log(
      `${CARDS[id].name.padEnd(5, '　')} | ${TYPE_NAME[CARDS[id].type].padEnd(4, '　')} | ${inDecks.padEnd(6)} | ${(st.summons / (cardGames * 2)).toFixed(2).padStart(9)} | ${pct(st.withN, cardGames * 2).padStart(10)} | ${`${f1(w)}%`.padStart(14)} | ${`${f1(wo)}%`.padStart(19)}`,
    );
  }
  console.log('（デッキ欄: S = STARTER、R = RIVAL）');
}

for (const cd of cds.length ? cds : [ATTACK_COOLDOWN_MS]) {
  overrideAttackCooldownForSimulation(cd);
  console.log(`
===== クールタイム ${cd / 1000} 秒 =====`);
  report();
}
