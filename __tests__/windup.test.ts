// 溜め: 攻撃・呪文・召喚時の狙撃・足止は、選んでから WINDUP_MS 後に効く。攻撃元や対象が先に消えたら中断。
import { describe, expect, it } from 'vitest';

import { CARDS, STARTER_DECK, type CardId } from '../src/game/cards';
import {
  attackBlock,
  createGame,
  findUnit,
  step,
  type GameState,
  type PlayerIndex,
  type Target,
  type Unit,
} from '../src/game/engine';
import { COIN_MAX, PLAYER_HP, WINDUP_MS } from '../src/game/rules';

const fresh = (): GameState => createGame([STARTER_DECK, STARTER_DECK], 1);
const tick = (s: GameState, dt: number): GameState => step(s, { type: 'tick', dt });
const atk = (s: GameState, p: PlayerIndex, uid: number, target: Target): GameState =>
  step(s, { type: 'attack', p, uid, target });
const U = (uid: number): Target => ({ kind: 'unit', uid });
const FACE: Target = { kind: 'player' };
const hpOf = (s: GameState, p: PlayerIndex, uid: number): number | undefined => findUnit(s.players[p], uid)?.unit.hp;
const HAND4: CardId[] = ['herald', 'herald', 'herald', 'herald'];

function withHand(hand: CardId[], coins = COIN_MAX): GameState {
  const s = fresh();
  const mk = (p: 0 | 1) => ({ ...s.players[p], hand, coins });
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
    reserved: null,
  };
  const field = [...s.players[p].field];
  field[slot] = unit;
  const pl = { ...s.players[p], field };
  const players: GameState['players'] = p === 0 ? [pl, s.players[1]] : [s.players[0], pl];
  return [{ ...s, players, nextUid: s.nextUid + 1 }, unit];
}

describe('攻撃の溜め', () => {
  it('選んだ時点ではダメージが入らず、クールタイムに入りステルスが解け、溜めに積まれる', () => {
    const [s, a] = place(withHand(HAND4), 0, 0, 'spy');
    expect(s.players[0].field[0]!.stealth).toBe(true);
    const n = atk(s, 0, a.uid, FACE);
    expect(n.players[1].hp).toBe(PLAYER_HP);
    expect(n.pending).toHaveLength(1);
    expect(n.pending[0]).toMatchObject({ kind: 'attack', uid: a.uid, at: s.time + WINDUP_MS });
    expect(n.events.some((e) => e.kind === 'windup')).toBe(true);
    expect(n.events.some((e) => e.kind === 'attack')).toBe(false);
    const me = findUnit(n.players[0], a.uid)!.unit;
    expect(me.stealth).toBe(false);
    expect(me.readyAt).toBe(s.time + CARDS.spy.cd);
  });

  it('WINDUP_MS の直前までは効かず、WINDUP_MS で効く（溜めは空になる）', () => {
    const [s, a] = place(withHand(HAND4), 0, 0, 'spy');
    let n = atk(s, 0, a.uid, FACE);
    n = tick(n, WINDUP_MS - 1);
    expect(n.players[1].hp).toBe(PLAYER_HP);
    n = tick(n, 1);
    expect(n.players[1].hp).toBe(PLAYER_HP - CARDS.spy.atk - (CARDS.spy.ab.faceBonus ?? 0));
    expect(n.pending).toHaveLength(0);
    expect(n.events.some((e) => e.kind === 'attack' && e.uid === a.uid)).toBe(true);
  });

  it('溜め中の同じユニットは、再び攻撃できない（祝祭でクールタイムが消えても）', () => {
    let [s, a] = place(withHand(['festival', 'herald', 'herald', 'herald']), 0, 0, 'craftsman');
    s = atk(s, 0, a.uid, FACE);
    expect(attackBlock(s, 0, a.uid, FACE)).toBe('cooldown');
    // 祝祭の効果でクールタイムが消えた状態を直接作る（溜めはまだ残っている）
    s = { ...s, players: [{ ...s.players[0], field: s.players[0].field.map((u) => (u ? { ...u, readyAt: 0 } : u)) }, s.players[1]] };
    expect(attackBlock(s, 0, a.uid, FACE)).toBe('cooldown'); // 溜め中は選べない
    expect(atk(s, 0, a.uid, FACE)).toBe(s);
  });

  it('攻撃元が先に倒れたら中断（ダメージなし・cancel イベント）', () => {
    let s = withHand(HAND4);
    let a: Unit, b: Unit, t: Unit;
    [s, a] = place(s, 0, 0, 'herald', 1);
    [s, b] = place(s, 1, 0, 'spy');
    [s, t] = place(s, 1, 1, 'guard', 9);
    s = atk(s, 1, b.uid, U(a.uid)); // 先に積まれる: a を倒す
    s = atk(s, 0, a.uid, U(t.uid)); // a の攻撃は後
    s = tick(s, WINDUP_MS);
    expect(findUnit(s.players[0], a.uid)).toBeNull();
    expect(hpOf(s, 1, t.uid)).toBe(9);
    expect(s.events.some((e) => e.kind === 'cancel' && e.pending.kind === 'attack' && e.pending.uid === a.uid)).toBe(true);
  });

  it('対象が先に倒れたら中断（別の攻撃で倒れた場合）。攻撃元のクールタイムは戻らない', () => {
    let s = withHand(HAND4);
    let a: Unit, c: Unit, t: Unit;
    [s, a] = place(s, 0, 0, 'craftsman');
    [s, c] = place(s, 0, 1, 'taxman');
    [s, t] = place(s, 1, 0, 'herald', 2);
    s = atk(s, 0, a.uid, U(t.uid)); // 先に積まれて t を倒す
    s = atk(s, 0, c.uid, U(t.uid)); // 対象が消えるので中断
    s = tick(s, WINDUP_MS);
    expect(findUnit(s.players[1], t.uid)).toBeNull();
    expect(s.events.filter((e) => e.kind === 'cancel')).toHaveLength(1);
    expect(findUnit(s.players[0], c.uid)!.unit.hp).toBe(CARDS.taxman.hp); // 反撃もなし
    expect(findUnit(s.players[0], c.uid)!.unit.readyAt).toBeGreaterThan(s.time);
  });

  it('決着したら溜めは消える', () => {
    let s = withHand(HAND4);
    let a: Unit, b: Unit;
    [s, a] = place(s, 0, 0, 'craftsman');
    [s, b] = place(s, 1, 0, 'craftsman');
    s = { ...s, players: [s.players[0], { ...s.players[1], hp: 1 }] };
    s = atk(s, 0, a.uid, FACE);
    s = atk(s, 1, b.uid, FACE);
    expect(s.pending).toHaveLength(2);
    s = tick(s, WINDUP_MS);
    expect(s.result).toEqual({ winner: 0, reason: 'hp' });
    expect(s.pending).toHaveLength(0);
    expect(s.players[0].hp).toBe(PLAYER_HP); // 後の攻撃は起きない
  });
});

describe('呪文の溜め', () => {
  it('単体: コインは選んだ時点で払われ山札へ戻る。効果は WINDUP_MS 後', () => {
    let [s, t] = place(withHand(['quarry', 'herald', 'herald', 'herald']), 1, 0, 'architect');
    s = { ...s, players: [s.players[0], { ...s.players[1], field: s.players[1].field.map((u) => (u ? { ...u, hp: 9 } : u)) }] };
    const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: -1, target: t.uid });
    expect(n.players[0].coins).toBe(COIN_MAX - CARDS.quarry.summon);
    expect(n.players[0].queue.at(-1)).toBe('quarry');
    expect(hpOf(n, 1, t.uid)).toBe(9);
    expect(n.events.some((e) => e.kind === 'spell')).toBe(false);
    const m = tick(tick(n, WINDUP_MS - 1), 1);
    expect(hpOf(m, 1, t.uid)).toBe(9 - 5);
    expect(m.events.some((e) => e.kind === 'spell')).toBe(true);
  });

  it('単体: 対象が先に消えたら中断。コインは戻らない', () => {
    let s = withHand(['quarry', 'herald', 'herald', 'herald']);
    let a: Unit, t: Unit;
    [s, a] = place(s, 0, 0, 'craftsman');
    [s, t] = place(s, 1, 0, 'herald', 2);
    s = atk(s, 0, a.uid, U(t.uid)); // 先に積まれて t を倒す
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: -1, target: t.uid });
    const paid = s.players[0].coins;
    s = tick(s, WINDUP_MS);
    expect(findUnit(s.players[1], t.uid)).toBeNull();
    expect(s.events.some((e) => e.kind === 'cancel' && e.pending.kind === 'spell')).toBe(true);
    expect(s.events.some((e) => e.kind === 'spell')).toBe(false);
    expect(s.players[0].coins).toBeLessThanOrEqual(paid + 1); // 払ったまま（たまった分だけ増える）
    expect(s.players[0].queue.at(-1)).toBe('quarry');
  });

  it('範囲（地鳴り）は必ず効く: 溜めの間に相手の場が変わっても', () => {
    let s = withHand(['quake', 'herald', 'herald', 'herald']);
    let g: Unit;
    [s, g] = place(s, 1, 0, 'guard', 9);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: -1 });
    // 溜めの間に新しいカードが出ても当たる
    let late: Unit;
    [s, late] = place(s, 1, 1, 'guard', 9);
    s = tick(s, WINDUP_MS);
    expect(hpOf(s, 1, g.uid)).toBe(9 - 2);
    expect(hpOf(s, 1, late.uid)).toBe(9 - 2);
    expect(s.events.some((e) => e.kind === 'cancel')).toBe(false);
  });
});

describe('召喚時の狙撃・足止の溜め', () => {
  it('ユニットはすぐ出るが、効果は WINDUP_MS 後（ability イベント）', () => {
    let [s, t] = place(withHand(['taxman', 'herald', 'herald', 'herald']), 1, 0, 'guard', 9);
    const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: t.uid });
    expect(n.players[0].field[0]!.card).toBe('taxman');
    expect(hpOf(n, 1, t.uid)).toBe(9);
    expect(n.pending[0]).toMatchObject({ kind: 'ability', target: t.uid });
    const m = tick(n, WINDUP_MS);
    expect(hpOf(m, 1, t.uid)).toBe(9 - 2);
    expect(m.events.some((e) => e.kind === 'ability' && e.target === t.uid)).toBe(true);
  });

  it('対象が先に消えたら中断', () => {
    let [s, a] = place(withHand(['taxman', 'herald', 'herald', 'herald']), 0, 0, 'craftsman');
    let t: Unit;
    [s, t] = place(s, 1, 0, 'herald', 2);
    s = atk(s, 0, a.uid, U(t.uid));
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 1, target: t.uid });
    s = tick(s, WINDUP_MS);
    expect(s.events.some((e) => e.kind === 'cancel' && e.pending.kind === 'ability')).toBe(true);
    expect(s.events.some((e) => e.kind === 'ability')).toBe(false);
  });

  it('召喚したユニットが先に倒れたら中断（砦の砲撃で倒れる）', () => {
    let [s, t] = place(withHand(['taxman', 'herald', 'herald', 'herald']), 1, 0, 'guard', 9);
    let f: Unit;
    [s, f] = place(s, 1, 1, 'fortress');
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: t.uid });
    // 出したばかりの徴税官を HP 1 にして、砦の砲撃（溜めより先）で倒す
    const field = s.players[0].field.map((u) => (u ? { ...u, hp: 1 } : u));
    const foeField = s.players[1].field.map((u) => (u && u.uid === f.uid ? { ...u, pulseAt: WINDUP_MS / 2 } : u));
    s = { ...s, players: [{ ...s.players[0], field }, { ...s.players[1], field: foeField }] };
    s = tick(s, WINDUP_MS / 2); // 砲撃が先に起きる
    s = tick(s, WINDUP_MS / 2);
    expect(s.players[0].field[0]).toBeNull();
    expect(hpOf(s, 1, t.uid)).toBe(9);
    expect(s.events.some((e) => e.kind === 'cancel' && e.pending.kind === 'ability')).toBe(true);
  });
});
