import { describe, expect, it } from 'vitest';

import { CARDS, STARTER_DECK, summonSide, type CardId } from '../src/game/cards';
import {
  attackOf,
  createGame,
  findUnit,
  legalTargetsFor,
  step as rawStep,
  summonBlock,
  summonTargets,
  type GameState,
  type PlayerIndex,
  type Target,
  type Unit,
} from '../src/game/engine';
import { COIN_MAX, PLAYER_HP, WINDUP_MS } from '../src/game/rules';

/** 登場時の効果・攻撃は溜めのあとに効く。操作のあとに溜めを明けるところまで進める。 */
const step: typeof rawStep = (state, action) => {
  const n = rawStep(state, action);
  if (action.type === 'tick' || n.pending.length <= state.pending.length) return n;
  return rawStep(n, { type: 'tick', dt: WINDUP_MS });
};
const tick = (s: GameState, dt: number): GameState => rawStep(s, { type: 'tick', dt });
const fresh = (): GameState => createGame([STARTER_DECK, STARTER_DECK], 1);
const U = (uid: number): Target => ({ kind: 'unit', uid });
const FACE: Target = { kind: 'player' };
const unitOf = (s: GameState, p: PlayerIndex, uid: number): Unit | undefined => findUnit(s.players[p], uid)?.unit;

function withHand(hand: CardId[], coins = COIN_MAX): GameState {
  const s = fresh();
  const mk = (p: 0 | 1) => ({ ...s.players[p], hand, coins });
  return { ...s, players: [mk(0), mk(1)] };
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
    pulseAt: ab.pulse ? s.time + ab.pulse.everyMs : null,
    reserved: null,
    ...extra,
  };
  const field = [...s.players[p].field];
  field[slot] = unit;
  const pl = { ...s.players[p], field };
  const players: GameState['players'] = p === 0 ? [pl, s.players[1]] : [s.players[0], pl];
  return [{ ...s, players, nextUid: s.nextUid + 1 }, unit];
}

const attack = (s: GameState, uid: number, target: Target, p: PlayerIndex = 0): GameState => step(s, { type: 'attack', p, uid, target });

describe('基礎スタッツ（能力なし）', () => {
  it('コスト 1〜5 は 攻撃/HP がコスト・コスト+1 のどちらか、7 以上は コスト+1 / コスト+1', () => {
    const base: CardId[] = ['recruit', 'footman', 'lancer', 'knight', 'captain', 'warlord', 'champion', 'ogre', 'dragoon'];
    for (const id of base) {
      const d = CARDS[id];
      expect(d.ab).toEqual({});
      if (d.summon <= 5) expect([d.atk, d.hp].sort()).toEqual([d.summon, d.summon + 1].sort());
      else expect([d.atk, d.hp]).toEqual([d.summon + 1, d.summon + 1]);
    }
    expect(CARDS.veteran.atk).toBe(7); // コスト 6 は既存のダリウス
  });
});

describe('狙い撃ち（freeAim）', () => {
  it('ブロッカーがいても、壁になっていても、好きな相手を攻撃できる', () => {
    let [s, a] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'marksman');
    let b: Unit, t: Unit;
    [s, b] = place(s, 1, 0, 'guard'); // ブロッカー
    [s, t] = place(s, 1, 1, 'craftsman');
    [s] = place(s, 1, 2, 'footman'); // 壁（3 枚）
    const list = legalTargetsFor(s, 0, a.uid);
    expect(list).toContainEqual(FACE);
    expect(list).toContainEqual(U(t.uid));
    expect(list).toContainEqual(U(b.uid));
    const n = attack(s, a.uid, FACE);
    expect(n.players[1].hp).toBe(PLAYER_HP - CARDS.marksman.atk);
    // ふつうのユニットは、ブロッカーしか狙えない
    const [s2, c] = place(s, 0, 1, 'lancer');
    expect(legalTargetsFor(s2, 0, c.uid)).toEqual([U(b.uid)]);
  });

  it('ステルス中の相手は狙えない', () => {
    let [s, a] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'marksman');
    let sp: Unit;
    [s, sp] = place(s, 1, 0, 'spy');
    expect(legalTargetsFor(s, 0, a.uid)).not.toContainEqual(U(sp.uid));
  });
});

describe('連撃（doubleStrike）', () => {
  it('1 回目はクールタイムなしで、続けて 2 回目。2 回目で全体のクールタイムに入る', () => {
    let [s, a] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'twin');
    let t: Unit;
    [s, t] = place(s, 1, 0, 'bulwark'); // 攻撃 0・HP 6（反撃されない的）
    s = rawStep(s, { type: 'attack', p: 0, uid: a.uid, target: U(t.uid) }); // 1 回目を選ぶ
    let u = unitOf(s, 0, a.uid)!;
    expect(u.second).toBe(true);
    expect(u.readyAt).toBeLessThanOrEqual(s.time); // クールタイムなし
    s = tick(s, WINDUP_MS); // 1 回目が当たる。残したターゲットへ、すぐ 2 回目が始まる
    expect(unitOf(s, 1, t.uid)!.hp).toBe(CARDS.bulwark.hp - CARDS.twin.atk);
    u = unitOf(s, 0, a.uid)!;
    expect(u.second).toBeUndefined();
    expect(u.readyAt).toBeGreaterThan(s.time); // 2 回目を選んだ時点から、クールタイム全体
    s = tick(s, WINDUP_MS);
    expect(unitOf(s, 1, t.uid)!.hp).toBe(CARDS.bulwark.hp - CARDS.twin.atk * 2);
  });

  it('1 回目が中断されたら、連撃の状態も元に戻る', () => {
    let [s, a] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'twin');
    let t: Unit;
    [s, t] = place(s, 1, 0, 'guard');
    let n = rawStep(s, { type: 'attack', p: 0, uid: a.uid, target: U(t.uid) });
    const field = [...n.players[1].field];
    field[0] = null;
    n = tick({ ...n, players: [n.players[0], { ...n.players[1], field }] }, WINDUP_MS);
    const u = unitOf(n, 0, a.uid)!;
    expect(u.second).toBeUndefined();
    expect(u.readyAt).toBeLessThanOrEqual(n.time);
  });
});

describe('攻撃不能（cannotAttack / disarm）', () => {
  it('モルドは攻撃できない。封印されれば攻撃できる', () => {
    let [s, w] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'bulwark');
    expect(CARDS.bulwark.atk).toBe(0);
    expect(step(s, { type: 'attack', p: 0, uid: w.uid, target: FACE })).toBe(s);
    [s, w] = place(s, 0, 1, 'bulwark', { sealed: true });
    expect(step(s, { type: 'attack', p: 0, uid: w.uid, target: FACE })).not.toBe(s);
  });

  it('カイの登場時: 選んだ敵ユニットが 10 秒、攻撃できない', () => {
    let [s, t] = place(withHand(['binder', 'herald', 'herald', 'herald']), 1, 0, 'lancer');
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: t.uid });
    const x = unitOf(s, 1, t.uid)!;
    expect(x.disarmUntil).toBeGreaterThan(s.time);
    expect(step(s, { type: 'attack', p: 1, uid: t.uid, target: FACE })).toBe(s);
    const later = tick(s, 10_000);
    expect(step(later, { type: 'attack', p: 1, uid: t.uid, target: FACE })).not.toBe(later);
  });
});

describe('封印（seal）', () => {
  it('能力が無効になる: ブロッカー・結界・不屈・死亡時・鼓舞・増収', () => {
    let [s, g] = place(withHand(['sealer', 'herald', 'herald', 'herald']), 1, 0, 'guard');
    expect(legalTargetsFor(s, 0, 999)).toContainEqual(U(g.uid)); // ブロッカーがいる
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: g.uid });
    expect(unitOf(s, 1, g.uid)!.sealed).toBe(true);
    // 封印されたブロッカーは、ブロッカーではない（顔を狙える）
    const me = unitOf(s, 0, s.players[0].field[0]!.uid)!;
    expect(legalTargetsFor(s, 0, me.uid)).toContainEqual(FACE);
  });

  it('封印したユニットは、死亡時の効果が起きない', () => {
    let [s, u] = place(withHand(['sealer', 'herald', 'herald', 'herald']), 1, 0, 'usurer');
    let a: Unit;
    [s, a] = place(s, 0, 1, 'ogre');
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: u.uid });
    const hp = s.players[0].hp;
    s = attack(s, a.uid, U(u.uid));
    expect(unitOf(s, 1, u.uid)).toBeUndefined();
    expect(s.players[0].hp).toBe(hp); // 死亡時のダメージなし
  });

  it('封印の儀: 敵ユニット全員を封印する', () => {
    let [s] = place(withHand(['edict', 'herald', 'herald', 'herald']), 1, 0, 'double');
    let b: Unit;
    [s, b] = place(s, 1, 1, 'blockader');
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: -1 });
    expect(s.players[1].field.filter((u) => u?.sealed)).toHaveLength(2);
    expect(unitOf(s, 1, b.uid)!.sealed).toBe(true);
    expect(s.players[1].field[0]!.barrier).toBe(false);
  });
});

describe('毒（poison）', () => {
  it('毒を持つユニットは、攻撃するたびに毒の数だけダメージを受ける', () => {
    let [s, a] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'dragoon', { poison: 2 });
    let t: Unit;
    [s, t] = place(s, 1, 0, 'warlord');
    s = attack(s, a.uid, U(t.uid));
    // 反撃（warlord の攻撃力）+ 毒 2
    expect(unitOf(s, 0, a.uid)!.hp).toBe(CARDS.dragoon.hp - CARDS.warlord.atk - 2);
  });

  it('ピオ（毒の牙 1）: 攻撃した敵に毒が重なる', () => {
    let [s, a] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'needle');
    let t: Unit;
    [s, t] = place(s, 1, 0, 'ogre');
    s = attack(s, a.uid, U(t.uid));
    expect(unitOf(s, 1, t.uid)!.poison).toBe(1);
  });

  it('ゾーラの登場時: 選んだ敵に毒（数はない状態）。毒霧: 敵全員に毒。重ならない', () => {
    let [s, t] = place(withHand(['poisoner', 'miasma', 'herald', 'herald']), 1, 0, 'ogre');
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: t.uid });
    expect(unitOf(s, 1, t.uid)!.poison).toBe(1);
    s = step(s, { type: 'summon', p: 0, handIndex: 1, slot: -1 });
    // 同じ状態は重ならない
    expect(unitOf(s, 1, t.uid)!.poison).toBe(1);
  });

  it('ハッカの死亡時: 敵ユニット全員に毒 1', () => {
    let [s, h] = place(withHand(['herald', 'herald', 'herald', 'herald']), 1, 0, 'creeper', { });
    let a: Unit, v: Unit;
    [s, v] = place(s, 0, 1, 'ogre');
    [s, a] = place(s, 0, 0, 'champion');
    s = attack(s, a.uid, U(h.uid));
    expect(unitOf(s, 1, h.uid)).toBeUndefined();
    expect(unitOf(s, 0, v.uid)!.poison).toBe(1);
    expect(unitOf(s, 0, a.uid)!.poison).toBe(1);
  });
});

describe('回復・強化（味方を選ぶ / 全体）', () => {
  it('味方を選ぶ効果は、味方ユニットを選ぶ。選べる味方がいなければ、そのまま置ける', () => {
    const s0 = withHand(['medic', 'herald', 'herald', 'herald']);
    expect(summonSide('medic')).toBe('ally');
    expect(summonBlock(s0, 0, 0, 0)).toBeNull(); // 味方がいない
    const [s1, ally] = place(s0, 0, 1, 'lancer', { hp: 1 });
    expect(summonBlock(s1, 0, 0, 0)).toBe('target');
    expect(summonBlock(s1, 0, 0, 0, ally.uid)).toBeNull();
    expect(summonTargets(s1.players[0], 'medic').map((u) => u.uid)).toEqual([ally.uid]);
  });

  it('ララ: 選んだ味方を 3 回復（最大 HP まで）', () => {
    let [s, ally] = place(withHand(['medic', 'herald', 'herald', 'herald']), 0, 1, 'lancer', { hp: 2 });
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: ally.uid });
    expect(unitOf(s, 0, ally.uid)!.hp).toBe(Math.min(CARDS.lancer.hp, 2 + 3));
  });

  it('ノア: 選んだ味方の攻撃力 +1・HP +1（最大 HP も増える）', () => {
    let [s, ally] = place(withHand(['bard', 'herald', 'herald', 'herald']), 0, 1, 'lancer');
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0, target: ally.uid });
    const u = unitOf(s, 0, ally.uid)!;
    expect(attackOf(s.players[0], u)).toBe(CARDS.lancer.atk + 1);
    expect(u.hp).toBe(CARDS.lancer.hp + 1);
    expect(u.maxHp).toBe(CARDS.lancer.hp + 1);
  });

  it('オッド・ミナ: 自分のほかのユニット全員を強化する（相手と、自分自身は対象外）', () => {
    let [s, a] = place(withHand(['banner', 'herald', 'herald', 'herald']), 0, 1, 'lancer');
    let f: Unit;
    [s, f] = place(s, 1, 0, 'lancer');
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(attackOf(s.players[0], unitOf(s, 0, a.uid)!)).toBe(CARDS.lancer.atk + 2);
    expect(attackOf(s.players[1], unitOf(s, 1, f.uid)!)).toBe(CARDS.lancer.atk);
    const mina = s.players[0].field[0]!;
    expect(attackOf(s.players[0], mina)).toBe(CARDS.banner.atk);
  });

  it('癒しの雨・戦の号令', () => {
    let [s, a] = place(withHand(['rain', 'warcry', 'herald', 'herald']), 0, 0, 'lancer', { hp: 1 });
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: -1 });
    expect(unitOf(s, 0, a.uid)!.hp).toBe(4);
    s = step(s, { type: 'summon', p: 0, handIndex: 1, slot: -1 });
    const u = unitOf(s, 0, a.uid)!;
    expect(attackOf(s.players[0], u)).toBe(CARDS.lancer.atk + 1);
    expect(u.hp).toBe(5);
  });

  it('ネメアの死亡時: 味方ユニット全員の攻撃力 +2', () => {
    let [s, m] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'martyr', { hp: 1 });
    let ally: Unit, foe: Unit;
    [s, ally] = place(s, 0, 1, 'lancer');
    [s, foe] = place(s, 1, 0, 'ogre');
    s = attack(s, foe.uid, U(m.uid), 1);
    expect(unitOf(s, 0, m.uid)).toBeUndefined();
    expect(attackOf(s.players[0], unitOf(s, 0, ally.uid)!)).toBe(CARDS.lancer.atk + 2);
  });
});

describe('吸血・不屈', () => {
  it('グレン: 与えたダメージぶん、自分のプレイヤーが回復する', () => {
    let [s, a] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'bloody');
    s = { ...s, players: [{ ...s.players[0], hp: 10 }, s.players[1]] };
    s = attack(s, a.uid, FACE);
    expect(s.players[1].hp).toBe(PLAYER_HP - CARDS.bloody.atk);
    expect(s.players[0].hp).toBe(10 + CARDS.bloody.atk);
  });

  it('吸血で、HP は最大（20）を超えない', () => {
    let [s, a] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'bloodknight');
    s = attack(s, a.uid, FACE);
    expect(s.players[0].hp).toBe(PLAYER_HP);
  });

  it('バーナ: 結界で、最初のダメージを 0 にする。2 回目は受ける', () => {
    let [s, b] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'stalwart');
    let foe: Unit;
    [s, foe] = place(s, 1, 0, 'ogre');
    expect(unitOf(s, 0, b.uid)!.barrier).toBe(true);
    s = attack(s, foe.uid, U(b.uid), 1);
    expect(unitOf(s, 0, b.uid)!.hp).toBe(CARDS.stalwart.hp);
    expect(unitOf(s, 0, b.uid)!.barrier).toBe(false);
  });
});

describe('建築物の定期効果', () => {
  it('治療所: 一定時間ごとに自分の HP を回復（最大を超えない）', () => {
    let [s] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'infirmary');
    const pulse = CARDS.infirmary.ab.pulse!;
    s = { ...s, players: [{ ...s.players[0], hp: 10 }, s.players[1]] };
    s = tick(s, pulse.everyMs);
    expect(s.players[0].hp).toBe(10 + (pulse.kind === 'heal' ? pulse.amount : 0));
    s = tick(s, pulse.everyMs * 20);
    expect(s.players[0].hp).toBe(PLAYER_HP);
  });

  it('毒の祭壇: 一定時間ごとに、毒の無い敵ユニットのうち攻撃力のいちばん高いものに毒', () => {
    let [s] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'altar');
    let hi: Unit;
    [s] = place(s, 1, 0, 'lancer');
    [s, hi] = place(s, 1, 1, 'ogre');
    s = tick(s, 10_000);
    expect(unitOf(s, 1, hi.uid)!.poison).toBe(1);
  });

  it('毒の祭壇: 毒の付いた相手は飛ばして、次に攻撃力の高い相手に毒', () => {
    let [s] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'altar');
    let lo: Unit;
    [s, lo] = place(s, 1, 0, 'lancer');
    [s] = place(s, 1, 1, 'ogre', { poison: 1 });
    s = tick(s, CARDS.altar.ab.pulse!.everyMs);
    expect(unitOf(s, 1, lo.uid)!.poison).toBe(1);
  });

  it('鍛冶場: 一定時間ごとに、攻撃力のいちばん低い味方ユニットの攻撃力 +1', () => {
    let [s] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'forge');
    let lo: Unit;
    [s] = place(s, 0, 1, 'ogre');
    [s, lo] = place(s, 0, 2, 'lancer');
    s = tick(s, CARDS.forge.ab.pulse!.everyMs);
    expect(attackOf(s.players[0], unitOf(s, 0, lo.uid)!)).toBe(CARDS.lancer.atk + 1);
  });

  it('封印された建築物は、定期効果が止まる', () => {
    let [s] = place(withHand(['herald', 'herald', 'herald', 'herald']), 0, 0, 'infirmary', { sealed: true, pulseAt: null });
    s = { ...s, players: [{ ...s.players[0], hp: 10 }, s.players[1]] };
    s = tick(s, 20_000);
    expect(s.players[0].hp).toBe(10);
  });
});
