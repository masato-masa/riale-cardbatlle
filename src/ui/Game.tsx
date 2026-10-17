import { animate, AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { cpuStep, createBrain, type CpuLevel } from '@/ai/cpu';
import { CARDS, isBlocker, KEYWORD_TEXT, STARTER_DECK, type CardId } from '@/game/cards';
import {
  attackBlock,
  createGame,
  findUnit,
  legalTargets,
  step,
  summonBlock,
  type GameEvent,
  type GameState,
  type Target,
  type Unit,
} from '@/game/engine';
import { makeRng } from '@/game/rng';
import { COIN_MAX, DOUBLE_COIN_FROM_MS, MATCH_MS, PLAYER_HP } from '@/game/rules';

import { COIN_URL, FIELD_URL } from './art';
import { startBgm, setBgmTension, stopBgm } from './bgm';
import { CardFace } from './CardFace';
import { hapticImpact, hapticLose, hapticReject, hapticUseCard, hapticWin } from './haptics';
import { SettingsIcon } from './icons';
import { SettingsSheet } from './SettingsSheet';
import { Sheet } from './Sheets';
import {
  playDeath,
  playHit,
  playHorn,
  playLose,
  playReject,
  playSummon,
  playUiTap,
  playWin,
  primeAudio,
} from './sound';

const DRAG_THRESHOLD_PX = 7;
const LONG_PRESS_MS = 420;
/** 攻撃の突進で、当たる瞬間までの時間（ms）。数字とダメージ音をここに合わせる。 */
const HIT_AT_MS = 150;

const LEVEL_NAME: Record<CpuLevel, string> = { easy: 'よわい', normal: 'ふつう', hard: 'つよい' };

type Press =
  | { kind: 'hand'; index: number; x0: number; y0: number; timer: number }
  | { kind: 'unit'; uid: number; x0: number; y0: number; timer: number };

type Drag =
  | { kind: 'hand'; index: number; x: number; y: number; slot: number | null }
  | { kind: 'unit'; uid: number; sx: number; sy: number; x: number; y: number; over: string | null };

interface Popup {
  id: number;
  x: number;
  y: number;
  text: string;
  tone: 'dmg' | 'face';
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

export function Game({ level, onExit }: { level: CpuLevel; onExit: () => void }) {
  const [seed, setSeed] = useState(() => (Date.now() & 0x7fffffff) >>> 0);
  const [game, setGame] = useState<GameState>(() => createGame([STARTER_DECK, STARTER_DECK], seed));
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
  const popupId = useRef(1);
  const seenEvent = useRef(0);
  const addPopup = useCallback((el: Element | null, text: string, tone: Popup['tone']) => {
    const c = centerOf(el);
    if (!c) return;
    const id = popupId.current++;
    setPopups((ps) => [...ps, { id, x: c.x, y: c.y, text, tone }]);
    window.setTimeout(() => setPopups((ps) => ps.filter((p) => p.id !== id)), 900);
  }, []);

  useEffect(() => {
    const fresh = game.events.filter((e) => e.id > seenEvent.current);
    if (fresh.length === 0) return;
    seenEvent.current = fresh[fresh.length - 1]!.id;
    for (const e of fresh) handleEvent(e);
    // handleEvent は描画済みの DOM を読むだけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.events]);

  function handleEvent(e: GameEvent) {
    const s = gameRef.current;
    if (e.kind === 'summon') {
      const unit = findUnit(s.players[e.p], e.uid)?.unit;
      if (unit) playSummon(CARDS[unit.card].summon);
      if (e.p === 0) hapticUseCard();
      return;
    }
    if (e.kind === 'attack') {
      const atkEl = document.querySelector(`[data-uid="${e.uid}"]`);
      const tgtEl =
        e.target.kind === 'player'
          ? document.querySelector(`[data-player="${e.p === 0 ? 1 : 0}"]`)
          : document.querySelector(`[data-uid="${e.target.uid}"]`);
      const a = centerOf(atkEl);
      const b = centerOf(tgtEl);
      if (atkEl && a && b) {
        const dx = (b.x - a.x) * 0.55;
        const dy = (b.y - a.y) * 0.55;
        animate(
          atkEl,
          { x: [0, dx, 0], y: [0, dy, 0], scale: [1, 1.14, 1] },
          { duration: 0.36, times: [0, 0.42, 1], ease: 'easeOut' },
        );
      }
      const targetCard =
        e.target.kind === 'unit' ? tgtEl?.getAttribute('data-card') : null;
      window.setTimeout(() => {
        if (e.target.kind === 'player') {
          playHit('player');
          addPopup(tgtEl, `-${e.dealt}`, 'face');
          if (tgtEl) animate(tgtEl, { x: [0, -7, 7, -5, 5, 0] }, { duration: 0.32 });
          if (e.p === 1) hapticImpact([28]);
        } else {
          playHit(targetCard && isBlocker(targetCard as CardId) ? 'blocker' : 'unit');
          addPopup(tgtEl, `-${e.dealt}`, 'dmg');
          if (e.taken > 0) addPopup(atkEl, `-${e.taken}`, 'dmg');
        }
      }, HIT_AT_MS);
      return;
    }
    if (e.kind === 'death') {
      playDeath();
      return;
    }
    if (e.kind === 'end') {
      const r = s.result;
      if (r?.winner === 0) {
        playWin();
        hapticWin();
      } else {
        playLose();
        hapticLose();
      }
    }
  }

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
      const c = centerOf(el)!;
      const d = Math.abs(c.x - x);
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

  const onPressMove = (e: ReactPointerEvent) => {
    const press = pressRef.current;
    const d = dragRef.current;
    if (press && !d) {
      if (Math.hypot(e.clientX - press.x0, e.clientY - press.y0) < DRAG_THRESHOLD_PX) return;
      window.clearTimeout(press.timer);
      if (press.kind === 'hand') {
        setDrag({ kind: 'hand', index: press.index, x: e.clientX, y: e.clientY, slot: slotAt(e.clientX, e.clientY) });
      } else {
        const c = centerOf(document.querySelector(`[data-uid="${press.uid}"]`)) ?? { x: press.x0, y: press.y0 };
        setDrag({ kind: 'unit', uid: press.uid, sx: c.x, sy: c.y, x: e.clientX, y: e.clientY, over: null });
      }
      return;
    }
    if (!d) return;
    if (d.kind === 'hand') setDrag({ ...d, x: e.clientX, y: e.clientY, slot: slotAt(e.clientX, e.clientY) });
    else setDrag({ ...d, x: e.clientX, y: e.clientY, over: dropKeyAt(e.clientX, e.clientY) });
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
      if (d.slot === null) {
        const anyEmpty = s.players[0].field.some((u) => !u);
        if (!anyEmpty) reject(SUMMON_REASON.slot);
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
    setSeed(next);
    commit(createGame([STARTER_DECK, STARTER_DECK], next));
  };

  const renderUnit = (u: Unit, side: 0 | 1) => {
    const def = CARDS[u.card];
    const left = cooldownLeft(u);
    const key = targetKey({ kind: 'unit', uid: u.uid });
    const cls = ['unit'];
    if (side === 0 && left === 0 && me.coins >= def.attackCost && !game.result) cls.push('is-ready');
    if (side === 1 && unitDrag) cls.push(legal.has(key) ? 'is-target' : 'is-off');
    if (side === 1 && unitDrag?.over === key && legal.has(key)) cls.push('is-over');
    if (unitDrag?.uid === u.uid) cls.push('is-aiming');
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
          transition: { delay: HIT_AT_MS / 1000 + 0.05, duration: 0.28 },
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
          <CardFace card={u.card} hp={u.hp} />
          {left > 0 ? (
            <span className="unit-cd" style={{ ['--cd' as string]: `${left * 360}deg` }} aria-hidden="true" />
          ) : null}
        </div>
      </motion.div>
    );
  };

  const fieldRow = (side: 0 | 1) => {
    const pl = game.players[side];
    return pl.field.map((u, i) => (
      <div
        key={i}
        className={`slot${side === 0 && drag?.kind === 'hand' && drag.slot === i ? ' is-drop' : ''}`}
        data-slot={side === 0 ? i : undefined}
      >
        <AnimatePresence>{u ? renderUnit(u, side) : null}</AnimatePresence>
      </div>
    ));
  };

  const foeKey = 'foe-player';
  const foeCls = ['hero', 'hero-foe'];
  if (unitDrag) foeCls.push(legal.has(foeKey) ? 'is-target' : 'is-off');
  if (unitDrag?.over === foeKey && legal.has(foeKey)) foeCls.push('is-over');

  const remaining = MATCH_MS - game.time;
  const coinInt = Math.floor(me.coins);
  const coinFrac = me.coins - coinInt;
  const nextCard = me.queue[0];

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

      <main className="play battle">
        <div className="arena" style={{ backgroundImage: `url(${FIELD_URL})` }}>
          <div className={foeCls.join(' ')} data-player={1} data-drop={foeKey}>
            <HeroBadge hp={foe.hp} label="あいて" />
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
            <HeroBadge hp={me.hp} label="あなた" />
          </div>
        </div>

        <div className="coin-gauge" aria-label={`コイン ${coinInt}`}>
          <span className="coin-count">
            <img src={COIN_URL} alt="" />
            <b>{coinInt}</b>
          </span>
          <div className="coin-cells">
            {Array.from({ length: COIN_MAX }, (_, i) => (
              <span key={i} className="coin-cell">
                <span
                  className="coin-fill"
                  style={{ transform: `scaleX(${i < coinInt ? 1 : i === coinInt ? coinFrac : 0})` }}
                />
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
              const dragging = drag?.kind === 'hand' && drag.index === i;
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
          ) : null}
        </AnimatePresence>
      </main>

      {/* ドラッグ中の札・矢印 */}
      {drag?.kind === 'hand' ? (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          <CardFace card={me.hand[drag.index]!} />
        </div>
      ) : null}
      {unitDrag ? (
        <svg className="aim" aria-hidden="true">
          <line
            x1={unitDrag.sx}
            y1={unitDrag.sy}
            x2={unitDrag.x}
            y2={unitDrag.y}
            className={dragBlock ? 'aim-line is-blocked' : 'aim-line'}
          />
          <circle cx={unitDrag.x} cy={unitDrag.y} r={10} className={dragBlock ? 'aim-dot is-blocked' : 'aim-dot'} />
        </svg>
      ) : null}

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

function HeroBadge({ hp, label }: { hp: number; label: string }) {
  const ratio = hp / PLAYER_HP;
  return (
    <span className={`hero-badge${ratio <= 0.3 ? ' is-low' : ''}`}>
      <span className="hero-label">{label}</span>
      <span className="hero-hp">
        <HeartMark />
        <b>{hp}</b>
      </span>
    </span>
  );
}

function CardDetail({ card, hp }: { card: CardId; hp?: number }) {
  const def = CARDS[card];
  return (
    <div className="card-detail">
      <div className="card-detail-face">
        <CardFace card={card} hp={hp} />
      </div>
      <dl className="card-detail-stats">
        <dt>召喚コスト</dt>
        <dd>{def.summon}</dd>
        <dt>アタックコスト</dt>
        <dd>{def.attackCost}</dd>
        <dt>攻撃力</dt>
        <dd>{def.atk}</dd>
        <dt>HP</dt>
        <dd>{hp !== undefined && hp < def.hp ? `${hp} / ${def.hp}` : def.hp}</dd>
      </dl>
      {def.keywords.map((k) => (
        <p key={k} className="card-detail-text">
          {KEYWORD_TEXT[k]}
        </p>
      ))}
    </div>
  );
}

function HelpBody() {
  return (
    <ul className="help-list">
      <li>コインは時間でたまります（最大 10）。最後の 1 分は 2 倍速。</li>
      <li>手札を自分の場へドラッグすると召喚。左上の数字が召喚コストです。</li>
      <li>場のカードを相手のカードか相手の HP へドラッグすると攻撃。右上の数字がアタックコストです。</li>
      <li>カード同士はお互いにダメージを受けます。左下が攻撃力、右下が HP。</li>
      <li>盾のマークはブロッカー。相手にブロッカーがいる間は、ブロッカーしか狙えません。</li>
      <li>相手の HP を 0 にしたら勝ち。3 分たったら HP の多い方の勝ちです。</li>
      <li>カードを長押しすると説明が出ます。</li>
    </ul>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5 L8 12 L15 19" />
    </svg>
  );
}

function HeartMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.5 C5 15.5 2.5 12 2.5 8.5 C2.5 5.6 4.8 3.5 7.5 3.5 C9.4 3.5 11 4.6 12 6.2 C13 4.6 14.6 3.5 16.5 3.5 C19.2 3.5 21.5 5.6 21.5 8.5 C21.5 12 19 15.5 12 20.5 Z"
        fill="#e5484d"
        stroke="#0b1520"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
