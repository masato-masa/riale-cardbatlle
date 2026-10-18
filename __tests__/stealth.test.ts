// ステルス: 自分で攻撃するまで、選んで狙うものの対象にならず、壁にも数えない。全体に当たるものは当たる。
import { describe, expect, it } from 'vitest';

import { CARDS, STARTER_DECK, abilityLines, type CardId } from '../src/game/cards';
import {
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
import { WINDUP_MS, COIN_MAX, FIELD_SLOTS } from '../src/game/rules';

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

function withHand(hand: CardId[]): GameState {
  const s = fresh();
  const mk = (p: 0 | 1) => ({ ...s.players[p], hand, coins: COIN_MAX });
  return { ...s, players: [mk(0), mk(1)] };
}

function place(s: GameState, p: PlayerIndex, slot: number, card: CardId, hp?: number): [GameState, Unit] {
  const ab = CARDS[card].ab;
  const unit: Unit = {
    uid: s.nextUid,
    card,
    hp: hp ?? CARDS[card].hp,
    readyAt: 0,
    barrier: !!ab.barrier,
    stealth: !!ab.stealth,
    pulseAt: ab.pulse ? s.time + ab.pulse.everyMs : null,
  };
  const field = [...s.players[p].field];
  field[slot] = unit;
  const pl = { ...s.players[p], field };
  const players: GameState['players'] = p === 0 ? [pl, s.players[1]] : [s.players[0], pl];
  return [{ ...s, players, nextUid: s.nextUid + 1 }, unit];
}

const HAND4: CardId[] = ['herald', 'herald', 'herald', 'herald'];

describe('ステルス', () => {
  it('買収者はステルスを持ち、召喚すると立つ。説明にも出る', () => {
    expect(CARDS.spy.ab.stealth).toBe(true);
    const s = step(withHand(['spy', 'herald', 'herald', 'herald']), { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(s.players[0].field[0]!.stealth).toBe(true);
    expect(abilityLines('spy').some((l) => l.includes('ステルス'))).toBe(true);
  });

  it('攻撃の対象に選べない（legalTargets・isLegalTarget・attack）。ほかのカードとプレイヤーは選べる', () => {
    let [s, a] = place(withHand(HAND4), 0, 0, 'craftsman');
    let sp: Unit, h: Unit;
    [s, sp] = place(s, 1, 0, 'spy');
    [s, h] = place(s, 1, 1, 'herald');
    expect(legalTargets(s, 0)).toEqual([FACE, U(h.uid)]);
    expect(isLegalTarget(s, 0, U(sp.uid))).toBe(false);
    expect(hit(s, 0, a.uid, U(sp.uid))).toBe(s);
    expect(hit(s, 0, a.uid, FACE)).not.toBe(s);
  });

  it('壁に数えない: 場がうまっていても、ステルスが混じれば壁ではない', () => {
    let s = withHand(HAND4);
    for (let i = 0; i < FIELD_SLOTS - 1; i++) [s] = place(s, 1, i, 'guard');
    [s] = place(s, 1, FIELD_SLOTS - 1, 'herald');
    expect(isWalled(s.players[1])).toBe(true);
    [s] = place(s, 1, FIELD_SLOTS - 1, 'spy');
    expect(isWalled(s.players[1])).toBe(false);
    const [t, a] = place(s, 0, 0, 'craftsman');
    expect(isLegalTarget(t, 0, FACE)).toBe(false); // 衛兵（ブロッカー）がいるので顔は不可
    void a;
    let u = withHand(HAND4);
    for (let i = 0; i < FIELD_SLOTS - 1; i++) [u] = place(u, 1, i, 'herald');
    [u] = place(u, 1, FIELD_SLOTS - 1, 'spy');
    const [v] = place(u, 0, 0, 'craftsman');
    expect(isLegalTarget(v, 0, FACE)).toBe(true);
  });

  it('召喚時の狙撃・足止・単体の呪文の対象にならない', () => {
    let [s, sp] = place(withHand(['taxman', 'informer', 'quarry', 'herald']), 1, 0, 'spy');
    const strike = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: sp.uid });
    expect(hpOf(strike, 1, sp.uid)).toBe(CARDS.spy.hp);
    expect(strike.players[0].field[0]!.card).toBe('taxman'); // 召喚は成立、空振り
    const stun = step(s, { type: 'summon', p: 0, handIndex: 1, slot: 0, target: sp.uid });
    expect(findUnit(stun.players[1], sp.uid)!.unit.readyAt).toBe(0);
    expect(stun.events.some((e) => e.kind === 'stun')).toBe(false);
    expect(summonBlock(s, 0, 2, -1, sp.uid)).toBe('target');
    expect(step(s, { type: 'summon', p: 0, handIndex: 2, slot: -1, target: sp.uid })).toBe(s);
    // 見えるカードになら撃てる
    let h: Unit;
    [s, h] = place(s, 1, 1, 'guard');
    expect(summonBlock(s, 0, 2, -1, h.uid)).toBeNull();
  });

  it('全体に当たるものは当たる: 地鳴り・顔役の攻撃時の巻き込み', () => {
    let [s, sp] = place(withHand(['quake', 'herald', 'herald', 'herald']), 1, 0, 'spy', 9);
    const q = step(s, { type: 'summon', p: 0, handIndex: 0, slot: -1 });
    expect(hpOf(q, 1, sp.uid)).toBe(9 - 2);

    let [t, boss] = place(withHand(HAND4), 0, 0, 'boss');
    let g: Unit, sp2: Unit;
    [t, g] = place(t, 1, 0, 'guard');
    [t, sp2] = place(t, 1, 1, 'spy', 9);
    const n = hit(t, 0, boss.uid, U(g.uid));
    expect(hpOf(n, 1, sp2.uid)).toBe(9 - CARDS.boss.ab.splash!);
    expect(findUnit(n.players[1], sp2.uid)!.unit.stealth).toBe(true); // 当たっても解けない
  });

  it('自分で攻撃したら解ける（顔でもカードでも）。解けた後は選ばれる', () => {
    let [s, sp] = place(withHand(HAND4), 1, 0, 'spy', 9);
    let v: Unit;
    [s, v] = place(s, 0, 0, 'craftsman');
    expect(isLegalTarget(s, 0, U(sp.uid))).toBe(false);
    const n = hit(s, 1, sp.uid, FACE);
    expect(findUnit(n.players[1], sp.uid)!.unit.stealth).toBe(false);
    expect(isLegalTarget(n, 0, U(sp.uid))).toBe(true);
    const m = hit(s, 1, sp.uid, U(v.uid));
    expect(findUnit(m.players[1], sp.uid)!.unit.stealth).toBe(false);
    // 攻撃されても（全体でも）解けない: 相手が攻撃したのでは変わらない
    expect(findUnit(hit(s, 0, v.uid, FACE).players[1], sp.uid)!.unit.stealth).toBe(true);
  });

  it('奇襲と組み合わせ: ステルスのまま顔へ +1', () => {
    const [s, sp] = place(withHand(HAND4), 1, 0, 'spy');
    const n = hit(s, 1, sp.uid, FACE);
    expect(n.players[0].hp).toBe(s.players[0].hp - CARDS.spy.atk - (CARDS.spy.ab.faceBonus ?? 0));
  });

  it('砦の砲撃は、いちばん HP が低くてもステルスを避ける', () => {
    let [s] = place(withHand(HAND4), 0, 0, 'fortress');
    let sp: Unit, g: Unit;
    [s, sp] = place(s, 1, 0, 'spy', 1);
    [s, g] = place(s, 1, 1, 'guard', 5);
    const every = CARDS.fortress.ab.pulse!.everyMs;
    const n = tick(s, every);
    expect(hpOf(n, 1, sp.uid)).toBe(1);
    expect(hpOf(n, 1, g.uid)).toBe(5 - (CARDS.fortress.ab.pulse as { amount: number }).amount);
    // ステルスしかいなければ何も起きない
    const [t] = place(withHand(HAND4), 0, 0, 'fortress');
    const [t2, sp2] = place(t, 1, 0, 'spy', 1);
    const m = tick(t2, every);
    expect(hpOf(m, 1, sp2.uid)).toBe(1);
  });
});
