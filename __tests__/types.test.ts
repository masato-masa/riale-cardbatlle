// カードの種類（ユニット・建築物・呪文）、クールタイム、建築物の生産・砲撃のテスト。
import { describe, expect, it } from 'vitest';

import { CARDS, STARTER_DECK, type CardId } from '../src/game/cards';
import {
  attackBlock,
  cooldownOf,
  createGame,
  findUnit,
  isLegalTarget,
  isWalled,
  legalTargets,
  step as rawStep,
  summonBlock,
  units,
  type GameState,
  type PlayerIndex,
  type Target,
  type Unit,
} from '../src/game/engine';
import { WINDUP_MS, COIN_MAX, COIN_MS, FIELD_SLOTS, MATCH_MS, PLAYER_HP } from '../src/game/rules';

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

function withHand(hand: CardId[], coins = COIN_MAX): GameState {
  const s = fresh();
  const mk = (p: 0 | 1) => ({ ...s.players[p], hand, coins });
  return { ...s, players: [mk(0), mk(1)] };
}

/** 場へ直接置く（召喚の待ち時間なしで攻撃できる）。建築物は pulseAt も入る。 */
function place(s: GameState, p: PlayerIndex, slot: number, card: CardId, hp?: number, readyAt = 0): [GameState, Unit] {
  const ab = CARDS[card].ab;
  const unit: Unit = {
    uid: s.nextUid,
    card,
    hp: hp ?? CARDS[card].hp,
    readyAt,
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

const fill = (s: GameState, p: PlayerIndex, card: CardId, from = 0): GameState => {
  for (let i = from; i < FIELD_SLOTS; i++) [s] = place(s, p, i, card, 9);
  return s;
};

describe('クールタイム（カードごと）', () => {
  it('攻撃したユニットは、そのカードの cd 後まで攻撃できない（カードごとに違う）', () => {
    // プレイヤーの反撃（2）で倒れない HP のカードで確かめる
    for (const card of ['craftsman', 'inspector', 'boss'] as CardId[]) {
      const [s, u] = place(withHand(HAND4), 0, 0, card);
      const n = hit(s, 0, u.uid, FACE);
      expect(findUnit(n.players[0], u.uid)!.unit.readyAt).toBe(s.time + CARDS[card].cd);
      expect(attackBlock(n, 0, u.uid, FACE)).toBe('cooldown');
      expect(attackBlock(tick(n, CARDS[card].cd - WINDUP_MS - 1), 0, u.uid, FACE)).toBe('cooldown');
      // 明けた瞬間、残っているターゲットへ自動で攻撃が始まる
      expect(tick(n, CARDS[card].cd - WINDUP_MS).pending.some((x) => x.kind === 'attack' && x.uid === u.uid)).toBe(true);
    }
    expect(CARDS.herald.cd).not.toBe(CARDS.boss.cd);
  });

  it('召喚後はクールタイムの半分だけ待つ（2 回目からはそのカードのクールタイム）。速攻は待たない', () => {
    for (const card of ['spy', 'guard', 'boss'] as CardId[]) {
      let s = withHand([card, 'herald', 'herald', 'herald']);
      s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
      const u = s.players[0].field[0]!;
      const half = Math.round(CARDS[card].cd / 2);
      expect(u.readyAt).toBe(s.time + half);
      expect(attackBlock(tick(s, half - 1), 0, u.uid, FACE)).toBe('cooldown');
      expect(attackBlock(tick(s, half), 0, u.uid, FACE)).toBeNull();
      // 攻撃したあとは、そのカードのクールタイム全体
      const at = tick(s, half);
      const n = step(at, { type: 'attack', p: 0, uid: u.uid, target: FACE });
      expect(findUnit(n.players[0], u.uid)!.unit.readyAt).toBe(at.time + CARDS[card].cd);
    }
    const h = step(withHand(['herald', 'herald', 'herald', 'herald']), { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(h.players[0].field[0]!.readyAt).toBe(h.time);
  });

  it('建築物・呪文の cd は 0。ユニットは 1 秒刻みで、平均はおよそ 16 秒', () => {
    const list = Object.values(CARDS).filter((c) => c.type === 'unit' && !c.token);
    for (const c of Object.values(CARDS)) {
      if (c.type !== 'unit') expect(c.cd).toBe(0);
      else expect(c.cd % 1000).toBe(0);
    }
    const avg = list.reduce((n, c) => n + c.cd, 0) / list.length / 1000;
    expect(avg).toBeGreaterThanOrEqual(14);
    expect(avg).toBeLessThanOrEqual(18);
  });

  it('祈りは、そのカードの cd に掛かる。-30%、2 枚でも下限の 40%（3 枚でも 40% より短くならない）', () => {
    let [s] = place(withHand(HAND4), 0, 0, 'cathedral');
    for (const card of ['herald', 'boss'] as CardId[]) {
      expect(cooldownOf(s.players[0], card)).toBe(Math.round(CARDS[card].cd * 0.7));
      expect(cooldownOf(s.players[1], card)).toBe(CARDS[card].cd);
    }
    [s] = place(s, 0, 1, 'cathedral');
    expect(cooldownOf(s.players[0], 'boss')).toBe(Math.round(CARDS.boss.cd * 0.4));
    [s] = place(s, 0, 2, 'cathedral');
    expect(cooldownOf(s.players[0], 'boss')).toBe(Math.round(CARDS.boss.cd * 0.4));
  });

  it('祈りがあると次の攻撃までが短くなる（カードごとの値の 70%）。相手のユニットには効かない', () => {
    let [s] = place(withHand(HAND4), 0, 0, 'cathedral');
    let a: Unit, b: Unit;
    [s, a] = place(s, 0, 1, 'boss');
    [s, b] = place(s, 1, 0, 'boss');
    s = hit(hit(s, 0, a.uid, FACE), 1, b.uid, FACE);
    expect(findUnit(s.players[0], a.uid)!.unit.readyAt).toBe(Math.round(CARDS.boss.cd * 0.7)); // 時刻 0 に攻撃
    expect(findUnit(s.players[1], b.uid)!.unit.readyAt).toBe(WINDUP_MS + CARDS.boss.cd); // 時刻 WINDUP_MS に攻撃
  });

  it('祈りがあれば、召喚後の待ちも短くなる', () => {
    let [s] = place(withHand(['craftsman', 'herald', 'herald', 'herald']), 0, 0, 'cathedral');
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 1 });
    expect(s.players[0].field[1]!.readyAt - s.time).toBe(Math.round(Math.round(CARDS.craftsman.cd * 0.7) / 2));
  });
});

describe('建築物', () => {
  it('召喚するとコインを払って場に出る（1 枠）。攻撃力 0・HP あり', () => {
    const s = withHand(['wall', 'herald', 'herald', 'herald']);
    const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 1 });
    expect(n.players[0].coins).toBe(COIN_MAX - CARDS.wall.summon);
    expect(n.players[0].field[1]).toMatchObject({ card: 'wall', hp: CARDS.wall.hp });
    expect(n.players[0].queue.at(-1)).toBe('wall');
    expect(CARDS.wall.atk).toBe(0);
    expect(CARDS.wall.type).toBe('building');
  });

  it('建築物は攻撃できない（attackBlock が building。クールタイムが明けていても）', () => {
    const [s, w] = place(withHand(HAND4), 0, 0, 'fortress');
    expect(attackBlock(s, 0, w.uid, FACE)).toBe('building');
    expect(hit(s, 0, w.uid, FACE)).toBe(s);
    const [t, v] = place(s, 1, 0, 'herald');
    expect(hit(t, 0, w.uid, U(v.uid))).toBe(t);
  });

  it('建築物を攻撃しても反撃されない。HP が 0 になれば消える', () => {
    let [s, a] = place(withHand(HAND4), 0, 0, 'craftsman');
    let b: Unit;
    [s, b] = place(s, 1, 0, 'exchange', 9);
    const n = hit(s, 0, a.uid, U(b.uid)); // 攻撃力 + 討伐 2
    expect(hpOf(n, 1, b.uid)).toBe(9 - CARDS.craftsman.atk - 2);
    expect(hpOf(n, 0, a.uid)).toBe(CARDS.craftsman.hp);
    const [m, c] = place(withHand(HAND4), 1, 0, 'exchange', 1);
    const [m2, a2] = place(m, 0, 0, 'craftsman');
    expect(gone(hit(m2, 0, a2.uid, U(c.uid)), 1, c.uid)).toBe(true);
  });

  it('建築物も壁の枚数に数える', () => {
    let s = withHand(HAND4);
    for (let i = 0; i < FIELD_SLOTS - 1; i++) [s] = place(s, 1, i, 'herald');
    expect(isWalled(s.players[1])).toBe(false);
    [s] = place(s, 1, FIELD_SLOTS - 1, 'exchange');
    expect(isWalled(s.players[1])).toBe(true);
    const [t, a] = place(s, 0, 0, 'spy');
    expect(isLegalTarget(t, 0, FACE)).toBe(false);
    expect(hit(t, 0, a.uid, FACE)).toBe(t);
  });

  it('建築物だけで場をうめても壁になる', () => {
    let s = withHand(HAND4);
    for (let i = 0; i < FIELD_SLOTS; i++) [s] = place(s, 1, i, 'tradingHouse');
    expect(isWalled(s.players[1])).toBe(true);
    expect(legalTargets(s, 0)).toHaveLength(FIELD_SLOTS);
  });

  it('城壁はブロッカー: 相手は城壁しか攻撃できない。壊せば通る', () => {
    let [s, a] = place(withHand(HAND4), 0, 0, 'boss');
    let w: Unit, h: Unit;
    [s, w] = place(s, 1, 0, 'wall', 2);
    [s, h] = place(s, 1, 1, 'herald');
    expect(legalTargets(s, 0)).toEqual([U(w.uid)]);
    expect(hit(s, 0, a.uid, FACE)).toBe(s);
    expect(hit(s, 0, a.uid, U(h.uid))).toBe(s);
    const n = hit(s, 0, a.uid, U(w.uid));
    // 薙払は城壁の陰の伝令にも当たる
    expect(gone(n, 1, w.uid)).toBe(true);
    expect(isLegalTarget(n, 0, FACE)).toBe(true);
  });

  it('増収・鼓舞・祈りは建築物でも効く。倒れたら止まる', () => {
    const base = withHand(HAND4);
    let [s] = place({ ...base, players: [{ ...base.players[0], coins: 0 }, base.players[1]] }, 0, 0, 'exchange');
    expect(tick(s, COIN_MS).players[0].coins).toBeCloseTo(1 + CARDS.exchange.ab.coinBoost!);
    s = { ...s, players: [{ ...s.players[0], field: s.players[0].field.map(() => null) }, s.players[1]] };
    expect(tick(s, COIN_MS).players[0].coins).toBeCloseTo(1);
  });
});

describe('生産（工房）', () => {
  const every = CARDS.factory.ab.pulse!.everyMs;

  it('数秒ごとに空き枠の先頭へ見習いが出る', () => {
    let [s] = place(withHand(HAND4), 0, 2, 'factory');
    s = tick(s, every - 1);
    expect(units(s.players[0])).toHaveLength(1);
    s = tick(s, 1);
    expect(s.players[0].field[0]).toMatchObject({ card: 'apprentice', hp: 1 });
    expect(s.events.some((e) => e.kind === 'pulse')).toBe(true);
    expect(s.events.some((e) => e.kind === 'summon' && e.token)).toBe(true);
    // 山札には入らない
    expect(s.players[0].hand.length + s.players[0].queue.length).toBe(8);
  });

  it('一度に大きく進めても回数ぶん出る', () => {
    let [s] = place(withHand(HAND4), 0, 4, 'factory');
    s = tick(s, every * 2);
    expect(units(s.players[0]).filter((u) => u.card === 'apprentice')).toHaveLength(2);
  });

  it('空き枠が無ければ出ない（次の周期は進む）', () => {
    let [s, f] = place(withHand(HAND4), 0, 0, 'factory');
    for (let i = 1; i < FIELD_SLOTS; i++) [s] = place(s, 0, i, 'guard');
    s = tick(s, every);
    expect(units(s.players[0]).filter((u) => u.card === 'apprentice')).toHaveLength(0);
    expect(findUnit(s.players[0], f.uid)!.unit.pulseAt).toBe(every * 2);
  });

  it('壊されたら止まる', () => {
    let [s, f] = place(withHand(HAND4), 0, 0, 'factory', 1);
    let a: Unit;
    [s, a] = place(s, 1, 0, 'spy');
    s = hit(s, 1, a.uid, U(f.uid));
    expect(gone(s, 0, f.uid)).toBe(true);
    expect(units(tick(s, every * 2).players[0])).toHaveLength(0);
  });

  it('召喚した工房の最初の生産は召喚から数秒後', () => {
    let s = withHand(['factory', 'herald', 'herald', 'herald']);
    s = tick(s, 1000);
    s = step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 });
    expect(s.players[0].field[0]!.pulseAt).toBe(1000 + every);
  });
});

describe('砲撃（砦）', () => {
  const every = CARDS.fortress.ab.pulse!.everyMs;
  const amount = (CARDS.fortress.ab.pulse as { amount: number }).amount;

  it('いちばん HP の低い相手のカードに当たる', () => {
    let [s] = place(withHand(HAND4), 0, 0, 'fortress');
    let a: Unit, b: Unit, c: Unit;
    [s, a] = place(s, 1, 0, 'guard', 5);
    [s, b] = place(s, 1, 1, 'usurer', 3);
    [s, c] = place(s, 1, 2, 'craftsman', 4);
    const n = tick(s, every);
    expect(hpOf(n, 1, b.uid)).toBe(3 - amount);
    expect(hpOf(n, 1, a.uid)).toBe(5);
    expect(hpOf(n, 1, c.uid)).toBe(4);
    expect(n.events.some((e) => e.kind === 'pulse')).toBe(true);
  });

  it('HP が同じなら左のカード。建築物も的になる', () => {
    let [s] = place(withHand(HAND4), 0, 0, 'fortress');
    let a: Unit, b: Unit;
    [s, a] = place(s, 1, 1, 'exchange', 3);
    [s, b] = place(s, 1, 3, 'spy', 3);
    const n = tick(s, every);
    expect(hpOf(n, 1, a.uid)).toBe(3 - amount);
    expect(hpOf(n, 1, b.uid)).toBe(3);
  });

  it('結界を剥がし、鉄壁で減る。ブロッカーの陰でも壁でも届く', () => {
    let [s] = place(withHand(HAND4), 0, 0, 'fortress');
    let d: Unit;
    [s, d] = place(s, 1, 0, 'double', 1);
    s = fill(s, 1, 'wall', 1);
    // 城壁（ブロッカー）に囲まれて、場がうまっていても当たる。最低 HP は結界つきの影武者
    const n = tick(s, every);
    expect(hpOf(n, 1, d.uid)).toBe(1);
    expect(findUnit(n.players[1], d.uid)!.unit.barrier).toBe(false);
    expect(n.events.some((e) => e.kind === 'damage' && e.guard === 'barrier')).toBe(true);

    let [t] = place(withHand(HAND4), 0, 0, 'fortress');
    let k: Unit;
    [t, k] = place(t, 1, 0, 'blockader', 2);
    const m = tick(t, every); // 1 - 鉄壁 1 = 0
    expect(hpOf(m, 1, k.uid)).toBe(2);
    expect(m.events.find((e) => e.kind === 'damage')).toMatchObject({ amount: 0, guard: 'armor' });
  });

  it('的が無ければ何も起きない。倒した遺言は相手プレイヤーに飛ぶ', () => {
    let [s] = place(withHand(HAND4), 0, 0, 'fortress');
    const n0 = tick(s, every);
    expect(n0.events.some((e) => e.kind === 'damage')).toBe(false);
    let u: Unit;
    [s, u] = place(s, 1, 0, 'usurer', 1);
    const n = tick(s, every);
    expect(gone(n, 1, u.uid)).toBe(true);
    expect(n.players[0].hp).toBe(PLAYER_HP - 2);
  });

  it('時間切れと同じ tick で起きた砲撃の結果が勝敗に反映される', () => {
    let [s] = place({ ...withHand(HAND4), time: MATCH_MS - 100 }, 0, 0, 'fortress');
    s = { ...s, players: [{ ...s.players[0], field: s.players[0].field.map((u) => (u ? { ...u, pulseAt: MATCH_MS - 50 } : u)) }, s.players[1]] };
    [s] = place(s, 1, 0, 'usurer', 1);
    const n = tick(s, 200);
    expect(n.result).toEqual({ winner: 1, reason: 'time' });
    expect(n.events.at(-1)!.kind).toBe('end');
    expect(n.events.some((e) => e.kind === 'pulse')).toBe(true);
  });

  it('壊されたら止まる', () => {
    let [s, f] = place(withHand(HAND4), 0, 0, 'fortress', 1);
    let a: Unit, v: Unit;
    [s, a] = place(s, 1, 0, 'spy');
    [s, v] = place(s, 1, 1, 'guard');
    s = hit(s, 1, a.uid, U(f.uid));
    expect(gone(s, 0, f.uid)).toBe(true);
    expect(hpOf(tick(s, every * 2), 1, v.uid)).toBe(CARDS.guard.hp);
  });
});

describe('呪文', () => {
  it('場に出ない。コインを払い、手札に次のカードが入り、デッキの一番下へ戻る', () => {
    const s = withHand(['festival', 'herald', 'guard', 'spy']);
    const next = s.players[0].queue[0]!;
    const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: -1 });
    const pl = n.players[0];
    expect(units(pl)).toHaveLength(0);
    expect(pl.coins).toBeCloseTo(COIN_MAX - CARDS.festival.summon, 0); // 溜めの間にコインが少したまる
    expect(pl.hand).toEqual([next, 'herald', 'guard', 'spy']);
    expect(pl.queue.at(-1)).toBe('festival');
    expect(pl.hand.length + pl.queue.length).toBe(8);
    expect(n.events.find((e) => e.kind === 'spell')).toMatchObject({ p: 0, card: 'festival', target: null });
  });

  it('場が全部うまっていても使える。slot は見ない', () => {
    const s = fill(withHand(['quake', 'herald', 'herald', 'herald']), 0, 'guard');
    expect(summonBlock(s, 0, 0, 0)).toBeNull();
    expect(step(s, { type: 'summon', p: 0, handIndex: 0, slot: 0 })).not.toBe(s);
  });

  it('コインが足りないと使えない', () => {
    const s = withHand(['quarry', 'herald', 'herald', 'herald'], CARDS.quarry.summon - 0.1);
    expect(summonBlock(s, 0, 0, -1)).toBe('coins');
    expect(step(s, { type: 'summon', p: 0, handIndex: 0, slot: -1 })).toBe(s);
  });

  describe('単体（落石）', () => {
    const dmg = (CARDS.quarry.ab.spell as { amount: number }).amount;

    it('target が無い・存在しない・自分のカードなら使えない（コインも減らない）', () => {
      let [s, mine] = place(withHand(['quarry', 'herald', 'herald', 'herald']), 0, 0, 'guard');
      [s] = place(s, 1, 0, 'craftsman');
      expect(summonBlock(s, 0, 0, -1)).toBe('target');
      expect(summonBlock(s, 0, 0, -1, 9999)).toBe('target');
      expect(summonBlock(s, 0, 0, -1, mine.uid)).toBe('target');
      expect(step(s, { type: 'summon', p: 0, handIndex: 0, slot: -1 })).toBe(s);
      expect(step(s, { type: 'summon', p: 0, handIndex: 0, slot: -1, target: mine.uid })).toBe(s);
    });

    it('選んだカードにダメージ。ブロッカーの陰・壁でも届く。コインを払い場に出ない', () => {
      let [s] = place(withHand(['quarry', 'herald', 'herald', 'herald']), 1, 0, 'wall');
      let h: Unit;
      [s, h] = place(s, 1, 1, 'architect', 7);
      s = fill(s, 1, 'guard', 2);
      const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: -1, target: h.uid });
      expect(hpOf(n, 1, h.uid)).toBe(7 - dmg);
      expect(n.players[0].coins).toBeCloseTo(COIN_MAX - CARDS.quarry.summon, 0);
      expect(units(n.players[0])).toHaveLength(0);
      expect(n.players[1].hp).toBe(PLAYER_HP);
      expect(n.events.find((e) => e.kind === 'spell')).toMatchObject({ card: 'quarry', target: h.uid });
    });

    it('結界は 1 回防ぎ、鉄壁で減る。倒すと遺言も起きる', () => {
      const hand = ['quarry', 'herald', 'herald', 'herald'] as CardId[];
      const [s, d] = place(withHand(hand), 1, 0, 'double');
      const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: -1, target: d.uid });
      expect(hpOf(n, 1, d.uid)).toBe(CARDS.double.hp);
      expect(findUnit(n.players[1], d.uid)!.unit.barrier).toBe(false);
      const [s2, b] = place(withHand(hand), 1, 0, 'blockader', 9);
      expect(hpOf(step(s2, { type: 'summon', p: 0, handIndex: 0, slot: -1, target: b.uid }), 1, b.uid)).toBe(9 - (dmg - 1));
      const [s3, u] = place(withHand(hand), 1, 0, 'usurer');
      const k = step(s3, { type: 'summon', p: 0, handIndex: 0, slot: -1, target: u.uid });
      expect(gone(k, 1, u.uid)).toBe(true);
      expect(k.players[0].hp).toBe(PLAYER_HP - 2);
    });

    it('建築物にも撃てる', () => {
      const [s, w] = place(withHand(['quarry', 'herald', 'herald', 'herald']), 1, 0, 'fortress');
      const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: -1, target: w.uid });
      expect(hpOf(n, 1, w.uid)).toBe(CARDS.fortress.hp - dmg);
    });
  });

  describe('全体（地鳴り）', () => {
    const dmg = (CARDS.quake.ab.spell as { amount: number }).amount;

    it('相手のカード全員（建築物も）にダメージ。target は要らず、味方には当たらない', () => {
      let [s, mine] = place(withHand(['quake', 'herald', 'herald', 'herald']), 0, 0, 'guard');
      let a: Unit, b: Unit, c: Unit;
      [s, a] = place(s, 1, 0, 'guard');
      [s, b] = place(s, 1, 1, 'exchange');
      [s, c] = place(s, 1, 2, 'herald', 2);
      expect(summonBlock(s, 0, 0, -1)).toBeNull();
      const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: -1 });
      expect(hpOf(n, 1, a.uid)).toBe(CARDS.guard.hp - dmg);
      expect(hpOf(n, 1, b.uid)).toBe(CARDS.exchange.hp - dmg);
      expect(gone(n, 1, c.uid)).toBe(true);
      expect(hpOf(n, 0, mine.uid)).toBe(CARDS.guard.hp);
    });

    it('結界・鉄壁を通る。遺言も起きる', () => {
      let [s] = place(withHand(['quake', 'herald', 'herald', 'herald']), 1, 0, 'double');
      const dUid = s.players[1].field[0]!.uid;
      let k: Unit, u: Unit;
      [s, k] = place(s, 1, 1, 'blockader', 5);
      [s, u] = place(s, 1, 2, 'usurer', 2);
      const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: -1 });
      expect(hpOf(n, 1, dUid)).toBe(CARDS.double.hp);
      expect(hpOf(n, 1, k.uid)).toBe(5 - (dmg - 1));
      expect(gone(n, 1, u.uid)).toBe(true);
      expect(n.players[0].hp).toBe(PLAYER_HP - 2);
    });
  });

  describe('遅延（通行止め）', () => {
    const ms = (CARDS.roadblock.ab.spell as { ms: number }).ms;

    it('相手のユニット全員のクールタイムが延びる。建築物と味方は変わらない', () => {
      let s = withHand(['roadblock', 'herald', 'herald', 'herald']);
      s = tick(s, 500);
      let a: Unit, b: Unit, w: Unit, mine: Unit;
      [s, a] = place(s, 1, 0, 'spy', undefined, 0); // 攻撃できる
      [s, b] = place(s, 1, 1, 'spy', undefined, s.time + 1500); // 待ちの途中
      [s, w] = place(s, 1, 2, 'wall');
      [s, mine] = place(s, 0, 0, 'spy');
      const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: -1 });
      expect(findUnit(n.players[1], a.uid)!.unit.readyAt).toBe(n.time + ms);
      expect(findUnit(n.players[1], b.uid)!.unit.readyAt).toBe(s.time + 1500 + ms);
      expect(findUnit(n.players[1], w.uid)!.unit.readyAt).toBe(w.readyAt);
      expect(findUnit(n.players[0], mine.uid)!.unit.readyAt).toBe(mine.readyAt);
      expect(attackBlock(n, 1, a.uid, FACE)).toBe('cooldown');
      expect(attackBlock(tick(n, ms), 1, a.uid, FACE)).toBeNull();
      expect(n.events.filter((e) => e.kind === 'stun')).toHaveLength(2);
    });
  });

  describe('再動（祝祭）', () => {
    it('味方ユニットのクールタイムがなくなる。相手と建築物には効かない', () => {
      let s = withHand(['festival', 'herald', 'herald', 'herald']);
      s = tick(s, 1000);
      let a: Unit, b: Unit, ready: Unit, foe: Unit;
      [s, a] = place(s, 0, 0, 'spy', undefined, s.time + 4000);
      [s, b] = place(s, 0, 1, 'guard', undefined, s.time + 1500);
      [s, ready] = place(s, 0, 2, 'herald', undefined, 0);
      [s, foe] = place(s, 1, 0, 'spy', undefined, s.time + 4000);
      const n = step(s, { type: 'summon', p: 0, handIndex: 0, slot: -1 });
      expect(findUnit(n.players[0], a.uid)!.unit.readyAt).toBe(n.time);
      expect(findUnit(n.players[0], b.uid)!.unit.readyAt).toBe(n.time);
      expect(findUnit(n.players[0], ready.uid)!.unit.readyAt).toBe(0);
      expect(findUnit(n.players[1], foe.uid)!.unit.readyAt).toBe(s.time + 4000);
      expect(attackBlock(n, 0, a.uid, FACE)).toBeNull();
      expect(n.events.filter((e) => e.kind === 'ready')).toHaveLength(2);
    });
  });
});
