import { describe, expect, it } from 'vitest';

import { cpuStep, createBrain } from '../src/ai/cpu';
import { CARDS, STARTER_DECK, type CardId } from '../src/game/cards';
import { createGame, isWalled, step, type GameState, type PlayerIndex, type Unit } from '../src/game/engine';
import { COIN_MAX, FIELD_SLOTS } from '../src/game/rules';
import { makeRng } from '../src/game/rng';

function setup(hand: CardId[], mine: CardId[], foe: [CardId, number?][]): GameState {
  const s = createGame([STARTER_DECK, STARTER_DECK], 1);
  let uid = 1;
  const mk = (card: CardId, hp?: number): Unit => ({
    uid: uid++,
    card,
    hp: hp ?? CARDS[card].hp,
    readyAt: 0,
    barrier: !!CARDS[card].ab.barrier,
    stealth: !!CARDS[card].ab.stealth,
    pulseAt: CARDS[card].ab.pulse ? 5000 + CARDS[card].ab.pulse!.everyMs : null,
    reserved: null,
  });
  const field = (list: [CardId, number?][]) =>
    Array.from({ length: FIELD_SLOTS }, (_, i) => (list[i] ? mk(list[i]![0], list[i]![1]) : null));
  return {
    ...s,
    time: 5000,
    nextUid: 100,
    players: [
      { ...s.players[0], hand, coins: COIN_MAX, field: field(mine.map((c) => [c] as [CardId])) },
      { ...s.players[1], coins: 0, field: field(foe) },
    ],
  };
}

/** 何度か考えさせて、出てきた操作をすべて集める。 */
function actionsOf(s: GameState, p: PlayerIndex, level: 'easy' | 'normal' | 'hard' = 'hard') {
  const out = [];
  for (let seed = 1; seed <= 20; seed++) {
    const r = cpuStep(s, p, { ...createBrain(), nextThinkAt: 0 }, level, makeRng(seed));
    out.push(...r.actions);
  }
  return out;
}

/** 1 回目の操作だけ（2 回目は 1 回目で手札が入れ替わった後の盤面なので別物）。 */
function firstActions(s: GameState, p: PlayerIndex, level: 'easy' | 'normal' | 'hard' = 'hard') {
  const out = [];
  for (let seed = 1; seed <= 20; seed++) {
    const r = cpuStep(s, p, { ...createBrain(), nextThinkAt: 0 }, level, makeRng(seed));
    if (r.actions[0]) out.push(r.actions[0]);
  }
  return out;
}

describe('CPU の能力の使い方', () => {
  it('狙撃は相手のカードを選んで target を渡す（倒せる相手）', () => {
    const s = setup(['taxman', 'guard', 'guard', 'guard'], [], [['herald', 2], ['guard'], ['craftsman']]);
    const a = firstActions(s, 0).filter((x) => x.type === 'summon' && x.handIndex === 0);
    expect(a.length).toBeGreaterThan(0);
    for (const x of a) {
      expect(x.type === 'summon' && x.target).toBeTruthy();
    }
    // 最初の的（uid 1: 体力 2 の伝令）は倒せるので選ばれる
    expect(a.some((x) => x.type === 'summon' && x.target === 1)).toBe(true);
  });

  it('足止も target を渡す。渡された操作を engine が受け付ける', () => {
    const s = setup(['informer', 'herald', 'herald', 'herald'], [], [['inspector'], ['herald']]);
    const a = firstActions(s, 0).find((x) => x.type === 'summon' && x.handIndex === 0);
    expect(a).toBeTruthy();
    const n = step(s, a!);
    expect(n).not.toBe(s);
    expect(n.events.some((e) => e.kind === 'windup')).toBe(true); // 足止は溜めのあとに効く
  });

  it('相手が壁なら顔を攻撃しない', () => {
    const s = setup(['guard', 'guard', 'guard', 'guard'], ['craftsman'], [
      ['herald'], ['herald'], ['herald'], ['herald'], ['herald'],
    ]);
    expect(isWalled(s.players[1])).toBe(true);
    for (const x of actionsOf(s, 0)) {
      if (x.type === 'attack') expect(x.target.kind).toBe('unit');
    }
  });
});

describe('CPU の新しいルール（建築物・呪文・クールタイム）', () => {
  const cast = (xs: ReturnType<typeof firstActions>, hand: number) =>
    xs.filter((x) => x.type === 'summon' && x.handIndex === hand);

  /** 自分のユニットのクールタイムを指定する。 */
  const withReady = (s: GameState, readyAt: number): GameState => ({
    ...s,
    players: [{ ...s.players[0], field: s.players[0].field.map((u) => (u ? { ...u, readyAt } : u)) }, s.players[1]],
  });

  it('建築物は攻撃の候補にしない', () => {
    const s = setup(['guard', 'guard', 'guard', 'guard'], ['fortress', 'exchange'], [['herald'], ['spy']]);
    for (const x of actionsOf(s, 0)) {
      if (x.type === 'attack') expect(x.uid).not.toBe(1);
      if (x.type === 'attack') expect(x.uid).not.toBe(2);
    }
  });

  it('クールタイム中のユニットでは攻撃しない。明けたら攻撃する', () => {
    const base = setup(['guard', 'guard', 'guard', 'guard'], ['craftsman'], [['herald']]);
    expect(actionsOf(withReady(base, 99_999), 0).some((x) => x.type === 'attack')).toBe(false);
    expect(actionsOf(base, 0).some((x) => x.type === 'attack')).toBe(true);
  });

  it('攻撃にコインを使わない: コインが 0 でも攻撃する', () => {
    const s = setup(['guard', 'guard', 'guard', 'guard'], ['craftsman'], [['herald']]);
    const poor = { ...s, players: [{ ...s.players[0], coins: 0 }, s.players[1]] } as GameState;
    expect(actionsOf(poor, 0).some((x) => x.type === 'attack')).toBe(true);
  });

  it('単体の呪文は target を渡し、倒せる大物を選ぶ。engine が受け付ける', () => {
    const s = setup(['quarry', 'herald', 'herald', 'herald'], [], [['guard'], ['architect', 4], ['herald']]);
    const a = cast(firstActions(s, 0, 'normal'), 0);
    expect(a.length).toBeGreaterThan(0);
    for (const x of a) expect(x.type === 'summon' && x.target).toBeTruthy();
    expect(a.some((x) => x.type === 'summon' && x.target === 2)).toBe(true);
    expect(step(s, a[0]!)).not.toBe(s);
  });

  it('単体の呪文は相手の場が空なら使わない', () => {
    const s = setup(['quarry', 'herald', 'herald', 'herald'], [], []);
    expect(cast(actionsOf(s, 0), 0)).toHaveLength(0);
  });

  it('全体の呪文は 2 枚以上倒れるときに使い、1 枚だけなら使わない', () => {
    const many = setup(['quake', 'herald', 'herald', 'herald'], [], [['herald'], ['herald'], ['miner']]);
    expect(cast(firstActions(many, 0, 'normal'), 0).length).toBeGreaterThan(0);
    const one = setup(['quake', 'herald', 'herald', 'herald'], [], [['guard']]);
    expect(cast(firstActions(one, 0), 0)).toHaveLength(0);
  });

  it('遅延の呪文は攻撃が明けそうな相手が多いときに使う', () => {
    const many = setup(['roadblock', 'herald', 'herald', 'herald'], [], [['spy'], ['craftsman'], ['taxman']]);
    expect(cast(firstActions(many, 0, 'normal'), 0).length).toBeGreaterThan(0);
    const none = setup(['roadblock', 'herald', 'herald', 'herald'], [], [['guard']]);
    expect(cast(firstActions(none, 0), 0)).toHaveLength(0);
  });

  it('再動の呪文は味方がクールタイム中のときだけ使う', () => {
    const base = setup(['festival', 'herald', 'herald', 'herald'], ['spy', 'craftsman', 'taxman'], [['guard']]);
    expect(cast(firstActions(withReady(base, 15_000), 0, 'normal'), 0).length).toBeGreaterThan(0);
    expect(cast(actionsOf(base, 0), 0)).toHaveLength(0);
  });

  it('呪文は場が全部うまっていても使う', () => {
    const s = setup(['quake', 'herald', 'herald', 'herald'], ['guard', 'guard', 'guard', 'guard', 'guard'], [['herald'], ['herald'], ['miner']]);
    expect(cast(firstActions(s, 0, 'normal'), 0).length).toBeGreaterThan(0);
  });
});

describe('CPU とステルス', () => {
  it('ステルス中の相手のカードは、狙撃・足止・単体の呪文・攻撃の対象にしない', () => {
    const s = setup(['taxman', 'quarry', 'informer', 'herald'], ['craftsman'], [['spy', 1], ['spy', 1]]);
    expect(s.players[1].field[0]!.stealth).toBe(true);
    for (const x of actionsOf(s, 0)) {
      if (x.type === 'summon') expect(x.target === undefined || (x.target !== 2 && x.target !== 3)).toBe(true);
      if (x.type === 'attack') expect(x.target.kind === 'player' || (x.target.kind === 'unit' && x.target.uid > 3)).toBe(true);
    }
    const poor = { ...s, players: [{ ...s.players[0], coins: 0 }, s.players[1]] } as GameState;
    expect(actionsOf(poor, 0).some((x) => x.type === 'attack' && x.target.kind === 'player')).toBe(true);
  });

  it('自分のステルスで顔を狙う', () => {
    const s = setup(['guard', 'guard', 'guard', 'guard'], ['spy'], [['herald']]);
    const atk = actionsOf(s, 0).filter((x) => x.type === 'attack');
    expect(atk.length).toBeGreaterThan(0);
  });
});
