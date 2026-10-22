import { describe, expect, it } from 'vitest';

import { CARDS, STARTER_DECK, type CardId } from '../src/game/cards';
import {
  attackOf,
  coinBoostOf,
  createGame,
  findUnit,
  isLegalTarget,
  isWalled,
  legalTargets,
  step as rawStep,
  summonBlock,
  type GameState,
  type PlayerIndex,
  type Target,
  type Unit,
} from '../src/game/engine';
import {
  COIN_MAX,
  COIN_MS,
  COIN_START,
  FAST_COOLDOWN_FROM_MS,
  FIELD_SLOTS,
  MATCH_MS,
  PLAYER_ATK,
  PLAYER_HP,
  WINDUP_MS,
} from '../src/game/rules';

const STUN = (CARDS.informer.ab.onSummon as { ms: number }).ms;
/** 即時に効く前提のテスト用: 攻撃・呪文・召喚のあとに溜め（WINDUP_MS）を明けるところまで進める。溜めそのものを見るテストは rawStep を使う。 */
const step: typeof rawStep = (state, action) => {
  const n = rawStep(state, action);
  if (action.type === 'tick' || n.pending.length <= state.pending.length) return n;
  return rawStep(n, { type: 'tick', dt: WINDUP_MS });
};

const fresh = (): GameState => createGame([STARTER_DECK, STARTER_DECK], 1);
const tick = (s: GameState, dt: number): GameState => step(s, { type: 'tick', dt });
const hit = (s: GameState, p: PlayerIndex, uid: number, target: Target): GameState =>
  step(s, { type: 'attack', p, uid, target });
const U = (uid: number): Target => ({ kind: 'unit', uid });
const FACE: Target = { kind: 'player' };
const hpOf = (s: GameState, p: PlayerIndex, uid: number): number | undefined => findUnit(s.players[p], uid)?.unit.hp;
const gone = (s: GameState, p: PlayerIndex, uid: number): boolean => !findUnit(s.players[p], uid);
const HAND4: CardId[] = ['herald', 'herald', 'herald', 'herald'];
const withHp = (s: GameState, p: PlayerIndex, hp: number): GameState => {
  const players: GameState['players'] = [...s.players];
  players[p] = { ...players[p], hp };
  return { ...s, players };
};
const withCoins = (s: GameState, p: PlayerIndex, coins: number): GameState => {
  const players: GameState['players'] = [...s.players];
  players[p] = { ...players[p], coins };
  return { ...s, players };
};

/** 手札を指定して、コインを満タンにした状態。 */
function withHand(hand: CardId[], coins = COIN_MAX): GameState {
  const s = fresh();
  const mk = (p: 0 | 1) => ({ ...s.players[p], hand, coins });
  return { ...s, players: [mk(0), mk(1)] };
}

/** 場へ直接置く（召喚の待ち時間なしで攻撃できる）。 */
function place(s: GameState, p: PlayerIndex, slot: number, card: CardId, hp?: number, readyAt = 0): [GameState, Unit] {
  const unit: Unit = { uid: s.nextUid, card, hp: hp ?? CARDS[card].hp, readyAt, barrier: !!CARDS[card].ab.barrier,
    stealth: !!CARDS[card].ab.stealth,
    pulseAt: CARDS[card].ab.pulse ? s.time + CARDS[card].ab.pulse!.everyMs : null,
    reserved: null,
  };
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
  it('最後の 1 分でも、コインは 2 倍にならない（膠着を防ぐため）', () => {
    let s = { ...fresh(), time: FAST_COOLDOWN_FROM_MS };
    s = { ...s, players: [{ ...s.players[0], coins: 0 }, { ...s.players[1], coins: 0 }] };
    s = tick(s, COIN_MS);
    expect(s.players[0].coins).toBeCloseTo(1);
  });
  it('最後の 1 分は、クールタイムが 2 倍の速さで減る。境目をまたぐ tick も、刻んでも同じ', () => {
    const mk = (time: number) => {
      let [s, u] = place(withHand(HAND4), 0, 0, 'knight');
      s = { ...s, time };
      s = { ...s, players: [{ ...s.players[0], field: s.players[0].field.map((x) => (x ? { ...x, readyAt: time + 10_000 } : x)) }, s.players[1]] } as typeof s;
      return [s, u] as const;
    };
    // 通常: 4 秒たつと残り 6 秒
    let [a, ua] = mk(FAST_COOLDOWN_FROM_MS - 20_000);
    a = tick(a, 4000);
    expect(a.players[0].field[0]!.readyAt - a.time).toBe(6000);
    // 最後の 1 分: 4 秒で 8 秒ぶん減る（残り 2 秒）
    let [b] = mk(FAST_COOLDOWN_FROM_MS);
    b = tick(b, 4000);
    expect(b.players[0].field[0]!.readyAt - b.time).toBe(2000);
    // 境目をまたぐ: 手前 2 秒 + 先 2 秒 → 2 + 4 = 6 秒ぶん減る（残り 4 秒）
    let [c] = mk(FAST_COOLDOWN_FROM_MS - 2000);
    c = tick(c, 4000);
    expect(c.players[0].field[0]!.readyAt - c.time).toBe(4000);
    // 刻んでも同じ
    let [d] = mk(FAST_COOLDOWN_FROM_MS - 2000);
    for (let i = 0; i < 80; i++) d = tick(d, 50);
    expect(d.players[0].field[0]!.readyAt - d.time).toBe(4000);
    void ua;
  });
  it('dt が 0 以下なら何も変わらない', () => {
    const s = fresh();
    expect(tick(s, 0)).toBe(s);
    expect(tick(s, -5)).toBe(s);
  });
});

describe('召喚', () => {
  it('コインが足りないと出せない', () => {
    const s = withHand(['boss', 'herald', 'herald', 'herald'], CARDS.boss.summon - 1);
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
    expect(pl.field[2]).toMatchObject({ card: 'miner', hp: CARDS.miner.hp, readyAt: n.time + Math.round(CARDS.miner.cd / 2) });
    expect(n.players[1]).toEqual(s.players[1]);
  });
  it('範囲外の枠には出せない', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(step(s, { type: 'summon', p: 0, handIndex: 1, slot: FIELD_SLOTS })).toBe(s);
    expect(step(s, { type: 'summon', p: 0, handIndex: 1, slot: -1 })).toBe(s);
  });
  it('存在しない手札位置は無視', () => {
    const s = withHand(['herald', 'herald', 'herald', 'herald']);
    expect(step(s, { type: 'summon', p: 0, handIndex: 9, slot: 0 })).toBe(s);
  });
  it('自分のカードの上に召喚すると、元のカードを除いて置き換える（死亡時は起きない）', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    let old: Unit;
    [s, old] = place(s, 0, 0, 'usurer');
    for (let i = 1; i < FIELD_SLOTS; i++) [s] = place(s, 0, i, 'guard');
    expect(summonBlock(s, 0, 0, 0)).toBeNull();
    const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(n.players[0].field[0]!.card).toBe('herald');
    expect(findUnit(n.players[0], old.uid)).toBeNull();
    expect(n.players[1].hp).toBe(PLAYER_HP); // 高利貸の死亡時は起きない
    expect(n.events.some((e) => e.kind === 'replace' && e.uid === old.uid)).toBe(true);
    expect(n.events.some((e) => e.kind === 'death')).toBe(false);
  });
  it('デッキの枚数は保たれる（手札 + queue = 10）', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    s = step(s, { type: 'summon', p: 0, handIndex: 1, slot: 1 });
    expect(s.players[0].hand.length + s.players[0].queue.length).toBe(8);
  });
});

describe('攻撃', () => {
  it('召喚したあとはクールタイム分たつまで攻撃できない', () => {
    let s = withHand(['guard', 'herald', 'herald', 'herald']);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    const uid = s.players[0].field[0]!.uid;
    const early = step(s, { type: 'attack', p: 0, uid, target: { kind: 'player' } });
    expect(early).toBe(s);
    const half = Math.round(CARDS.guard.cd / 2); // 召喚直後のクールタイムは半分
    s = tick(s, half - 1);
    expect(step(s, { type: 'attack', p: 0, uid, target: { kind: 'player' } })).toBe(s);
    s = tick(s, 1);
    const landed = step(s, { type: 'attack', p: 0, uid, target: { kind: 'player' } });
    expect(landed.players[1].hp).toBe(PLAYER_HP - CARDS.guard.atk);
  });
  it('攻撃してもコインは減らない（アタックコストは無い）。攻撃後はクールタイムの間だけ攻撃できない', () => {
    let [s, u] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'craftsman');
    const coins = s.players[0].coins;
    s = step(s, { type: 'attack', p: 0, uid: u.uid, target: { kind: 'player' } });
    expect(s.players[0].coins).toBe(coins);
    expect(s.players[1].hp).toBe(PLAYER_HP - CARDS.craftsman.atk);
    expect('attackCost' in CARDS.craftsman).toBe(false);
    const blocked = step(s, { type: 'attack', p: 0, uid: u.uid, target: { kind: 'player' } });
    expect(blocked).toBe(s);
    s = tick(s, CARDS.craftsman.cd - WINDUP_MS - 1); // 攻撃を選んだ時刻から cd
    expect(step(s, { type: 'attack', p: 0, uid: u.uid, target: { kind: 'player' } })).toBe(s);
    // ターゲットは残っているので、明けた瞬間に同じ対象へ自動で攻撃が始まる
    s = tick(s, 1);
    expect(s.pending.some((x) => x.kind === 'attack' && x.uid === u.uid)).toBe(true);
    s = tick(s, WINDUP_MS);
    expect(s.players[1].hp).toBe(PLAYER_HP - 2 * CARDS.craftsman.atk);
  });
  it('コインが 0 でも攻撃できる', () => {
    const [s, u] = place(withHand(HAND4, 0), 0, 0, 'architect');
    expect(step(s, { type: 'attack', p: 0, uid: u.uid, target: { kind: 'player' } })).not.toBe(s);
  });
  it('カード同士は相互ダメージ。死んだカードは場から消える', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    let a: Unit, b: Unit;
    [s, a] = place(s, 0, 0, 'craftsman'); // 2/4（討伐 +2）
    [s, b] = place(s, 1, 0, 'miner'); // 1/2
    const n = step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'unit', uid: b.uid } });
    expect(findUnit(n.players[1], b.uid)).toBeNull(); // 4 ダメージで死亡
    expect(findUnit(n.players[0], a.uid)!.unit.hp).toBe(CARDS.craftsman.hp - CARDS.miner.atk); // 反撃 1
    expect(n.players[1].hp).toBe(PLAYER_HP);
    expect(n.events.some((e) => e.kind === 'death' && e.uid === b.uid)).toBe(true);
  });
  it('相打ちなら両方消える', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    let a: Unit, b: Unit;
    [s, a] = place(s, 0, 0, 'taxman');
    [s, b] = place(s, 1, 0, 'craftsman', 9); // 反撃で taxman は倒れ、職人は残る
    const n = step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'unit', uid: b.uid } });
    expect(findUnit(n.players[0], a.uid)).toBeNull();
    expect(findUnit(n.players[1], b.uid)!.unit.hp).toBe(9 - CARDS.taxman.atk);
    const [s2, c] = place(s, 0, 1, 'taxman');
    const [s3, e] = place(s2, 1, 1, 'taxman');
    const n2 = step(s3, { type: 'attack', p: 0, uid: c.uid, target: { kind: 'unit', uid: e.uid } });
    expect(findUnit(n2.players[0], c.uid)).toBeNull();
    expect(findUnit(n2.players[1], e.uid)).toBeNull();
  });
  it('減った HP は戻らず、攻撃したカードは生き残ればクールダウンに入る', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    let a: Unit, b: Unit;
    [s, a] = place(s, 0, 0, 'guard');
    [s, b] = place(s, 1, 0, 'herald');
    const n = step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'unit', uid: b.uid } });
    const me = findUnit(n.players[0], a.uid)!.unit;
    expect(me.hp).toBe(CARDS.guard.hp - CARDS.herald.atk);
    expect(me.readyAt).toBe(n.time - WINDUP_MS + CARDS.guard.cd);
    expect(tick(n, 60_000).players[0].field[0]!.hp).toBe(CARDS.guard.hp - CARDS.herald.atk);
  });
  it('プレイヤーも攻撃力 PLAYER_ATK で反撃する（遠隔は受けない）。HP は 0 未満にならない', () => {
    let s = withHand(['herald', 'herald', 'herald', 'herald']);
    let a: Unit, r: Unit;
    [s, a] = place(s, 0, 0, 'architect');
    [s, r] = place(s, 0, 1, 'inspector');
    const n = step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'player' } });
    expect(findUnit(n.players[0], a.uid)!.unit.hp).toBe(CARDS.architect.hp - PLAYER_ATK);
    const nr = step(s, { type: 'attack', p: 0, uid: r.uid, target: { kind: 'player' } });
    expect(findUnit(nr.players[0], r.uid)!.unit.hp).toBe(CARDS.inspector.hp);
    expect(n.players[1].hp).toBe(PLAYER_HP - CARDS.architect.atk);
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
    [s, g] = place(s, 1, 0, 'guard', 9);
    [s, h] = place(s, 1, 1, 'herald');
    expect(legalTargets(s, 0)).toEqual([{ kind: 'unit', uid: g.uid }]);
    expect(isLegalTarget(s, 0, { kind: 'player' })).toBe(false);
    expect(isLegalTarget(s, 0, { kind: 'unit', uid: h.uid })).toBe(false);
    expect(step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'player' } })).toBe(s);
    expect(step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'unit', uid: h.uid } })).toBe(s);
    const n = step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'unit', uid: g.uid } });
    expect(n).not.toBe(s);
    expect(findUnit(n.players[1], g.uid)!.unit.hp).toBe(9 - CARDS.craftsman.atk - 2);
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
    s = { ...s, players: [s.players[0], { ...s.players[1], hp: CARDS.architect.atk }] };
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
  it('両者 HP 0 は引き分け（相打ちの遺言）', () => {
    // 高利貸どうし: 攻撃で相手の高利貸が倒れて遺言、反撃で自分の高利貸も倒れて遺言
    let s = withHand(HAND4);
    let a: Unit, b: Unit;
    [s, a] = place(s, 0, 0, 'usurer', 1);
    [s, b] = place(s, 1, 0, 'usurer', 1);
    s = { ...s, players: [{ ...s.players[0], hp: 2 }, { ...s.players[1], hp: 2 }] };
    s = step(s, { type: 'attack', p: 0, uid: a.uid, target: { kind: 'unit', uid: b.uid } });
    expect(s.result).toEqual({ winner: null, reason: 'hp' });
  });
  it('決定的: 同じ入力から同じ結果', () => {
    expect(createGame([STARTER_DECK, STARTER_DECK], 7)).toEqual(createGame([STARTER_DECK, STARTER_DECK], 7));
    expect(createGame([STARTER_DECK, STARTER_DECK], 7).players[0].hand).not.toEqual(
      createGame([STARTER_DECK, STARTER_DECK], 8).players[0].hand,
    );
  });
});

describe('能力: 攻撃まわり', () => {
  it('速攻: 召喚してすぐ攻撃できる（ほかのカードはクールタイム分待つ）', () => {
    let s = withHand(['herald', 'spy', 'herald', 'herald']);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    const h = s.players[0].field[0]!;
    expect(h.readyAt).toBe(s.time);
    expect(hit(s, 0, h.uid, FACE).players[1].hp).toBe(PLAYER_HP - CARDS.herald.atk);
    s = step(s, { type: 'summon', p: 0, handIndex: 1, slot: 1 });
    expect(s.players[0].field[1]!.readyAt).toBe(s.time + Math.round(CARDS.spy.cd / 2));
  });

  it('奇襲: プレイヤーへのダメージだけ +1（カード相手には乗らない）。能力は残してあるが、今はこの能力を持つカードは無い', () => {
    // カゲマルの奇襲はバランス調整で外した。能力そのものの動きは、持たせて確かめる
    const ab = CARDS.spy.ab as { faceBonus?: number };
    ab.faceBonus = 1;
    try {
      let [s, a] = place(withHand(HAND4), 0, 0, 'spy');
      let b: Unit;
      [s, b] = place(s, 1, 0, 'herald', 5);
      expect(hit(s, 0, a.uid, FACE).players[1].hp).toBe(PLAYER_HP - CARDS.spy.atk - 1);
      expect(hpOf(hit(s, 0, a.uid, U(b.uid)), 1, b.uid)).toBe(5 - CARDS.spy.atk);
    } finally {
      delete ab.faceBonus;
    }
  });

  it('カゲマル: ステルスだけで、顔へのダメージは攻撃力のまま', () => {
    const [s, a] = place(withHand(HAND4), 0, 0, 'spy');
    expect(CARDS.spy.ab.faceBonus).toBeUndefined();
    expect(hit(s, 0, a.uid, FACE).players[1].hp).toBe(PLAYER_HP - CARDS.spy.atk);
  });

  it('討伐: カードへのダメージ +2、顔には乗らない', () => {
    let [s, a] = place(withHand(HAND4), 0, 0, 'craftsman');
    let g: Unit;
    [s, g] = place(s, 1, 0, 'guard', 9);
    expect(hpOf(hit(s, 0, a.uid, U(g.uid)), 1, g.uid)).toBe(9 - CARDS.craftsman.atk - 2);
    const [s2, c] = place(withHand(HAND4), 0, 0, 'craftsman');
    expect(hit(s2, 0, c.uid, FACE).players[1].hp).toBe(PLAYER_HP - CARDS.craftsman.atk);
  });

  it('討伐: 攻撃時だけ。殴られたときの反撃には乗らない', () => {
    let [s, d] = place(withHand(HAND4), 1, 0, 'craftsman');
    let att: Unit;
    [s, att] = place(s, 0, 0, 'guard', 9);
    const n = hit(s, 0, att.uid, U(d.uid));
    expect(hpOf(n, 0, att.uid)).toBe(9 - CARDS.craftsman.atk);
  });

  it('鉄壁: 受けるダメージ -1。0 まで下がっても負にはならない', () => {
    let [s, a] = place(withHand(HAND4), 0, 0, 'taxman');
    let b: Unit;
    [s, b] = place(s, 1, 0, 'blockader');
    expect(hpOf(hit(s, 0, a.uid, U(b.uid)), 1, b.uid)).toBe(CARDS.blockader.hp - (CARDS.taxman.atk - 1));
    let w: Unit;
    [s, w] = place(s, 0, 1, 'miner'); // 攻撃力 1 → 鉄壁で 0
    const n = hit(s, 0, w.uid, U(b.uid));
    expect(hpOf(n, 1, b.uid)).toBe(CARDS.blockader.hp);
    expect(n.events.find((e) => e.kind === 'damage' && e.p === 1)).toMatchObject({ amount: 0, guard: 'armor' });
  });

  it('結界: 召喚時から付いていて、最初に受けるダメージを 1 回だけ 0 にする', () => {
    let s = withHand(['double', 'herald', 'herald', 'herald']);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(s.players[0].field[0]!.barrier).toBe(true);

    let [t, d] = place(withHand(HAND4), 1, 0, 'double');
    let a1: Unit, a2: Unit;
    [t, a1] = place(t, 0, 0, 'guard');
    [t, a2] = place(t, 0, 1, 'guard');
    const first = hit(t, 0, a1.uid, U(d.uid));
    expect(hpOf(first, 1, d.uid)).toBe(CARDS.double.hp); // 防いだ
    expect(findUnit(first.players[1], d.uid)!.unit.barrier).toBe(false);
    expect(first.events.some((e) => e.kind === 'damage' && e.guard === 'barrier')).toBe(true);
    const second = hit(first, 0, a2.uid, U(d.uid)); // 2 回目は通る
    expect(hpOf(second, 1, d.uid)).toBe(CARDS.double.hp - CARDS.guard.atk);
  });

  it('結界: 自分から攻撃したときの反撃も防ぐ（1 回ぶん消える）', () => {
    let [s, a] = place(withHand(HAND4), 0, 0, 'double');
    let b: Unit;
    [s, b] = place(s, 1, 0, 'taxman');
    const n = hit(s, 0, a.uid, U(b.uid));
    expect(hpOf(n, 0, a.uid)).toBe(CARDS.double.hp);
    expect(findUnit(n.players[0], a.uid)!.unit.barrier).toBe(false);
  });

  it('遠隔: 自分から攻撃したときは反撃を受けない。殴られたときは受ける', () => {
    let [s, a] = place(withHand(HAND4), 0, 0, 'inspector');
    let g: Unit;
    [s, g] = place(s, 1, 0, 'guard', 9);
    const n = hit(s, 0, a.uid, U(g.uid));
    expect(hpOf(n, 0, a.uid)).toBe(CARDS.inspector.hp);
    expect(hpOf(n, 1, g.uid)).toBe(9 - CARDS.inspector.atk);
    let i: Unit, att: Unit;
    [s, i] = place(withHand(HAND4), 1, 0, 'inspector');
    [s, att] = place(s, 0, 0, 'guard', 9);
    const m = hit(s, 0, att.uid, U(i.uid));
    expect(hpOf(m, 0, att.uid)).toBe(9 - CARDS.inspector.atk);
  });

  it('顔役: 攻撃時、ほかの敵カード全員に 1 ダメージ。反撃は狙った相手からだけ', () => {
    let [s, b] = place(withHand(HAND4), 0, 0, 'boss');
    let g: Unit, c: Unit, m: Unit;
    [s, g] = place(s, 1, 0, 'guard', 6); // 1/6 ブロッカー（狙う相手）
    [s, c] = place(s, 1, 1, 'craftsman', 6); // 討伐持ち、狙わない
    [s, m] = place(s, 1, 2, 'miner', 6);
    const n = hit(s, 0, b.uid, U(g.uid));
    expect(hpOf(n, 1, g.uid)).toBe(6 - CARDS.boss.atk);
    expect(hpOf(n, 1, c.uid)).toBe(6 - 1); // ブロッカーの陰でも当たる
    expect(hpOf(n, 1, m.uid)).toBe(6 - 1);
    expect(hpOf(n, 0, b.uid)).toBe(CARDS.boss.hp - CARDS.guard.atk); // 狙った衛兵の 1 だけ
    expect(n.events.filter((e) => e.kind === 'damage' && e.p === 1)).toHaveLength(3);
  });

  it('顔役: 巻き込みにも結界と鉄壁が効く。倒れたカードの死亡時は起きる', () => {
    let [s, b] = place(withHand(HAND4), 0, 0, 'boss');
    let g: Unit, d: Unit, u: Unit, bl: Unit;
    [s, g] = place(s, 1, 0, 'guard');
    [s, d] = place(s, 1, 1, 'double');
    [s, u] = place(s, 1, 2, 'usurer', 1);
    [s, bl] = place(s, 1, 3, 'blockader', 6);
    const n = hit(s, 0, b.uid, U(g.uid));
    expect(hpOf(n, 1, d.uid)).toBe(CARDS.double.hp); // 結界
    expect(findUnit(n.players[1], d.uid)!.unit.barrier).toBe(false);
    expect(hpOf(n, 1, bl.uid)).toBe(6); // 鉄壁で 1 - 1 = 0
    expect(gone(n, 1, u.uid)).toBe(true);
    expect(n.players[0].hp).toBe(PLAYER_HP - 2); // 死亡時
  });

  it('顔役: プレイヤーへの攻撃ではカードに当たらない', () => {
    let [s, b] = place(withHand(HAND4), 0, 0, 'boss');
    let m: Unit;
    [s, m] = place(s, 1, 0, 'miner');
    const n = hit(s, 0, b.uid, FACE);
    expect(n.players[1].hp).toBe(PLAYER_HP - CARDS.boss.atk);
    expect(hpOf(n, 1, m.uid)).toBe(CARDS.miner.hp);
  });

  it('鼓舞: 商館（建築物）は攻撃力 0 のまま、ほかの味方ユニットの攻撃力 +1', () => {
    let [s, f] = place(withHand(HAND4), 0, 0, 'tradingHouse');
    let h: Unit;
    [s, h] = place(s, 0, 1, 'spy');
    expect(attackOf(s.players[0], f)).toBe(0);
    expect(attackOf(s.players[0], h)).toBe(CARDS.spy.atk + 1);
    expect(hit(s, 0, h.uid, FACE).players[1].hp).toBe(PLAYER_HP - CARDS.spy.atk - 1); // 鼓舞
  });

  it('鼓舞: 反撃にも乗る。商館が 2 枚なら足される', () => {
    let [s] = place(withHand(HAND4), 1, 0, 'tradingHouse');
    let h: Unit, att: Unit;
    [s, h] = place(s, 1, 1, 'craftsman');
    [s, att] = place(s, 0, 0, 'guard', 9);
    const n = hit(s, 0, att.uid, U(h.uid));
    expect(hpOf(n, 0, att.uid)).toBe(9 - (CARDS.craftsman.atk + 1));
    [s] = place(s, 1, 2, 'tradingHouse');
    expect(attackOf(s.players[1], h)).toBe(CARDS.craftsman.atk + 2);
  });
});

describe('能力: 召喚時・コイン・遺言', () => {
  const B = CARDS.banker.ab.coinBoost!;

  it('増収: 場にいる間だけコインのたまる速さが増える（重なる）。上限は 10', () => {
    let s = withCoins(withCoins(withHand(HAND4), 0, 0), 1, 0);
    [s] = place(s, 0, 0, 'banker');
    expect(coinBoostOf(s.players[0])).toBeCloseTo(1 + B);
    expect(tick(s, COIN_MS).players[0].coins).toBeCloseTo(1 + B);
    expect(tick(s, COIN_MS).players[1].coins).toBeCloseTo(1);
    [s] = place(s, 0, 1, 'banker');
    expect(tick(s, COIN_MS).players[0].coins).toBeCloseTo(1 + 2 * B);
    expect(tick(withCoins(s, 0, 9.9), 60_000).players[0].coins).toBe(COIN_MAX);
  });

  it('増収: 終盤にも効く。倒れたら元に戻る', () => {
    let s = withCoins({ ...withHand(HAND4), time: FAST_COOLDOWN_FROM_MS }, 0, 0);
    let b: Unit, a: Unit;
    [s, b] = place(s, 0, 0, 'banker');
    expect(tick(s, COIN_MS).players[0].coins).toBeCloseTo(1 + B);
    [s, a] = place(s, 1, 0, 'craftsman'); // 討伐込みで 4 ダメージ = 銀行家の HP
    s = hit(s, 1, a.uid, U(b.uid));
    expect(gone(s, 0, b.uid)).toBe(true);
    expect(coinBoostOf(s.players[0])).toBe(1);
  });

  it('仲間: 召喚すると空き枠の先頭に見習い（すべて 1）が出る。山札には入らない', () => {
    let s = withHand(['miner', 'herald', 'herald', 'herald']);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 1 });
    const f = s.players[0].field;
    expect(f[1]!.card).toBe('miner');
    expect(f[0]).toMatchObject({ card: 'apprentice', hp: 1 });
    expect(CARDS.apprentice).toMatchObject({ atk: 1, hp: 1, summon: 1, type: 'unit' });
    expect(s.events.some((e) => e.kind === 'summon' && e.token && e.card === 'apprentice')).toBe(true);
    expect(s.players[0].hand.length + s.players[0].queue.length).toBe(8);
    expect(s.players[0].queue.includes('apprentice')).toBe(false);
  });

  it('仲間: 空き枠が無ければ見習いは出ない', () => {
    let s = withHand(['miner', 'herald', 'herald', 'herald']);
    for (let i = 1; i < FIELD_SLOTS; i++) [s] = place(s, 0, i, 'guard');
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(s.players[0].field.filter(Boolean)).toHaveLength(FIELD_SLOTS);
    expect(s.players[0].field.some((u) => u?.card === 'apprentice')).toBe(false);
    expect(s.events.some((e) => e.kind === 'summon' && e.token)).toBe(false);
  });

  it('修復: 自分の HP を 3 回復。上限 PLAYER_HP を超えない。満タンなら出来事も出ない', () => {
    const base = withHand(['architect', 'herald', 'herald', 'herald']);
    const a = step(withHp(base, 0, PLAYER_HP - 10), { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(a.players[0].hp).toBe(PLAYER_HP - 7);
    expect(a.events.find((e) => e.kind === 'heal')).toMatchObject({ p: 0, amount: 3 });
    const b = step(withHp(base, 0, PLAYER_HP - 1), { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(b.players[0].hp).toBe(PLAYER_HP);
    expect(b.events.find((e) => e.kind === 'heal')).toMatchObject({ amount: 1 });
    const c = step(base, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(c.players[0].hp).toBe(PLAYER_HP);
    expect(c.events.some((e) => e.kind === 'heal')).toBe(false);
    expect(c.players[1].hp).toBe(PLAYER_HP);
  });

  it('狙撃: 選んだ相手のカードにダメージ。ブロッカーの後ろにいても届く', () => {
    let [s, g] = place(withHand(['taxman', 'herald', 'herald', 'herald']), 1, 0, 'guard');
    let h: Unit;
    [s, h] = place(s, 1, 1, 'craftsman');
    const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: h.uid });
    expect(hpOf(n, 1, h.uid)).toBe(CARDS.craftsman.hp - 2);
    expect(hpOf(n, 1, g.uid)).toBe(CARDS.guard.hp);
    expect(n.players[1].hp).toBe(PLAYER_HP);
    expect(n.players[0].field[0]!.card).toBe('taxman');
  });

  it('狙撃: 結界は 1 回だけ防ぎ、鉄壁で 1 減る。倒せば消える', () => {
    const hand = ['taxman', 'herald', 'herald', 'herald'] as CardId[];
    const [s, d] = place(withHand(hand), 1, 0, 'double');
    const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: d.uid });
    expect(hpOf(n, 1, d.uid)).toBe(CARDS.double.hp);
    expect(findUnit(n.players[1], d.uid)!.unit.barrier).toBe(false);
    const [s2, b] = place(withHand(hand), 1, 0, 'blockader');
    const k = step(s2, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: b.uid });
    expect(hpOf(k, 1, b.uid)).toBe(CARDS.blockader.hp - (2 - 1));
    const [s3, w] = place(withHand(hand), 1, 0, 'herald', 2);
    const z = step(s3, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: w.uid });
    expect(gone(z, 1, w.uid)).toBe(true);
  });

  it('狙撃: 選べる敵がいるのに target が無い・存在しない・自分のカードなら配置失敗（コインも減らない）', () => {
    const [s, h] = place(withHand(['taxman', 'herald', 'herald', 'herald']), 1, 0, 'craftsman');
    for (const target of [undefined, 9999]) {
      expect(summonBlock(s, 0, 0, 0, target)).toBe('target');
      expect(step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0, target })).toBe(s);
    }
    const [s2, mine] = place(s, 0, 3, 'guard');
    expect(summonBlock(s2, 0, 0, 0, mine.uid)).toBe('target');
    expect(step(s2, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: mine.uid })).toBe(s2);
    expect(hpOf(s2, 1, h.uid)).toBe(CARDS.craftsman.hp);
  });

  it('狙撃: 選べる敵がいなければ、target なしで置ける（能力は空振り）', () => {
    const s = withHand(['taxman', 'herald', 'herald', 'herald']);
    expect(summonBlock(s, 0, 0, 0)).toBeNull();
    const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(n.players[0].field[0]!.card).toBe('taxman');
    expect(n.players[0].coins).toBe(COIN_MAX - CARDS.taxman.summon);
    expect(n.events.some((e) => e.kind === 'damage')).toBe(false);
  });

  it('target は狙撃・足止以外のカードでは無視される', () => {
    const [s, h] = place(withHand(HAND4), 1, 0, 'craftsman');
    const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: h.uid });
    expect(hpOf(n, 1, h.uid)).toBe(CARDS.craftsman.hp);
    expect(n.events.some((e) => e.kind === 'stun' || e.kind === 'damage')).toBe(false);
  });

  it('足止: 選んだ相手はしばらく攻撃できない。ほかのカードは動ける', () => {
    let [s, a] = place(withHand(['informer', 'herald', 'herald', 'herald']), 1, 0, 'craftsman');
    let o: Unit;
    [s, o] = place(s, 1, 1, 'guard');
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: a.uid });
    expect(s.events.some((e) => e.kind === 'stun' && e.uid === a.uid)).toBe(true);
    expect(hit(s, 1, a.uid, FACE)).toBe(s);
    expect(hit(s, 1, o.uid, FACE)).not.toBe(s);
    expect(findUnit(s.players[1], a.uid)!.unit.readyAt).toBe(WINDUP_MS + STUN);
    s = tick(s, STUN - 1);
    expect(hit(s, 1, a.uid, FACE)).toBe(s);
    s = tick(s, 1);
    expect(hit(s, 1, a.uid, FACE)).not.toBe(s);
  });

  it('足止: 待ち時間の途中なら、その後ろへ足される。target なしなら空振り', () => {
    const [s, a] = place(withHand(['informer', 'herald', 'herald', 'herald']), 1, 0, 'craftsman', undefined, 1500);
    const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: a.uid });
    expect(findUnit(n.players[1], a.uid)!.unit.readyAt).toBe(1500 + STUN);
    const m = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(findUnit(m.players[1], a.uid)!.unit.readyAt).toBe(1500);
    expect(m.events.some((e) => e.kind === 'stun')).toBe(false);
  });

  it('遺言: 倒れたら相手プレイヤーに 2 ダメージ。生きている間は何も起きない', () => {
    let [s, u] = place(withHand(HAND4), 1, 0, 'usurer');
    let a: Unit;
    [s, a] = place(s, 0, 0, 'craftsman');
    const n = hit(s, 0, a.uid, U(u.uid));
    expect(gone(n, 1, u.uid)).toBe(true);
    expect(n.players[0].hp).toBe(PLAYER_HP - 2);
    expect(n.players[1].hp).toBe(PLAYER_HP);
    const [s2, tough] = place(s, 1, 1, 'herald', 9);
    const m = hit(s2, 0, a.uid, U(u.uid));
    expect(hpOf(m, 1, tough.uid)).toBe(9);
  });

  it('遺言: 相手が壁でも通る。反撃で自滅したときも相手に飛ぶ', () => {
    let s = withHand(HAND4);
    let u: Unit, a: Unit;
    [s, u] = place(s, 1, 0, 'usurer', 1);
    for (let i = 1; i < FIELD_SLOTS; i++) [s] = place(s, 1, i, 'herald', 5);
    for (let i = 1; i < FIELD_SLOTS; i++) [s] = place(s, 0, i, 'herald', 5);
    [s, a] = place(s, 0, 0, 'craftsman', 2);
    expect(isWalled(s.players[0])).toBe(true);
    const m = hit(s, 0, a.uid, U(u.uid));
    expect(gone(m, 1, u.uid)).toBe(true);
    expect(m.players[0].hp).toBe(PLAYER_HP - 2); // 自分の壁を通って

    let [r, me] = place(withHand(HAND4), 0, 0, 'usurer', 1);
    let foe: Unit;
    [r, foe] = place(r, 1, 0, 'guard');
    for (let i = 1; i < FIELD_SLOTS; i++) [r] = place(r, 1, i, 'guard');
    expect(isWalled(r.players[1])).toBe(true);
    const k = hit(r, 0, me.uid, U(foe.uid));
    expect(gone(k, 0, me.uid)).toBe(true);
    expect(k.players[1].hp).toBe(PLAYER_HP - 2); // 相手の壁を通って
  });

  it('遺言: それで決着することもある。両者 0 なら引き分け', () => {
    let [s, u] = place(withHand(HAND4), 1, 0, 'usurer');
    let a: Unit;
    [s, a] = place(s, 0, 0, 'craftsman');
    const n = hit(withHp(s, 0, 2), 0, a.uid, U(u.uid));
    expect(n.players[0].hp).toBe(0);
    expect(n.result).toEqual({ winner: 1, reason: 'hp' });
    expect(n.events.at(-1)!.kind).toBe('end');
  });
});

describe('壁（場がうまっている間は攻撃されない）', () => {
  const walled = (blocker = false): [GameState, Unit[], Unit] => {
    let s = withHand(HAND4);
    const us: Unit[] = [];
    for (let i = 0; i < FIELD_SLOTS; i++) {
      let u: Unit;
      [s, u] = place(s, 1, i, blocker && i === 0 ? 'guard' : 'miner', 1);
      us.push(u);
    }
    let a: Unit;
    [s, a] = place(s, 0, 0, 'craftsman');
    return [s, us, a];
  };

  it('場がうまっているとプレイヤーは狙えないが、カードは狙える', () => {
    const [s, us, a] = walled();
    expect(isWalled(s.players[1])).toBe(true);
    expect(legalTargets(s, 0)).toEqual(us.map((u) => ({ kind: 'unit', uid: u.uid })));
    expect(isLegalTarget(s, 0, FACE)).toBe(false);
    expect(hit(s, 0, a.uid, FACE)).toBe(s);
    expect(hit(s, 0, a.uid, U(us[2]!.uid))).not.toBe(s);
  });

  it('壁のプレイヤーのカードは、相手プレイヤーを攻撃できる', () => {
    const [s, us] = walled();
    const n = hit(s, 1, us[0]!.uid, FACE);
    expect(n.players[0].hp).toBe(PLAYER_HP - CARDS.miner.atk);
  });

  it('1 枠空けば壁ではない。最後の 1 枚が倒れたらまた狙え、埋まればまた壁', () => {
    const [s, us, a] = walled();
    const n = hit(s, 0, a.uid, U(us[FIELD_SLOTS - 1]!.uid));
    expect(gone(n, 1, us[FIELD_SLOTS - 1]!.uid)).toBe(true);
    expect(isWalled(n.players[1])).toBe(false);
    expect(isLegalTarget(n, 0, FACE)).toBe(true);
    expect(legalTargets(n, 0)[0]).toEqual(FACE);
    const refilled = place(n, 1, FIELD_SLOTS - 1, 'miner')[0];
    expect(isLegalTarget(refilled, 0, FACE)).toBe(false);
  });

  it('壁でもブロッカーが先: ブロッカーがいればブロッカーだけ。倒れた瞬間に壁も外れる', () => {
    const [s, us, a] = walled(true);
    expect(legalTargets(s, 0)).toEqual([{ kind: 'unit', uid: us[0]!.uid }]);
    const n = hit(s, 0, a.uid, U(us[0]!.uid));
    expect(gone(n, 1, us[0]!.uid)).toBe(true);
    expect(isLegalTarget(n, 0, FACE)).toBe(true);
  });

  it('壁でも召喚時の狙撃はカードに当たり、倒せば壁が外れる', () => {
    const [s, us] = walled();
    const hand = ['taxman', 'herald', 'herald', 'herald'] as CardId[];
    const t: GameState = {
      ...s,
      players: [{ ...s.players[0], hand, coins: COIN_MAX, field: s.players[0].field.map(() => null) }, s.players[1]],
    };
    const n = step(t, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: us[1]!.uid });
    expect(gone(n, 1, us[1]!.uid)).toBe(true);
    expect(isWalled(n.players[1])).toBe(false);
  });
});
