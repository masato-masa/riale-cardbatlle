import { describe, expect, it } from 'vitest';

import { CARDS, STARTER_DECK, type CardId } from '../src/game/cards';
import {
  createGame,
  findUnit,
  step as rawStep,
  summonBlock,
  summonTargets,
  type GameState,
  type PlayerIndex,
  type Target,
  type Unit,
} from '../src/game/engine';
import { COIN_MAX, WINDUP_MS } from '../src/game/rules';

/** 登場時の効果が溜め（WINDUP_MS）で遅れて効くので、操作のあとに明けるところまで進める。 */
const step: typeof rawStep = (state, action) => {
  const n = rawStep(state, action);
  if (action.type === 'tick' || n.pending.length <= state.pending.length) return n;
  return rawStep(n, { type: 'tick', dt: WINDUP_MS });
};

const fresh = (): GameState => createGame([STARTER_DECK, STARTER_DECK], 1);
const U = (uid: number): Target => ({ kind: 'unit', uid });
const hpOf = (s: GameState, p: PlayerIndex, uid: number): number | undefined => findUnit(s.players[p], uid)?.unit.hp;
const gone = (s: GameState, p: PlayerIndex, uid: number): boolean => !findUnit(s.players[p], uid);

function withHand(hand: CardId[], coins = COIN_MAX): GameState {
  const s = fresh();
  const mk = (p: 0 | 1) => ({ ...s.players[p], hand, coins });
  return { ...s, players: [mk(0), mk(1)] };
}

function place(s: GameState, p: PlayerIndex, slot: number, card: CardId, hp?: number, readyAt = 0): [GameState, Unit] {
  const unit: Unit = {
    uid: s.nextUid,
    card,
    hp: hp ?? CARDS[card].hp,
    readyAt,
    barrier: !!CARDS[card].ab.barrier,
    stealth: !!CARDS[card].ab.stealth,
    pulseAt: null,
    reserved: null,
  };
  const field = [...s.players[p].field];
  field[slot] = unit;
  const pl = { ...s.players[p], field };
  const players: GameState['players'] = p === 0 ? [pl, s.players[1]] : [s.players[0], pl];
  return [{ ...s, players, nextUid: s.nextUid + 1 }, unit];
}

describe('基準のスタッツ（能力なしはスタッツ合計がコスト×2+1 ほど、能力ぶん減らす）', () => {
  it('調整したカードの数値', () => {
    const stat = (id: CardId) => `${CARDS[id].summon}/${CARDS[id].atk}/${CARDS[id].hp}`;
    expect(stat('herald')).toBe('1/1/1'); // 速攻
    expect(stat('guard')).toBe('2/1/3'); // ブロッカー
    expect(stat('blockader')).toBe('4/2/4');
    expect(stat('craftsman')).toBe('3/3/3');
    expect(stat('double')).toBe('3/3/2');
    expect(stat('taxman')).toBe('4/3/3');
    expect(stat('architect')).toBe('5/4/5');
  });

  it('コスト 6 以上のユニット（コスト/クールタイム/攻撃/HP）', () => {
    const row = (id: CardId) => [CARDS[id].summon, CARDS[id].cd / 1000, CARDS[id].atk, CARDS[id].hp].join('/');
    expect(row('veteran')).toBe('6/15/7/7');
    expect(row('executioner')).toBe('7/20/4/8');
    expect(row('strategist')).toBe('8/10/8/8');
    expect(row('colossus')).toBe('9/15/7/10');
    expect(row('archmage')).toBe('10/30/10/10');
    expect(CARDS.veteran.ab).toEqual({});
    expect(CARDS.colossus.ab).toEqual({ blocker: true });
  });
});

describe('登場時に敵を選ぶカードは、選ばないと置けない', () => {
  it('選べる敵がいて target が無い・違う相手なら配置失敗。選べば置ける', () => {
    const [s, foe] = place(withHand(['executioner', 'herald', 'herald', 'herald']), 1, 0, 'craftsman');
    expect(summonBlock(s, 0, 0, 0)).toBe('target');
    expect(step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 })).toBe(s);
    expect(summonBlock(s, 0, 0, 0, 9999)).toBe('target');
    expect(summonBlock(s, 0, 0, 0, foe.uid)).toBeNull();
  });

  it('敵がいなければ target なしで置ける', () => {
    const s = withHand(['executioner', 'herald', 'herald', 'herald']);
    expect(summonBlock(s, 0, 0, 0)).toBeNull();
    expect(step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 }).players[0].field[0]!.card).toBe('executioner');
  });

  it('ステルス中の敵は選べる敵に数えない。全員ステルスなら置ける', () => {
    const [s, spy] = place(withHand(['executioner', 'herald', 'herald', 'herald']), 1, 0, 'spy');
    expect(spy.stealth).toBe(true);
    expect(summonTargets(s.players[1], 'executioner')).toHaveLength(0);
    expect(summonBlock(s, 0, 0, 0)).toBeNull();
  });

  it('足止・破壊は敵ユニットだけ。建築物は選べない（狙撃は選べる）', () => {
    let [s] = place(withHand(['informer', 'herald', 'herald', 'herald']), 1, 0, 'wall');
    expect(summonTargets(s.players[1], 'informer')).toHaveLength(0);
    expect(summonTargets(s.players[1], 'executioner')).toHaveLength(0);
    expect(summonTargets(s.players[1], 'taxman')).toHaveLength(1);
    expect(summonBlock(s, 0, 0, 0)).toBeNull(); // 選べる敵がいないので置ける
    [s] = place(s, 1, 1, 'guard');
    expect(summonBlock(s, 0, 0, 0)).toBe('target');
  });
});

describe('ネロ: 登場時、敵ユニット 1 体を破壊', () => {
  it('選んだ敵を（結界・軽減を無視して）倒す。ほかの敵は残る', () => {
    let [s, a] = place(withHand(['executioner', 'herald', 'herald', 'herald']), 1, 0, 'double'); // 結界つき
    let b: Unit;
    [s, b] = place(s, 1, 1, 'blockader'); // 軽減つき
    const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: a.uid });
    expect(gone(n, 1, a.uid)).toBe(true);
    expect(gone(n, 1, b.uid)).toBe(false);
    expect(n.events.some((e) => e.kind === 'death' && e.uid === a.uid)).toBe(true);
  });

  it('溜めの間に対象が消えたら中断（コインは戻らない）', () => {
    let [s, a] = place(withHand(['executioner', 'herald', 'herald', 'herald']), 1, 0, 'guard');
    const n = rawStep(s, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: a.uid });
    expect(n.pending).toHaveLength(1);
    // 溜めの間に別の手段で対象が倒れた想定
    const field = [...n.players[1].field];
    field[0] = null;
    const m = rawStep({ ...n, players: [n.players[0], { ...n.players[1], field }] }, { type: 'tick', dt: WINDUP_MS });
    expect(m.events.some((e) => e.kind === 'cancel')).toBe(true);
    expect(m.players[0].field[0]!.card).toBe('executioner');
  });
});

describe('ルナ: 登場時、自分のほかのユニットのクールタイムを 10 秒減らす', () => {
  it('減らす（0 未満にならない）。ユニット以外・相手のカードは変わらない', () => {
    let [s] = place(withHand(['strategist', 'herald', 'herald', 'herald']), 0, 1, 'veteran', undefined, 25_000);
    let near: Unit, foe: Unit;
    [s, near] = place(s, 0, 2, 'guard', undefined, 4_000);
    [s, foe] = place(s, 1, 0, 'guard', undefined, 30_000);
    const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(findUnit(n.players[0], s.players[0].field[1]!.uid)!.unit.readyAt).toBe(15_000);
    expect(findUnit(n.players[0], near.uid)!.unit.readyAt).toBe(n.time); // 4 秒しか残っていない → 0
    expect(findUnit(n.players[1], foe.uid)!.unit.readyAt).toBe(30_000);
    expect(n.events.filter((e) => e.kind === 'cdcut')).toHaveLength(2);
  });
});

describe('オルガ: 登場時、ほかのユニットを敵味方すべて破壊', () => {
  it('ユニットはすべて消え、建築物と自分は残る。死亡時の効果は起きる', () => {
    let [s, a] = place(withHand(['archmage', 'herald', 'herald', 'herald']), 0, 1, 'guard');
    let b: Unit, w: Unit, d: Unit;
    [s, b] = place(s, 1, 0, 'craftsman');
    [s, w] = place(s, 1, 1, 'wall');
    [s, d] = place(s, 1, 2, 'usurer'); // 死亡時: 相手プレイヤーに 2
    const hp0 = s.players[0].hp;
    const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(gone(n, 0, a.uid)).toBe(true);
    expect(gone(n, 1, b.uid)).toBe(true);
    expect(gone(n, 1, d.uid)).toBe(true);
    expect(gone(n, 1, w.uid)).toBe(false); // 建築物は残る
    expect(n.players[0].field[0]!.card).toBe('archmage');
    expect(n.players[0].hp).toBe(hp0 - (CARDS.usurer.ab.onDeath as { amount: number }).amount);
    expect(n.events.some((e) => e.kind === 'wipe')).toBe(true);
  });
});

describe('攻撃が中断されても、クールタイムはやり直しにならない', () => {
  it('対象が消えて中断 → 攻撃元は選ぶ前の状態に戻り、すぐ攻撃できる', () => {
    let [s, a] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'craftsman');
    let t: Unit;
    [s, t] = place(s, 1, 0, 'guard');
    const before = findUnit(s.players[0], a.uid)!.unit.readyAt;
    let n = rawStep(s, { type: 'attack', p: 0, uid: a.uid, target: U(t.uid) });
    expect(findUnit(n.players[0], a.uid)!.unit.readyAt).toBeGreaterThan(n.time); // 選んだ直後はクールタイム中
    // 対象が溜めの間にいなくなる
    const field = [...n.players[1].field];
    field[0] = null;
    n = rawStep({ ...n, players: [n.players[0], { ...n.players[1], field }] }, { type: 'tick', dt: WINDUP_MS });
    expect(n.events.some((e) => e.kind === 'cancel')).toBe(true);
    expect(findUnit(n.players[0], a.uid)!.unit.readyAt).toBe(before);
    expect(hpOf(n, 0, a.uid)).toBe(CARDS.craftsman.hp); // 反撃もない
  });

  it('中断されなければ、クールタイムはそのまま進む', () => {
    let [s, a] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'craftsman');
    let t: Unit;
    [s, t] = place(s, 1, 0, 'guard', 20);
    const n = step(s, { type: 'attack', p: 0, uid: a.uid, target: U(t.uid) });
    expect(findUnit(n.players[0], a.uid)!.unit.readyAt).toBeGreaterThan(n.time - 1);
  });
});
