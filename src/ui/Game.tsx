import { animate, AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { cpuStep, createBrain, type CpuLevel } from '@/ai/cpu';
import { abilityLines, CARDS, isBlocker, needsTarget, RIVAL_DECK, STARTER_DECK, type CardId } from '@/game/cards';
import {
  attackBlock,
  attackOf,
  createGame,
  findUnit,
  firstEmptySlot,
  isWalled,
  legalTargets,
  step,
  summonBlock,
  type GameEvent,
  type GameState,
  type Target,
  type Unit,
} from '@/game/engine';
import { makeRng } from '@/game/rng';
import { COIN_MAX, DOUBLE_COIN_FROM_MS, MATCH_MS } from '@/game/rules';

import { COIN_URL, FIELD_URL } from './art';
import { setBgmTension, startBgm, stopBgm } from './bgm';
import { CardFace } from './CardFace';
import { BackIcon, CardDetail, HelpBody, HeroBadge } from './GameParts';
import { hapticImpact, hapticLose, hapticReject, hapticUseCard, hapticWin } from './haptics';
import { SettingsIcon } from './icons';
import { SettingsSheet } from './SettingsSheet';
import { Sheet } from './Sheets';
import {
  playBarrier,
  playDeath,
  playHeal,
  playHit,
  playHorn,
  playLose,
  playReject,
  playStun,
  playSummon,
  playUiTap,
  playWin,
  primeAudio,
} from './sound';

const DRAG_THRESHOLD_PX = 7;
const LONG_PRESS_MS = 420;
/** 攻撃の突進で、当たる瞬間までの時間（ms）。数字とダメージ音をここに合わせる。 */
const HIT_AT_MS = 150;
/** 狙撃・足止の弾が届くまでの時間（ms）。 */
const SHOT_AT_MS = 240;

const LEVEL_NAME: Record<CpuLevel, string> = { easy: 'よわい', normal: 'ふつう', hard: 'つよい' };
const DECKS: [CardId[], CardId[]] = [STARTER_DECK, RIVAL_DECK];

type Press =
  | { kind: 'hand'; index: number; x0: number; y0: number; timer: number }
  | { kind: 'unit'; uid: number; x0: number; y0: number; timer: number };

type Drag =
  | { kind: 'hand'; index: number; x: number; y: number; slot: number | null; over: string | null }
  | { kind: 'unit'; uid: number; sx: number; sy: number; x: number; y: number; over: string | null };

interface Popup {
  id: number;
  x: number;
  y: number;
  text: string;
  tone: 'dmg' | 'face' | 'heal' | 'guard' | 'stun';
}

interface Shot {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type SheetKind = { kind: 'help' } | { kind: 'settings' } | { kind: 'quit' } | { kind: 'card'; card: CardId; hp?: number };

const SUMMON_REASON = { coins: 'コインが足りません', slot: '場がいっぱいです', over: '' } as const;
const ATTACK_REASON = {
  coins: 'コインが足りません',
  cooldown: 'まだ攻撃できません',
  target: 'ブロッカーを先に倒してください',
  over: '',
} as const;

function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function targetKey(t: Target): string {
  return t.kind === 'player' ? 'foe-player' : `foe:${t.uid}`;
}

function centerOf(el: Element | null): { x: number; y: number } | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const unitEl = (uid: number) => document.querySelector(`[data-uid="${uid}"]`);
const heroEl = (p: 0 | 1) => document.querySelector(`[data-player="${p}"]`);

export function Game({ level, onExit }: { level: CpuLevel; onExit: () => void }) {
  const [seed, setSeed] = useState(() => (Date.now() & 0x7fffffff) >>> 0);
  const [game, setGame] = useState<GameState>(() => createGame(DECKS, seed));
  const gameRef = useRef(game);
  const brainRef = useRef(createBrain());
  const randRef = useRef(makeRng(seed ^ 0x9e3779b9));
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const pausedRef = useRef(false);
  pausedRef.current = sheet !== null;

  const commit = useCallback((s: GameState) => {
    gameRef.current = s;
    setGame(s);
  }, []);

  // ---- 時間を進める（CPU もここで動く） ----
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      const cur = gameRef.current;
      if (!pausedRef.current && !cur.result) {
        let s = step(cur, { type: 'tick', dt });
        const r = cpuStep(s, 1, brainRef.current, level, randRef.current);
        brainRef.current = r.brain;
        for (const a of r.actions) s = step(s, a);
        commit(s);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [level, commit, seed]);

  // ---- BGM ----
  useEffect(() => {
    startBgm();
    return () => stopBgm();
  }, []);
  const overtime = game.time >= DOUBLE_COIN_FROM_MS;
  useEffect(() => {
    if (!overtime) return;
    setBgmTension(1);
    playHorn();
  }, [overtime]);

  // ---- 出来事ごとの演出 ----
  const [popups, setPopups] = useState<Popup[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const fxId = useRef(1);
  const seenEvent = useRef(0);
  /** 足止めされているカード（攻撃待ちが明けるまで鎖を出す）。 */
  const [stunned, setStunned] = useState<Set<number>>(() => new Set());

  const addPopup = useCallback((el: Element | null, text: string, tone: Popup['tone']) => {
    const c = centerOf(el);
    if (!c) return;
    const id = fxId.current++;
    setPopups((ps) => [...ps, { id, x: c.x, y: c.y, text, tone }]);
    window.setTimeout(() => setPopups((ps) => ps.filter((p) => p.id !== id)), 900);
  }, []);

  const flash = (el: Element | null) => {
    if (el) animate(el, { filter: ['brightness(2.4) saturate(0.4)', 'brightness(1) saturate(1)'] }, { duration: 0.32 });
  };

  useEffect(() => {
    const fresh = game.events.filter((e) => e.id > seenEvent.current);
    if (fresh.length === 0) return;
    seenEvent.current = fresh[fresh.length - 1]!.id;
    playBatch(fresh);
    // playBatch は描画済みの DOM を読むだけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.events]);

  /** 1 回の操作で起きた出来事をまとめて演出する。攻撃は突進が当たる瞬間に、
   *  召喚の能力は弾が届く瞬間に、ダメージの数字と音を合わせる。 */
  function playBatch(batch: GameEvent[]) {
    const attackEv = batch.find((e) => e.kind === 'attack');
    const summonEv = batch.find((e) => e.kind === 'summon' && !e.token);
    const delay = attackEv ? HIT_AT_MS : summonEv ? SHOT_AT_MS : 0;

    for (const e of batch) {
      if (e.kind === 'attack') lunge(e);
      if (e.kind === 'summon') {
        if (!e.token) playSummon(CARDS[e.card].summon);
        if (e.p === 0 && !e.token) hapticUseCard();
      }
      if (e.kind === 'end') {
        const r = gameRef.current.result;
        if (r?.winner === 0) {
          playWin();
          hapticWin();
        } else {
          playLose();
          hapticLose();
        }
      }
    }

    // 召喚の能力（狙撃・足止）は、召喚したカードから弾を飛ばす
    if (summonEv && summonEv.kind === 'summon') {
      const hitUid = batch.flatMap((e) =>
        (e.kind === 'damage' && e.target.kind === 'unit') || e.kind === 'stun'
          ? [e.kind === 'stun' ? e.uid : (e.target as { uid: number }).uid]
          : [],
      )[0];
      if (hitUid !== undefined) {
        window.setTimeout(() => {
          const a = centerOf(unitEl(summonEv.uid));
          const b = centerOf(unitEl(hitUid));
          if (!a || !b) return;
          const id = fxId.current++;
          setShots((ss) => [...ss, { id, x0: a.x, y0: a.y, x1: b.x, y1: b.y }]);
          window.setTimeout(() => setShots((ss) => ss.filter((s) => s.id !== id)), 400);
        }, 0);
      }
    }

    window.setTimeout(() => {
      let hitKind: 'player' | 'blocker' | 'unit' | null = null;
      for (const e of batch) {
        if (e.kind === 'damage') {
          if (e.target.kind === 'player') {
            const el = heroEl(e.p);
            addPopup(el, `-${e.amount}`, 'face');
            if (el) animate(el, { x: [0, -7, 7, -5, 5, 0] }, { duration: 0.32 });
            if (e.p === 0) hapticImpact([28]);
            hitKind = 'player';
          } else {
            const el = unitEl(e.target.uid);
            if (e.guard === 'barrier') {
              addPopup(el, '結界', 'guard');
              playBarrier();
            } else {
              addPopup(el, `-${e.amount}`, e.guard === 'armor' ? 'guard' : 'dmg');
              flash(el);
            }
            const card = el?.getAttribute('data-card') as CardId | null;
            if (hitKind !== 'player') hitKind = card && isBlocker(card) ? 'blocker' : 'unit';
          }
        }
        if (e.kind === 'heal') {
          addPopup(heroEl(e.p), `+${e.amount}`, 'heal');
          playHeal();
        }
        if (e.kind === 'stun') {
          addPopup(unitEl(e.uid), '足止', 'stun');
          playStun();
          setStunned((s) => new Set(s).add(e.uid));
        }
      }
      if (hitKind) playHit(hitKind);
      if (batch.some((e) => e.kind === 'death')) playDeath();
    }, delay);
  }

  function lunge(e: Extract<GameEvent, { kind: 'attack' }>) {
    const atkEl = unitEl(e.uid);
    const tgtEl = e.target.kind === 'player' ? heroEl(e.p === 0 ? 1 : 0) : unitEl(e.target.uid);
    const a = centerOf(atkEl);
    const b = centerOf(tgtEl);
    if (!atkEl || !a || !b) return;
    const dx = (b.x - a.x) * 0.55;
    const dy = (b.y - a.y) * 0.55;
    animate(atkEl, { x: [0, dx, 0], y: [0, dy, 0], scale: [1, 1.14, 1] }, { duration: 0.36, times: [0, 0.42, 1], ease: 'easeOut' });
  }

  // 足止めが明けたら鎖を外す
  useEffect(() => {
    if (stunned.size === 0) return;
    const still = new Set<number>();
    for (const uid of stunned) {
      const u = findUnit(game.players[0], uid)?.unit ?? findUnit(game.players[1], uid)?.unit;
      if (u && game.time < u.readyAt) still.add(uid);
    }
    if (still.size !== stunned.size) setStunned(still);
  }, [game, stunned]);

  // ---- 断られた操作の理由 ----
  const [hint, setHint] = useState<{ id: number; text: string } | null>(null);
  const reject = useCallback((text: string) => {
    if (!text) return;
    playReject();
    hapticReject();
    const id = Date.now();
    setHint({ id, text });
    window.setTimeout(() => setHint((h) => (h?.id === id ? null : h)), 1300);
  }, []);

  // ---- 操作 ----
  const pressRef = useRef<Press | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const fieldRef = useRef<HTMLDivElement>(null);

  /** 手札を落とす枠: 自分の場の上なら、指にいちばん近い空き枠。 */
  const slotAt = useCallback((x: number, y: number): number | null => {
    const row = fieldRef.current;
    if (!row) return null;
    const r = row.getBoundingClientRect();
    if (y < r.top - 40 || y > r.bottom + 40 || x < r.left - 20 || x > r.right + 20) return null;
    const field = gameRef.current.players[0].field;
    let best: number | null = null;
    let bestD = Infinity;
    row.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => {
      const i = Number(el.dataset.slot);
      if (field[i]) return;
      const d = Math.abs(centerOf(el)!.x - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }, []);

  const dropKeyAt = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
    return el?.dataset.drop ?? null;
  };

  const onPressStart = (e: ReactPointerEvent, p: { kind: 'hand'; index: number } | { kind: 'unit'; uid: number }) => {
    if (gameRef.current.result || pressRef.current) return;
    primeAudio();
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // 合成イベントなどで捕まえられなくても続行
    }
    const timer = window.setTimeout(() => {
      const cur = pressRef.current;
      if (!cur) return;
      pressRef.current = null;
      const s = gameRef.current;
      if (cur.kind === 'hand') {
        const card = s.players[0].hand[cur.index];
        if (card) setSheet({ kind: 'card', card });
      } else {
        const u = findUnit(s.players[0], cur.uid)?.unit;
        if (u) setSheet({ kind: 'card', card: u.card, hp: u.hp });
      }
      playUiTap();
    }, LONG_PRESS_MS);
    pressRef.current = { ...p, x0: e.clientX, y0: e.clientY, timer } as Press;
  };

  const handOver = (index: number, x: number, y: number): string | null => {
    const card = gameRef.current.players[0].hand[index];
    if (!card || !needsTarget(card)) return null;
    const key = dropKeyAt(x, y);
    return key?.startsWith('foe:') ? key : null;
  };

  const onPressMove = (e: ReactPointerEvent) => {
    const press = pressRef.current;
    const d = dragRef.current;
    const { clientX: x, clientY: y } = e;
    if (press && !d) {
      if (Math.hypot(x - press.x0, y - press.y0) < DRAG_THRESHOLD_PX) return;
      window.clearTimeout(press.timer);
      if (press.kind === 'hand') {
        setDrag({ kind: 'hand', index: press.index, x, y, slot: slotAt(x, y), over: handOver(press.index, x, y) });
      } else {
        const c = centerOf(unitEl(press.uid)) ?? { x: press.x0, y: press.y0 };
        setDrag({ kind: 'unit', uid: press.uid, sx: c.x, sy: c.y, x, y, over: null });
      }
      return;
    }
    if (!d) return;
    if (d.kind === 'hand') setDrag({ ...d, x, y, slot: slotAt(x, y), over: handOver(d.index, x, y) });
    else setDrag({ ...d, x, y, over: dropKeyAt(x, y) });
  };

  const onPressEnd = () => {
    const press = pressRef.current;
    if (press) window.clearTimeout(press.timer);
    pressRef.current = null;
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    const s = gameRef.current;
    if (d.kind === 'hand') {
      // 狙撃・足止を相手のカードの上で離した: 空いている枠に出して、そのカードを狙う
      if (d.over) {
        const slot = firstEmptySlot(s.players[0]);
        if (slot < 0) return reject(SUMMON_REASON.slot);
        const block = summonBlock(s, 0, d.index, slot);
        if (block) return reject(SUMMON_REASON[block]);
        commit(step(s, { type: 'summon', p: 0, handIndex: d.index, slot, target: Number(d.over.slice(4)) }));
        return;
      }
      if (d.slot === null) {
        const r = fieldRef.current?.getBoundingClientRect();
        const nearField = r && d.y > r.top - 40 && d.y < r.bottom + 40;
        if (nearField && firstEmptySlot(s.players[0]) < 0) reject(SUMMON_REASON.slot);
        return;
      }
      const block = summonBlock(s, 0, d.index, d.slot);
      if (block) return reject(SUMMON_REASON[block]);
      commit(step(s, { type: 'summon', p: 0, handIndex: d.index, slot: d.slot }));
      return;
    }
    if (!d.over) return;
    const target: Target | null =
      d.over === 'foe-player'
        ? { kind: 'player' }
        : d.over.startsWith('foe:')
          ? { kind: 'unit', uid: Number(d.over.slice(4)) }
          : null;
    if (!target) return;
    const block = attackBlock(s, 0, d.uid, target);
    if (block === 'target' && target.kind === 'player' && isWalled(s.players[1])) {
      return reject('相手の場が 5 枚で壁になっています');
    }
    if (block) return reject(ATTACK_REASON[block]);
    commit(step(s, { type: 'attack', p: 0, uid: d.uid, target }));
  };

  const onPressCancel = () => {
    const press = pressRef.current;
    if (press) window.clearTimeout(press.timer);
    pressRef.current = null;
    setDrag(null);
  };

  // ---- 描画用の値 ----
  const me = game.players[0];
  const foe = game.players[1];
  const legal = useMemo(() => new Set(legalTargets(game, 0).map(targetKey)), [game]);
  const unitDrag = drag?.kind === 'unit' ? drag : null;
  const handDrag = drag?.kind === 'hand' ? drag : null;
  const handDragCard = handDrag ? me.hand[handDrag.index] : undefined;
  const aimingSpell = !!handDragCard && needsTarget(handDragCard);
  const dragBlock = unitDrag ? attackBlock(game, 0, unitDrag.uid) : null;

  /** 攻撃待ちの輪の起点。readyAt が変わった時刻を覚える（engine は起点を持たない）。 */
  const cdFrom = useRef(new Map<number, { readyAt: number; from: number }>());
  const cooldownLeft = (u: Unit): number => {
    if (game.time >= u.readyAt) return 0;
    let m = cdFrom.current.get(u.uid);
    if (!m || m.readyAt !== u.readyAt) {
      m = { readyAt: u.readyAt, from: game.time };
      cdFrom.current.set(u.uid, m);
    }
    return Math.min(1, (u.readyAt - game.time) / Math.max(1, u.readyAt - m.from));
  };

  const restart = () => {
    const next = (seed * 1103515245 + 12345) >>> 1;
    seenEvent.current = 0;
    brainRef.current = createBrain();
    randRef.current = makeRng(next ^ 0x9e3779b9);
    cdFrom.current.clear();
    setStunned(new Set());
    setSeed(next);
    commit(createGame(DECKS, next));
  };

  const renderUnit = (u: Unit, side: 0 | 1) => {
    const def = CARDS[u.card];
    const left = cooldownLeft(u);
    const key = targetKey({ kind: 'unit', uid: u.uid });
    const cls = ['unit'];
    if (side === 0 && left === 0 && me.coins >= def.attackCost && !game.result) cls.push('is-ready');
    if (side === 1 && unitDrag) cls.push(legal.has(key) ? 'is-target' : 'is-off');
    if (side === 1 && aimingSpell) cls.push('is-target');
    if (side === 1 && (unitDrag?.over === key ? legal.has(key) : handDrag?.over === key)) cls.push('is-over');
    if (unitDrag?.uid === u.uid) cls.push('is-aiming');
    if (u.barrier) cls.push('is-barrier');
    const pl = game.players[side];
    return (
      <motion.div
        key={u.uid}
        className="unit-wrap"
        initial={{ scale: 0.4, opacity: 0, y: side === 0 ? 30 : -30 }}
        animate={{ scale: 1, opacity: 1, y: 0, transition: { type: 'spring', stiffness: 520, damping: 30 } }}
        exit={{
          scale: 0.7,
          opacity: 0,
          filter: 'grayscale(1)',
          pointerEvents: 'none',
          transition: { delay: HIT_AT_MS / 1000 + 0.12, duration: 0.28 },
        }}
      >
        <div
          className={cls.join(' ')}
          data-uid={u.uid}
          data-card={u.card}
          data-drop={side === 1 ? key : undefined}
          onPointerDown={side === 0 ? (e) => onPressStart(e, { kind: 'unit', uid: u.uid }) : undefined}
          onPointerMove={side === 0 ? onPressMove : undefined}
          onPointerUp={side === 0 ? onPressEnd : undefined}
          onPointerCancel={side === 0 ? onPressCancel : undefined}
          onContextMenu={(e) => e.preventDefault()}
        >
          <CardFace card={u.card} hp={u.hp} atk={attackOf(pl, u)} />
          {left > 0 ? <span className="unit-cd" style={{ ['--cd' as string]: `${left * 360}deg` }} aria-hidden="true" /> : null}
          {stunned.has(u.uid) && left > 0 ? <span className="unit-stun" aria-label="足止め中" /> : null}
        </div>
      </motion.div>
    );
  };

  const fieldRow = (side: 0 | 1) =>
    game.players[side].field.map((u, i) => (
      <div
        key={i}
        className={`slot${side === 0 && handDrag && !handDrag.over && handDrag.slot === i ? ' is-drop' : ''}`}
        data-slot={side === 0 ? i : undefined}
      >
        <AnimatePresence>{u ? renderUnit(u, side) : null}</AnimatePresence>
      </div>
    ));

  const foeKey = 'foe-player';
  const foeCls = ['hero', 'hero-foe'];
  if (unitDrag) foeCls.push(legal.has(foeKey) ? 'is-target' : 'is-off');
  if (unitDrag?.over === foeKey && legal.has(foeKey)) foeCls.push('is-over');

  const remaining = MATCH_MS - game.time;
  const coinInt = Math.floor(me.coins);
  const coinFrac = me.coins - coinInt;
  const nextCard = me.queue[0];
  const dragInfo = handDragCard ? abilityLines(handDragCard)[0] : null;

  return (
    <div className="app app-game">
      <header className="header">
        <div className="header-row">
          <div className="header-left">
            <button
              className="icon-btn"
              aria-label="もどる"
              onClick={() => {
                playUiTap();
                if (game.result) onExit();
                else setSheet({ kind: 'quit' });
              }}
            >
              <BackIcon />
            </button>
          </div>
          <h1 className="title">CPU（{LEVEL_NAME[level]}）</h1>
          <div className="header-actions">
            <button
              className="icon-btn"
              aria-label="あそびかた"
              onClick={() => {
                playUiTap();
                setSheet({ kind: 'help' });
              }}
            >
              <span className="icon-q">?</span>
            </button>
            <button
              className="icon-btn"
              aria-label="設定"
              onClick={() => {
                playUiTap();
                setSheet({ kind: 'settings' });
              }}
            >
              <SettingsIcon />
            </button>
          </div>
        </div>
        <div className="status-bar">
          <span className={`stat${remaining <= 30_000 ? ' is-urgent' : ''}`}>
            <span className="stat-label">のこり</span>
            <span className="stat-num">{formatClock(remaining)}</span>
          </span>
          {overtime ? <span className="stat stat-double">コイン 2 倍</span> : null}
        </div>
      </header>

      {/* 盤面・コイン・手札を 1 枚のボードに載せる */}
      <main className="play battle" style={{ backgroundImage: `url(${FIELD_URL})` }}>
        <div className="arena">
          <div className={foeCls.join(' ')} data-player={1} data-drop={foeKey}>
            <HeroBadge hp={foe.hp} label="あいて" walled={isWalled(foe)} />
            <span className="hero-coins">
              <img src={COIN_URL} alt="" />
              {Math.floor(foe.coins)}
            </span>
          </div>
          <div className="field field-foe">{fieldRow(1)}</div>
          <div className="midline" aria-hidden="true" />
          <div className="field field-me" ref={fieldRef}>
            {fieldRow(0)}
          </div>
          <div className="hero hero-me" data-player={0}>
            <HeroBadge hp={me.hp} label="あなた" walled={isWalled(me)} />
          </div>
        </div>

        <div className="tray">
          <div className="coin-gauge" aria-label={`コイン ${coinInt}`}>
            <span className="coin-count">
              <img src={COIN_URL} alt="" />
              <b>{coinInt}</b>
            </span>
            <div className="coin-cells">
              {Array.from({ length: COIN_MAX }, (_, i) => (
                <span key={i} className="coin-cell">
                  <span className="coin-fill" style={{ transform: `scaleX(${i < coinInt ? 1 : i === coinInt ? coinFrac : 0})` }} />
                </span>
              ))}
            </div>
          </div>

          <div className="hand-row">
            <div className="next-card">
              <span className="next-label">つぎ</span>
              <div className="next-slot">{nextCard ? <CardFace card={nextCard} small /> : null}</div>
            </div>
            <div className="hand">
              {me.hand.map((card, i) => {
                const cost = CARDS[card].summon;
                const lack = Math.max(0, Math.min(1, 1 - me.coins / cost));
                const dragging = handDrag?.index === i;
                return (
                  <div className="hand-slot" key={i}>
                    <AnimatePresence initial={false}>
                      <motion.div
                        key={`${card}-${i}-${game.nextUid}`}
                        className={`hand-card${lack === 0 ? ' is-affordable' : ''}${dragging ? ' is-lifted' : ''}`}
                        initial={{ y: 26, opacity: 0, scale: 0.85 }}
                        animate={{ y: 0, opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 460, damping: 32 } }}
                        exit={{ opacity: 0, pointerEvents: 'none', transition: { duration: 0.12 } }}
                        onPointerDown={(e) => onPressStart(e, { kind: 'hand', index: i })}
                        onPointerMove={onPressMove}
                        onPointerUp={onPressEnd}
                        onPointerCancel={onPressCancel}
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        <CardFace card={card} />
                        {lack > 0 ? <span className="hand-wait" style={{ height: `${lack * 100}%` }} /> : null}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {hint ? (
            <motion.div
              key={hint.id}
              className="hint"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, pointerEvents: 'none' }}
            >
              {hint.text}
            </motion.div>
          ) : dragInfo ? (
            <motion.div key="info" className="hint hint-info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {dragInfo}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>

      {/* ドラッグ中の札・矢印 */}
      {handDrag && handDragCard ? (
        <div className={`drag-ghost${handDrag.over ? ' is-aiming' : ''}`} style={{ left: handDrag.x, top: handDrag.y }}>
          <CardFace card={handDragCard} />
        </div>
      ) : null}
      {unitDrag ? (
        <svg className="aim" aria-hidden="true">
          <line x1={unitDrag.sx} y1={unitDrag.sy} x2={unitDrag.x} y2={unitDrag.y} className={dragBlock ? 'aim-line is-blocked' : 'aim-line'} />
          <circle cx={unitDrag.x} cy={unitDrag.y} r={10} className={dragBlock ? 'aim-dot is-blocked' : 'aim-dot'} />
        </svg>
      ) : null}

      {/* 狙撃・足止の弾 */}
      <svg className="aim" aria-hidden="true">
        {shots.map((s) => (
          <motion.circle
            key={s.id}
            r={7}
            className="shot"
            initial={{ cx: s.x0, cy: s.y0, opacity: 1 }}
            animate={{ cx: s.x1, cy: s.y1, opacity: [1, 1, 0], transition: { duration: SHOT_AT_MS / 1000, ease: 'easeIn' } }}
          />
        ))}
      </svg>

      <div className="popups" aria-hidden="true">
        <AnimatePresence>
          {popups.map((p) => (
            <motion.span
              key={p.id}
              className={`popup popup-${p.tone}`}
              style={{ left: p.x, top: p.y }}
              initial={{ opacity: 0, y: 0, scale: 0.6 }}
              animate={{ opacity: [0, 1, 1, 0], y: -38, scale: 1, transition: { duration: 0.85, times: [0, 0.15, 0.7, 1] } }}
              exit={{ opacity: 0 }}
            >
              {p.text}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {game.result ? (
          <motion.div
            key="result"
            className="result"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.5 } }}
            exit={{ opacity: 0, pointerEvents: 'none' }}
          >
            <motion.div
              className="result-card"
              initial={{ scale: 0.7, y: 20 }}
              animate={{ scale: 1, y: 0, transition: { delay: 0.5, type: 'spring', stiffness: 380, damping: 22 } }}
            >
              <p className={`result-title is-${game.result.winner === 0 ? 'win' : game.result.winner === null ? 'draw' : 'lose'}`}>
                {game.result.winner === 0 ? 'かち！' : game.result.winner === null ? 'ひきわけ' : 'まけ…'}
              </p>
              <p className="result-sub">
                {game.result.reason === 'time' ? '時間切れ' : 'HP が 0 になった'}　あなた {me.hp} / あいて {foe.hp}
              </p>
              <div className="result-buttons">
                <button
                  className="home-btn primary"
                  onClick={() => {
                    playUiTap();
                    restart();
                  }}
                >
                  もう一度
                </button>
                <button
                  className="home-btn"
                  onClick={() => {
                    playUiTap();
                    onExit();
                  }}
                >
                  ホームへ
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {sheet?.kind === 'help' ? (
          <Sheet key="help" title="あそびかた" onClose={() => setSheet(null)}>
            <HelpBody />
          </Sheet>
        ) : null}
        {sheet?.kind === 'settings' ? <SettingsSheet key="settings" onClose={() => setSheet(null)} /> : null}
        {sheet?.kind === 'quit' ? (
          <Sheet key="quit" title="対戦をやめますか？" onClose={() => setSheet(null)}>
            <div className="sheet-buttons">
              <button
                className="sheet-btn"
                onClick={() => {
                  playUiTap();
                  onExit();
                }}
              >
                やめる
              </button>
              <button
                className="sheet-btn quiet"
                onClick={() => {
                  playUiTap();
                  setSheet(null);
                }}
              >
                つづける
              </button>
            </div>
          </Sheet>
        ) : null}
        {sheet?.kind === 'card' ? (
          <Sheet key="card" title={CARDS[sheet.card].name} onClose={() => setSheet(null)}>
            <CardDetail card={sheet.card} hp={sheet.hp} />
            <button className="sheet-btn" onClick={() => setSheet(null)}>
              とじる
            </button>
          </Sheet>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
