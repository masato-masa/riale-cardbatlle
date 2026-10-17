import { describe, expect, it } from 'vitest';

import { CARDS, STARTER_DECK, type CardId } from '../src/game/cards';
import {
  createGame,
  findUnit,
  isLegalTarget,
  legalTargets,
  step,
  type GameState,
  type PlayerIndex,
  type Unit,
} from '../src/game/engine';
import {
  ATTACK_COOLDOWN_MS,
  COIN_MAX,
  COIN_MS,
  COIN_START,
  DOUBLE_COIN_FROM_MS,
  FIELD_SLOTS,
  MATCH_MS,
  PLAYER_HP,
  SUMMON_DELAY_MS,
} from '../src/game/rules';

const fresh = (): GameState => createGame([STARTER_DECK, STARTER_DECK], 1);
const tick = (s: GameState, dt: number): GameState => step(s, { type: 'tick', dt });

/** 手札を指定して、コインを満タンにした状態。 */
function withHand(hand: CardId[], coins = COIN_MAX): GameState {
  const s = fresh();
  const mk = (p: 0 | 1) => ({ ...s.players[p], hand, coins });
  return { ...s, players: [mk(0), mk(1)] };
}

/** 場へ直接置く（召喚の待ち時間なしで攻撃できる）。 */
function place(s: GameState, p: PlayerIndex, slot: number, card: CardId, hp?: number, readyAt = 0): [GameState, Unit] {
  const unit: Unit = { uid: s.nextUid, card, hp: hp ?? CARDS[card].hp, readyAt };
  const field = [...s.players[p].field];
  field[slot] = unit;
  const pl = { ...s.players[p], field };
  const players: GameState['players'] = p === 0 ? [pl, s.players[1]] : [s.players[0], pl];
  return [{ ...s, players, nextUid: s.nextUid + 1 }, unit];
}

describe('コイン', () => {
  it('開始は 5 枚、2.8 秒で 1 枚ふえる', () => {
    let s = fresh();
    expect(s.players[0].coins).toBe(COIN_START);
    s = tick(s, COIN_MS);
    expect(s.players[0].coins).toBeCloseTo(COIN_START + 1);
    expect(s.players[1].coins).toBeCloseTo(COIN_START + 1);
  });
  it('端数がたまる', () => {
    const s = tick(fresh(), COIN_MS / 2);
    expect(s.players[0].coins).toBeCloseTo(COIN_START + 0.5);
  });
  it('上限は 10 枚', () => {
    const s = tick(fresh(), 60_000);
    expect(s.players[0].coins).toBe(COIN_MAX);
  });
  it('120 秒以降は 2 倍速', () => {
    let s = { ...fresh(), time: DOUBLE_COIN_FROM_MS };
    s = { ...s, players: [{ ...s.players[0], coins: 0 }, { ...s.players[1], coins: 0 }] };
    s = tick(s, COIN_MS);
    expect(s.players[0].coins).toBeCloseTo(2);
  });
  it('120 秒の境目をまたぐ tick は前後で速さを分ける', () => {
    let s = { ...fresh(), time: DOUBLE_COIN_FROM_MS - COIN_MS };
    s = { ...s, players: [{ ...s.players[0], coins: 0 }, { ...s.players[1], coins: 0 }] };
    // 手前の 2.8 秒で 1 枚 + 先の 2.8 秒で 2 枚
    s = tick(s, COIN_MS * 2);
    expect(s.players[0].coins).toBeCloseTo(3);
  });
  it('tick を細かく刻んでも一度に進めても同じ', () => {
    let a = { ...fresh(), time: DOUBLE_COIN_FROM_MS - 1000 };
    a = { ...a, players: [{ ...a.players[0], coins: 0 }, a.players[1]] };
    let b = a;
    a = tick(a, 5000);
    for (let i = 0; i < 100; i++) b = tick(b, 50);
    expect(b.players[0].coins).toBeCloseTo(a.players[0].coins, 6);
  });
  it('dt が 0 以下なら何も変わらない', () => {
    const s = fresh();
    expect(tick(s, 0)).toBe(s);
    expect(tick(s, -5)).toBe(s);
  });
});

describe('召喚', () => {
  it('コインが足りないと出せない', () => {
    const s = withHand(['boss', 'herald', 'herald', 'herald'], 5);
    const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(n).toBe(s);
  });
  it('コインを払って場へ出る。手札の同じ位置に次のカードが入り、使ったカードは queue の末尾へ', () => {
    const s = withHand(['miner', 'herald', 'guard', 'spy']);
    const next = s.players[0].queue[0]!;
    const rest = s.players[0].queue.slice(1);
    const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 2 });
    const pl = n.players[0];
    expect(pl.coins).toBe(COIN_MAX - CARDS.miner.summon);
    expect(pl.hand).toEqual([next, 'herald', 'guard', 'spy']);
    expect(pl.queue).toEqual([...rest, 'miner']);
    expect(pl.field[2]).toMatchObject({ card: 'miner', hp: CARDS.miner.hp, readyAt: n.time + SUMMON_DELAY_MS });
    expect(n.players[1]).toEqual(s.players[1]);
  });
  it('枠が埋まっている・範囲外の枠には出せない', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(step(s, { type: 'summon', p: 0, handIndex: 1, slot: 0 })).toBe(s);
    expect(step(s, { type: 'summon', p: 0, handIndex: 1, slot: FIELD_SLOTS })).toBe(s);
    expect(step(s, { type: 'summon', p: 0, handIndex: 1, slot: -1 })).toBe(s);
  });
  it('存在しない手札位置は無視', () => {
    const s = withHand(['herald', 'herald', 'herald', 'herald']);
    expect(step(s, { type: 'summon', p: 0, handIndex: 9, slot: 0 })).toBe(s);
  });
  it('5 枠すべて埋めると 6 体目は出せない', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    for (let i = 0; i < FIELD_SLOTS; i++) {
      s = { ...s, players: [{ ...s.players[0], coins: COIN_MAX }, s.players[1]] };
      s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: i });
    }
    expect(s.players[0].field.every(Boolean)).toBe(true);
    const again = step({ ...s, players: [{ ...s.players[0], coins: COIN_MAX }, s.players[1]] }, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(again.players[0].field.filter(Boolean)).toHaveLength(FIELD_SLOTS);
  });
  it('デッキの枚数は保たれる（手札 + queue = 10）', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    s = step(s, { type: 'summon', p: 0, handIndex: 1, slot: 1 });
    expect(s.players[0].hand.length + s.players[0].queue.length).toBe(10);
  });
});

describe('攻撃', () => {
  it('召喚直後 1 秒は攻撃できない', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    const uid = s.players[0].field[0]!.uid;
    const early = step(s, { type: 'attack', p: 0, uid, target: { kind: 'player' } });
    expect(early).toBe(s);
    s = tick(s, SUMMON_DELAY_MS - 1);
    expect(step(s, { type: 'attack', p: 0, uid, target: { kind: 'player' } })).toBe(s);
    s = tick(s, 1);
    const hit = step(s, { type: 'attack', p: 0, uid, target: { kind: 'player' } });
    expect(hit.players[1].hp).toBe(PLAYER_HP - 1);
  });
  it('攻撃後 2 秒は次の攻撃ができず、アタックコストを払う', () => {
    let [s, u] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'craftsman');
    const coins = s.players[0].coins;
    s = step(s, { type: 'attack', p: 0, uid: u.uid, target: { kind: 'player' } });
    expect(s.players[0].coins).toBe(coins - CARDS.craftsman.attackCost);
    expect(s.players[1].hp).toBe(PLAYER_HP - 3);
    const blocked = step(s, { type: 'attack', p: 0, uid: u.uid, target: { kind: 'player' } });
    expect(blocked).toBe(s);
    s = tick(s, ATTACK_COOLDOWN_MS - 1);
    expect(step(s, { type: 'attack', p: 0, uid: u.uid, target: { kind: 'player' } })).toBe(s);
    s = tick(s, 1);
    const again = step(s, { type: 'attack', p: 0, uid: u.uid, target: { kind: 'player' } });
    expect(again.players[1].hp).toBe(PLAYER_HP - 6);
  });
  it('アタックコストが足りないと攻撃できない', () => {
    const [s, u] = place(withHand(['herald', 'herald', 'herald', 'herald'], 3), 0, 0, 'architect');
    expect(step(s, { type: 'attack', p: 0, uid: u.uid, target: { kind: 'player' } })).toBe(s);
  });
  it('カード同士は相互ダメージ。死んだカードは場から消える', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    let a: Unit, b: Unit;
    [s, a] = place(s, 0, 0, 'craftsman'); // 3/3
    [s, b] = place(s, 1, 0, 'miner'); // 2/3
    const n = step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'unit', uid: b.uid } });
    expect(findUnit(n.players[1], b.uid)).toBeNull(); // 3 ダメージで死亡
    expect(findUnit(n.players[0], a.uid)!.unit.hp).toBe(1); // 反撃 2
    expect(n.players[1].hp).toBe(PLAYER_HP);
    expect(n.events.some((e) => e.kind === 'death' && e.uid === b.uid)).toBe(true);
  });
  it('相打ちなら両方消える', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    let a: Unit, b: Unit;
    [s, a] = place(s, 0, 0, 'taxman'); // 3/4
    [s, b] = place(s, 1, 0, 'inspector'); // 4/4
    const n = step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'unit', uid: b.uid } });
    expect(findUnit(n.players[0], a.uid)).toBeNull();
    expect(findUnit(n.players[1], b.uid)!.unit.hp).toBe(1);
    const [s2, c] = place(s, 0, 1, 'inspector');
    const n2 = step(s2, { type: 'attack', p: 0, uid: c.uid, target: { kind: 'unit', uid: b.uid } });
    expect(findUnit(n2.players[0], c.uid)).toBeNull();
    expect(findUnit(n2.players[1], b.uid)).toBeNull();
  });
  it('減った HP は戻らず、攻撃したカードは生き残ればクールダウンに入る', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    let a: Unit, b: Unit;
    [s, a] = place(s, 0, 0, 'blockader');
    [s, b] = place(s, 1, 0, 'herald');
    const n = step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'unit', uid: b.uid } });
    const me = findUnit(n.players[0], a.uid)!.unit;
    expect(me.hp).toBe(CARDS.blockader.hp - 1);
    expect(me.readyAt).toBe(n.time + ATTACK_COOLDOWN_MS);
    expect(tick(n, 60_000).players[0].field[0]!.hp).toBe(CARDS.blockader.hp - 1);
  });
  it('プレイヤー攻撃は反撃なし、HP は 0 未満にならない', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    let a: Unit;
    [s, a] = place(s, 0, 0, 'architect');
    const n = step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'player' } });
    expect(findUnit(n.players[0], a.uid)!.unit.hp).toBe(CARDS.architect.hp);
    expect(n.players[1].hp).toBe(PLAYER_HP - 6);
    const low: GameState = { ...n, players: [n.players[0], { ...n.players[1], hp: 2 }] };
    const dead = step({ ...low, time: 99_999 }, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'player' } });
    expect(dead.players[1].hp).toBe(0);
  });
  it('相手の場にいない uid・自分の場にいない uid では攻撃できない', () => {
    let [s, b] = place(withHand(['herald', 'herald', 'herald', 'herald']), 1, 0, 'herald');
    const [s2, a] = place(s, 0, 0, 'herald');
    s = s2;
    expect(step(s, { type: 'attack', p: 0, uid: b.uid, target: { kind: 'player' } })).toBe(s);
    expect(step(s, { type: 'attack', p: 0, uid: 9999, target: { kind: 'player' } })).toBe(s);
    expect(step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'unit', uid: 9999 } })).toBe(s);
  });
});

describe('ブロッカー', () => {
  it('ブロッカーがいるとブロッカーしか狙えない（プレイヤーも不可）', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    let a: Unit, g: Unit, h: Unit;
    [s, a] = place(s, 0, 0, 'craftsman');
    [s, g] = place(s, 1, 0, 'guard');
    [s, h] = place(s, 1, 1, 'herald');
    expect(legalTargets(s, 0)).toEqual([{ kind: 'unit', uid: g.uid }]);
    expect(isLegalTarget(s, 0, { kind: 'player' })).toBe(false);
    expect(isLegalTarget(s, 0, { kind: 'unit', uid: h.uid })).toBe(false);
    expect(step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'player' } })).toBe(s);
    expect(step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'unit', uid: h.uid } })).toBe(s);
    const n = step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'unit', uid: g.uid } });
    expect(n).not.toBe(s);
    expect(findUnit(n.players[1], g.uid)!.unit.hp).toBe(CARDS.guard.hp - 3);
  });
  it('ブロッカーがいなければ全員とプレイヤーを狙える', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    let h: Unit;
    [s, h] = place(s, 1, 3, 'herald');
    expect(legalTargets(s, 0)).toEqual([{ kind: 'player' }, { kind: 'unit', uid: h.uid }]);
  });
  it('ブロッカーが倒れたら素通しになる', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    let a: Unit, g: Unit;
    [s, a] = place(s, 0, 0, 'architect');
    [s, g] = place(s, 1, 0, 'guard', 1);
    s = step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'unit', uid: g.uid } });
    expect(isLegalTarget(s, 0, { kind: 'player' })).toBe(true);
  });
});

describe('決着', () => {
  it('HP 0 で決着。以後は何もできない', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    let a: Unit;
    [s, a] = place(s, 0, 0, 'architect');
    s = { ...s, players: [s.players[0], { ...s.players[1], hp: 6 }] };
    s = step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'player' } });
    expect(s.result).toEqual({ winner: 0, reason: 'hp' });
    expect(s.events.at(-1)!.kind).toBe('end');
    // 何もできない
    expect(tick(s, 1000)).toBe(s);
    expect(step(s, { type: 'summon', p: 0, handIndex: 0, slot: 1 })).toBe(s);
    expect(step({ ...s, time: 99_999 }, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'player' } }).players[1].hp).toBe(0);
    const frozen = { ...s, time: 99_999 };
    expect(step(frozen, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'player' } })).toBe(frozen);
  });
  it('時間切れは HP の多い方の勝ち', () => {
    let s = fresh();
    s = { ...s, players: [{ ...s.players[0], hp: 10 }, { ...s.players[1], hp: 7 }] };
    s = tick(s, MATCH_MS + 5000);
    expect(s.time).toBe(MATCH_MS);
    expect(s.result).toEqual({ winner: 0, reason: 'time' });
    const t = tick({ ...fresh(), players: [{ ...fresh().players[0], hp: 3 }, fresh().players[1]] }, MATCH_MS);
    expect(t.result).toEqual({ winner: 1, reason: 'time' });
  });
  it('時間切れで同じ HP は引き分け', () => {
    const s = tick(fresh(), MATCH_MS);
    expect(s.result).toEqual({ winner: null, reason: 'time' });
  });
  it('両者 HP 0 は引き分け', () => {
    // 相手の場のカードを倒すのではなく、状態を直接作って確かめる
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    let a: Unit;
    [s, a] = place(s, 0, 0, 'herald');
    s = { ...s, players: [{ ...s.players[0], hp: 0 }, { ...s.players[1], hp: 1 }] };
    s = step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'player' } });
    expect(s.result).toEqual({ winner: null, reason: 'hp' });
  });
  it('決定的: 同じ入力から同じ結果', () => {
    expect(createGame([STARTER_DECK, STARTER_DECK], 7)).toEqual(createGame([STARTER_DECK, STARTER_DECK], 7));
    expect(createGame([STARTER_DECK, STARTER_DECK], 7).players[0].hand).not.toEqual(
      createGame([STARTER_DECK, STARTER_DECK], 8).players[0].hand,
    );
  });
});
