import { describe, expect, it } from 'vitest';

import { CARDS, STARTER_DECK, type CardId } from '../src/game/cards';
import {
  createGame,
  findUnit,
  step,
  summonBlock,
  type GameEvent,
  type GameState,
  type PlayerIndex,
  type Target,
  type Unit,
} from '../src/game/engine';
import { COIN_MAX, INTERFERE_MS, PLAYER_HP, WINDUP_MS } from '../src/game/rules';

const fresh = (): GameState => createGame([STARTER_DECK, STARTER_DECK], 1);
const U = (uid: number): Target => ({ kind: 'unit', uid });
const FACE: Target = { kind: 'player' };
const unitOf = (s: GameState, p: PlayerIndex, uid: number): Unit | undefined => findUnit(s.players[p], uid)?.unit;
const cancels = (s: GameState) => s.events.filter((e): e is Extract<GameEvent, { kind: 'cancel' }> => e.kind === 'cancel');

function withHand(s: GameState, p: PlayerIndex, hand: CardId[], coins = COIN_MAX): GameState {
  const pl = { ...s.players[p], hand: [...hand, ...s.players[p].hand.slice(hand.length)], coins };
  return { ...s, players: p === 0 ? [pl, s.players[1]] : [s.players[0], pl] };
}

function place(s: GameState, p: PlayerIndex, slot: number, card: CardId, extra: Partial<Unit> = {}): [GameState, Unit] {
  const ab = CARDS[card].ab;
  const unit: Unit = {
    uid: s.nextUid,
    card,
    hp: CARDS[card].hp,
    readyAt: 0,
    barrier: !!ab.barrier,
    stealth: !!ab.stealth,
    pulseAt: null,
    reserved: null,
    ...extra,
  };
  const field = [...s.players[p].field];
  field[slot] = unit;
  const pl = { ...s.players[p], field };
  return [{ ...s, players: p === 0 ? [pl, s.players[1]] : [s.players[0], pl], nextUid: s.nextUid + 1 }, unit];
}

/** 自分(0)の攻撃元 atk を相手(1)の標的 tgt へ溜め中にした盤面。 */
function attacking(attacker: CardId, tgt: CardId): { s: GameState; a: Unit; t: Unit } {
  let s = fresh();
  let a: Unit;
  let t: Unit;
  [s, a] = place(s, 0, 0, attacker);
  [s, t] = place(s, 1, 0, tgt);
  s = step(s, { type: 'attack', p: 0, uid: a.uid, target: U(t.uid) });
  expect(s.pending.some((x) => x.kind === 'attack')).toBe(true);
  return { s, a, t };
}

describe('割り込み（ブロッカーが溜め中の攻撃を中断させる）', () => {
  it('溜めの途中でブロッカーを出すと、その場で攻撃が中断され、クールタイムは戻る', () => {
    const { s, a } = attacking('footman', 'recruit');
    const readyBefore = (s.pending[0] as Extract<GameState['pending'][number], { kind: 'attack' }>).readyBefore;
    let n = withHand(s, 1, ['guard']);
    n = step(n, { type: 'summon', p: 1, handIndex: 0, slot: 1 });
    const c = cancels(n);
    expect(c.length).toBe(1);
    expect(c[0]!.reason).toBe('blocked');
    expect(n.pending.length).toBe(0);
    // 妨害された攻撃元は、選ぶ前に戻したうえで、クールタイムが 5 秒増える
    expect(unitOf(n, 0, a.uid)!.readyAt).toBe(Math.max(readyBefore, n.time) + INTERFERE_MS);
  });

  it('ヴィゴ: 中断させた攻撃元に 2 ダメージ', () => {
    const { s, a } = attacking('lancer', 'recruit');
    let n = withHand(s, 1, ['warder']);
    n = step(n, { type: 'summon', p: 1, handIndex: 0, slot: 1 });
    const c = cancels(n)[0]!;
    expect(c.by).toBeDefined();
    expect(unitOf(n, 0, a.uid)!.hp).toBe(CARDS.lancer.hp - 2);
  });

  it('ミーア: 中断させた攻撃元のクールタイム +4 秒', () => {
    const { s, a } = attacking('lancer', 'recruit');
    const before = unitOf(s, 0, a.uid)!.readyAt;
    const readyBefore = (s.pending[0] as Extract<GameState['pending'][number], { kind: 'attack' }>).readyBefore;
    let n = withHand(s, 1, ['shieldmaid']);
    n = step(n, { type: 'summon', p: 1, handIndex: 0, slot: 1 });
    expect(unitOf(n, 0, a.uid)!.readyAt).toBe(Math.max(readyBefore, n.time) + INTERFERE_MS + 4000);
    expect(before).toBeGreaterThan(0);
  });

  it('ザック: 中断させるとコイン +2', () => {
    const { s } = attacking('lancer', 'recruit');
    let n = withHand(s, 1, ['ambusher'], 6);
    n = step(n, { type: 'summon', p: 1, handIndex: 0, slot: 1 });
    expect(n.players[1].coins).toBe(6 - CARDS.ambusher.summon + 2);
  });

  it('ブロッカーでない召喚では中断されない', () => {
    const { s } = attacking('lancer', 'recruit');
    let n = withHand(s, 1, ['recruit']);
    n = step(n, { type: 'summon', p: 1, handIndex: 0, slot: 1 });
    expect(cancels(n).length).toBe(0);
    expect(n.pending.length).toBe(1);
  });
});

describe('攻撃中断時の能力', () => {
  it('ボルク: 攻撃が中断されたらクールタイムがなくなる', () => {
    const { s, a } = attacking('diehard', 'recruit');
    let n = withHand(s, 1, ['guard']);
    n = step(n, { type: 'summon', p: 1, handIndex: 0, slot: 1 });
    expect(unitOf(n, 0, a.uid)!.readyAt).toBe(n.time);
  });

  it('ジーナ: 攻撃が中断されたら攻撃力・HP +1', () => {
    const { s, a } = attacking('berserk', 'recruit');
    let n = withHand(s, 1, ['guard']);
    n = step(n, { type: 'summon', p: 1, handIndex: 0, slot: 1 });
    expect(unitOf(n, 0, a.uid)!.hp).toBe(CARDS.berserk.hp + 1);
  });
});

describe('上書き（生贄）', () => {
  function overwrite(old: CardId, incoming: CardId, coins = 2): GameState {
    let s = fresh();
    [s] = place(s, 0, 0, old);
    s = withHand(s, 0, [incoming], coins + CARDS[incoming].summon);
    return step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
  }
  it('ユラ: 生贄でコイン +3', () => {
    const n = overwrite('offering', 'recruit', 2);
    expect(n.events.some((e) => e.kind === 'sacrifice')).toBe(true);
    expect(n.players[0].coins).toBe(2 + 3);
  });
  it('ガイ: 生贄で敵プレイヤーに 4 ダメージ', () => {
    const n = overwrite('bomber', 'recruit');
    expect(n.players[1].hp).toBe(PLAYER_HP - 4);
  });
  it('リーゼ: 生贄で上書きしたカードを強化する', () => {
    const n = overwrite('heir', 'recruit');
    const u = n.players[0].field[0]!;
    const b = CARDS.heir.ab.onReplaced;
    expect(u.hp).toBe(CARDS.recruit.hp + (b?.kind === 'buffNew' ? b.hp : 0));
  });
  it('フェン: 生贄で自分の HP を 6 回復', () => {
    let s = fresh();
    [s] = place(s, 0, 0, 'phoenix');
    s = { ...s, players: [{ ...s.players[0], hp: 10 }, s.players[1]] };
    s = withHand(s, 0, ['recruit'], COIN_MAX);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(s.players[0].hp).toBe(16);
  });
  it('封印されていると生贄の能力は起きない', () => {
    let s = fresh();
    [s] = place(s, 0, 0, 'bomber', { sealed: true });
    s = withHand(s, 0, ['recruit']);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(s.players[1].hp).toBe(PLAYER_HP);
  });
  it('クロウ: 上書き召喚で +2/+2', () => {
    const n = overwrite('recruit', 'usurper');
    expect(n.players[0].field[0]!.hp).toBe(CARDS.usurper.hp + 2);
  });
  it('レグ: 上書き召喚で、上書きされたカードのコストの半分が戻る', () => {
    const n = overwrite('captain', 'conqueror', 0);
    expect(n.players[0].coins).toBe(0 + Math.floor(CARDS.captain.summon / 2));
  });
  it('上書きで入れ替えたカードを狙っていた攻撃は、かわされる', () => {
    let s = fresh();
    let a: Unit;
    let t: Unit;
    [s, a] = place(s, 1, 0, 'footman');
    [s, t] = place(s, 0, 0, 'recruit');
    s = step(s, { type: 'attack', p: 1, uid: a.uid, target: U(t.uid) });
    s = withHand(s, 0, ['knight']);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    const c = cancels(s);
    expect(c.length).toBe(1);
    expect(c[0]!.reason).toBe('dodge');
    expect(s.pending.length).toBe(0);
  });
});

describe('パリィ（呪文）', () => {
  it('相手の溜め中の攻撃が無いときは使えない', () => {
    const s = withHand(fresh(), 0, ['parry']);
    expect(summonBlock(s, 0, 0, -1)).toBe('noattack');
  });
  it('溜め中の攻撃をすべて中断させ、攻撃元のクールタイムを延ばす', () => {
    let s = fresh();
    let a: Unit;
    let b: Unit;
    [s, a] = place(s, 1, 0, 'footman');
    [s, b] = place(s, 0, 0, 'recruit');
    s = step(s, { type: 'attack', p: 1, uid: a.uid, target: U(b.uid) });
    const readyBefore = (s.pending[0] as Extract<GameState['pending'][number], { kind: 'attack' }>).readyBefore;
    s = withHand(s, 0, ['parry']);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: -1 });
    expect(cancels(s)[0]!.reason).toBe('parry');
    expect(s.pending.length).toBe(0);
    expect(unitOf(s, 1, a.uid)!.readyAt).toBe(Math.max(readyBefore, s.time) + 5000);
    // 溜めの時間が過ぎても、攻撃は起きない
    const n = step(s, { type: 'tick', dt: WINDUP_MS });
    expect(unitOf(n, 0, b.uid)!.hp).toBe(CARDS.recruit.hp);
    void FACE;
  });
});

describe('追加カード（ピエロ・ロデリク・セドリック・ヴェラ）', () => {
  it('ピエロ: 上書き召喚するとすぐ攻撃できる', () => {
    let s = fresh();
    [s] = place(s, 0, 0, 'recruit');
    s = withHand(s, 0, ['trickster']);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(s.players[0].field[0]!.readyAt).toBe(s.time);
  });
  it('ロデリク: 生贄でコイン +5', () => {
    let s = fresh();
    [s] = place(s, 0, 0, 'monarch');
    s = withHand(s, 0, ['recruit'], 2);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(s.players[0].coins).toBe(2 - CARDS.recruit.summon + 5);
  });
  it('セドリック: 割り込みで 2 ダメージ', () => {
    const { s, a } = attacking('knight', 'recruit');
    let n = withHand(s, 1, ['riposte']);
    n = step(n, { type: 'summon', p: 1, handIndex: 0, slot: 1 });
    expect(unitOf(n, 0, a.uid)!.hp).toBe(CARDS.knight.hp - 2);
  });
  it('ヴェラ: 攻撃が中断されると攻撃力 +2', () => {
    const { s, a } = attacking('avenger', 'recruit');
    let n = withHand(s, 1, ['guard']);
    n = step(n, { type: 'summon', p: 1, handIndex: 0, slot: 1 });
    expect(cancels(n).length).toBe(1);
    expect(unitOf(n, 0, a.uid)!.atkBuff).toBe(2);
  });
});

describe('討伐時', () => {
  it('ロッコ: 敵ユニットを倒すとコイン +2', () => {
    let s = fresh();
    let a: Unit;
    let t: Unit;
    [s, a] = place(s, 0, 0, 'hunter');
    [s, t] = place(s, 1, 0, 'recruit', { hp: 1 });
    s = { ...s, players: [{ ...s.players[0], coins: 3 }, s.players[1]] };
    s = step(s, { type: 'attack', p: 0, uid: a.uid, target: U(t.uid) });
    s = step(s, { type: 'tick', dt: WINDUP_MS });
    expect(unitOf(s, 1, t.uid)).toBeUndefined();
    expect(s.players[0].coins).toBeGreaterThanOrEqual(5);
  });
  it('グリム: 倒すと +1/+1。倒せなければ起きない', () => {
    let s = fresh();
    let a: Unit;
    let t: Unit;
    [s, a] = place(s, 0, 0, 'slayer');
    [s, t] = place(s, 1, 0, 'recruit', { hp: 9 });
    s = step(s, { type: 'attack', p: 0, uid: a.uid, target: U(t.uid) });
    s = step(s, { type: 'tick', dt: WINDUP_MS });
    expect(unitOf(s, 0, a.uid)!.atkBuff ?? 0).toBe(0);
  });
});

describe('待ち伏せ（呪文）', () => {
  it('民兵をすぐ出して、溜め中の攻撃を割り込みで止める', () => {
    const { s, a } = attacking('knight', 'recruit');
    let n = withHand(s, 1, ['ambush']);
    n = step(n, { type: 'summon', p: 1, handIndex: 0, slot: -1 });
    expect(cancels(n)[0]!.reason).toBe('blocked');
    expect(n.players[1].field.some((u) => u?.card === 'militia')).toBe(true);
    expect(unitOf(n, 0, a.uid)!.hp).toBe(CARDS.knight.hp);
  });
  it('空き枠が無いと使えない', () => {
    let s = fresh();
    for (let i = 0; i < 3; i++) [s] = place(s, 0, i, 'recruit');
    s = withHand(s, 0, ['ambush']);
    expect(summonBlock(s, 0, 0, -1)).toBe('slot');
  });
});

describe('妨害（クールタイム +5 秒）と妨害耐性', () => {
  it('チェンジでかわされた攻撃元も +5 秒', () => {
    let s = fresh();
    let a: Unit;
    let t: Unit;
    [s, a] = place(s, 1, 0, 'footman');
    [s, t] = place(s, 0, 0, 'recruit');
    s = step(s, { type: 'attack', p: 1, uid: a.uid, target: U(t.uid) });
    const rb = (s.pending[0] as Extract<GameState['pending'][number], { kind: 'attack' }>).readyBefore;
    s = withHand(s, 0, ['knight']);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(unitOf(s, 1, a.uid)!.readyAt).toBe(Math.max(rb, s.time) + INTERFERE_MS);
  });
  it('チェンジで入った妨害時の能力持ちは、かわしたときに効く（ジーナ型でなくホルス）', () => {
    let s = fresh();
    let a: Unit;
    let t: Unit;
    [s, a] = place(s, 1, 0, 'lancer');
    [s, t] = place(s, 0, 0, 'recruit');
    s = step(s, { type: 'attack', p: 1, uid: a.uid, target: U(t.uid) });
    s = withHand(s, 0, ['warder']);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(unitOf(s, 1, a.uid)!.hp).toBe(CARDS.lancer.hp - 2);
  });
  it('妨害耐性: 妨害されてもクールタイムは増えない', () => {
    const { s, a } = attacking('immune1', 'recruit');
    const rb = (s.pending[0] as Extract<GameState['pending'][number], { kind: 'attack' }>).readyBefore;
    let n = withHand(s, 1, ['guard']);
    n = step(n, { type: 'summon', p: 1, handIndex: 0, slot: 1 });
    expect(cancels(n).length).toBe(1);
    expect(unitOf(n, 0, a.uid)!.readyAt).toBe(rb);
  });
  it('妨害時に強化（ウォール）', () => {
    const { s } = attacking('lancer', 'recruit');
    let n = withHand(s, 1, ['wallguard']);
    n = step(n, { type: 'summon', p: 1, handIndex: 0, slot: 1 });
    const w = n.players[1].field[1]!;
    expect(w.hp).toBe(CARDS.wallguard.hp + 1);
  });
});
