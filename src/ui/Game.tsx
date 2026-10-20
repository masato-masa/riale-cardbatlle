import { animate, AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { cpuStep, createBrain, type CpuLevel } from '@/ai/cpu';
import {
  abilityLines,
  CARDS,
  isBlocker,
  needsTarget,
  requiresTarget,
  RIVAL_DECK,
  summonSide,
  usageNote,
  type CardId,
} from '@/game/cards';
import {
  attackBlock,
  attackOf,
  createGame,
  findUnit,
  firstEmptySlot,
  isWalled,
  legalTargetsFor,
  abOf,
  isBlockerUnit,
  maxHpOf,
  step,
  summonBlock,
  summonTargets,
  type GameEvent,
  type GameState,
  type Target,
  type Unit,
} from '@/game/engine';
import { makeRng } from '@/game/rng';
import { addResult } from '@/storage/profile';
import { COIN_MAX, DOUBLE_COIN_FROM_MS, FIELD_SLOTS, MATCH_MS, WINDUP_MS } from '@/game/rules';

import { COIN_URL, FIELD_URL, HERO_FOE_URL, HERO_ME_URL } from './art';
import { setBgmTension, startBgm, stopBgm } from './bgm';
import { CardFace, type CardState } from './CardFace';
import { CardDetail, HelpBody, HeroBadge } from './GameParts';
import { hapticImpact, hapticLose, hapticReady, hapticReject, hapticUseCard, hapticWin } from './haptics';
import { Sheet } from './Sheets';
import {
  playBarrier,
  playDeath,
  playHeal,
  playHit,
  playBattleStart,
  playHorn,
  playPickup,
  playLose,
  playReady,
  playReject,
  playSelect,
  playSpellCast,
  playStun,
  playSummon,
  playUiTap,
  playWin,
  primeAudio,
} from './sound';

/** 床の絵（arena.webp）の寸法と、金の帯の縦の位置（0〜1）。絵を差し替えたら測り直す。 */
const FLOOR_W = 800;
const FLOOR_H = 1200;
const FLOOR_BAND = 0.443;

const DRAG_THRESHOLD_PX = 7;
const LONG_PRESS_MS = 420;
/** 攻撃の突進で、当たる瞬間までの時間（ms）。数字とダメージ音をここに合わせる。 */
const HIT_AT_MS = 230;
/** 狙撃・呪文・砲撃の弾が届くまでの時間（ms）。 */
const SHOT_AT_MS = 380;


type Press =
  | { kind: 'hand'; index: number; x0: number; y0: number; timer: number }
  | { kind: 'unit'; uid: number; x0: number; y0: number; timer: number };

type Drag =
  | { kind: 'hand'; index: number; x: number; y: number; slot: number | null; over: string | null; onBoard: boolean }
  | { kind: 'unit'; uid: number; sx: number; sy: number; x: number; y: number; over: string | null };

interface Popup {
  id: number;
  x: number;
  y: number;
  text: string;
  tone: 'dmg' | 'face' | 'heal' | 'guard' | 'stun' | 'poison' | 'buff';
}

/** 着弾の火花・倒れた煙。位置に置いて、CSS のアニメーションが終わったら消す。 */
interface Burst {
  id: number;
  x: number;
  y: number;
  tone: 'hit' | 'face' | 'puff' | 'summon' | 'wave' | 'blast' | 'ice' | 'poison' | 'heal' | 'buff' | 'seal' | 'drain' | 'pierce' | 'cross' | 'coin' | 'guard';
  /** 素材の向き（度）。斬撃が毎回同じ向きにならないようにする。 */
  r: number;
}

/** 弾の種類。arrow=狙撃の矢（金）、rock=落石（上から落ちる）、magic=呪文の光。 */
interface Shot {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  tone: 'arrow' | 'rock' | 'magic';
}

/** 場ごとにかかる呪文の効果。quake=地鳴り、block=通行止め。 */
interface Zone {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  tone: 'quake' | 'block';
}

const SUMMON_REASON = {
  coins: 'コインが足りません',
  slot: '場がいっぱいです',
  target: '相手のカードの上で使ってください',
  over: '',
} as const;
const ATTACK_REASON = {
  building: '建築物は攻撃しません',
  disarmed: '攻撃できません',
  cooldown: 'クールタイム中です',
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

/**
 * 線がまたぐカードの上だけ薄くするマスク。始点と終点が載っているカードは薄くしない。
 * 線を引く要素に mask={`url(#${id})`} を付けて使う。
 */
function CrossMask({ id, x0, y0, x1, y1 }: { id: string; x0: number; y0: number; x1: number; y1: number }) {
  const holds = (r: DOMRect, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  const rects: DOMRect[] = [];
  for (const el of document.querySelectorAll('[data-uid], [data-player]')) {
    const r = el.getBoundingClientRect();
    if (holds(r, x0, y0) || holds(r, x1, y1)) continue;
    rects.push(r);
  }
  return (
    <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width="100%" height="100%">
      <rect x={0} y={0} width="100%" height="100%" fill="#fff" />
      {rects.map((r, i) => (
        <rect key={i} x={r.left} y={r.top} width={r.width} height={r.height} rx={8} fill="#3a3a3a" />
      ))}
    </mask>
  );
}

export function Game({ level, deck, onExit }: { level: CpuLevel; deck: CardId[]; onExit: () => void }) {
  const decks: [CardId[], CardId[]] = [deck, RIVAL_DECK];
  const [seed, setSeed] = useState(() => (Date.now() & 0x7fffffff) >>> 0);
  const [game, setGame] = useState<GameState>(() => createGame(decks, seed));
  const gameRef = useRef(game);
  const brainRef = useRef(createBrain());
  const randRef = useRef(makeRng(seed ^ 0x9e3779b9));
  /** 長押しで開いたカードの説明。開いている間は止める。 */
  const [detail, setDetail] = useState<{ card: CardId; hp?: number } | null>(null);
  /** 対戦中のメニュー（止めてから、つづける・あそびかた・やり直し・ホームへ）。 */
  const [menu, setMenu] = useState<'menu' | 'help' | null>(null);
  /** 登場時に敵を選ぶカードを置いたあと、効かせる敵をタップして選ぶ待ち。選ぶまで時間は止まる。 */
  const [pick, setPick] = useState<{ index: number; slot: number; card: CardId } | null>(null);
  const pausedRef = useRef(false);
  pausedRef.current = detail !== null || menu !== null || pick !== null;
  /** 開始の演出（VS）のあいだは時間を進めない。 */
  const introRef = useRef(true);

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
      if (!pausedRef.current && !introRef.current && !cur.result) {
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
    startBgm('battle');
    return () => stopBgm();
  }, []);
  const overtime = game.time >= DOUBLE_COIN_FROM_MS;
  const [overBanner, setOverBanner] = useState(false);
  useEffect(() => {
    if (!overtime) return;
    setBgmTension(true);
    playHorn();
    setOverBanner(true);
    const t = window.setTimeout(() => setOverBanner(false), 2000);
    return () => window.clearTimeout(t);
  }, [overtime]);

  // ---- 出来事ごとの演出 ----
  const [popups, setPopups] = useState<Popup[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const fxId = useRef(1);
  const seenEvent = useRef(0);
  /** 足止めされているカード（クールタイムが明けるまで鎖を出す）。 */
  const [stunned, setStunned] = useState<Set<number>>(() => new Set());
  const foeFieldRef = useRef<HTMLDivElement>(null);

  const addPopup = useCallback((el: Element | null, text: string, tone: Popup['tone']) => {
    const c = centerOf(el);
    if (!c) return;
    const id = fxId.current++;
    setPopups((ps) => [...ps, { id, x: c.x, y: c.y, text, tone }]);
    window.setTimeout(() => setPopups((ps) => ps.filter((p) => p.id !== id)), 1400);
  }, []);

  // 床の絵の金の帯（縦 45%）を、盤面の仕切りの位置に合わせる。絵は寸法が違う画面でも帯がずれないよう拡大して動かす。
  const [floorBg, setFloorBg] = useState<{ size: string; pos: string } | null>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const mid = document.querySelector('.midline')?.getBoundingClientRect();
      if (!mid) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const y = mid.top + mid.height / 2;
      const k = Math.max(1, ((1 - y / vh) / (1 - FLOOR_BAND)) * 1.01);
      const s = Math.max(vw / FLOOR_W, (vh / FLOOR_H) * k);
      const h = FLOOR_H * s;
      const y0 = Math.min(0, Math.max(vh - h, y - FLOOR_BAND * h));
      setFloorBg({ size: `${FLOOR_W * s}px ${h}px`, pos: `center ${y0}px` });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const [intro, setIntro] = useState(true);
  useEffect(() => {
    setIntro(true);
    introRef.current = true;
    playBattleStart();
    const t = window.setTimeout(() => {
      introRef.current = false;
      setIntro(false);
    }, 2000);
    return () => window.clearTimeout(t);
  }, [seed]);

  /** 決着の閃光（画面全体が一瞬白くなる）。 */
  const [flashOn, setFlash] = useState(false);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const addBurst = useCallback((el: Element | null, tone: Burst['tone']) => {
    const c = centerOf(el);
    if (!c) return;
    const id = fxId.current++;
    setBursts((bs) => [...bs, { id, x: c.x, y: c.y, tone, r: Math.round(-35 + Math.random() * 70) }]);
    window.setTimeout(() => setBursts((bs) => bs.filter((b) => b.id !== id)), 800);
  }, []);

  /** 本体が受けたとき盤面を揺らす（レイアウトは揺れの後で元に戻る）。 */
  const shake = useCallback((power: number) => {
    const el = document.querySelector('.arena');
    if (el) animate(el, { x: [0, -power, power, -power * 0.6, power * 0.6, 0], y: [0, power * 0.5, -power * 0.5, 0, 0, 0] }, { duration: 0.38 });
  }, []);

  const shoot = useCallback((from: Element | null, to: Element | null, tone: Shot['tone'] = 'arrow') => {
    const b = centerOf(to);
    // 落石は対象の真上から落ちてくる
    const a = tone === 'rock' && b ? { x: b.x, y: b.y - 320 } : centerOf(from);
    if (!a || !b) return;
    const id = fxId.current++;
    setShots((ss) => [...ss, { id, x0: a.x, y0: a.y, x1: b.x, y1: b.y, tone }]);
    window.setTimeout(() => setShots((ss) => ss.filter((s) => s.id !== id)), SHOT_AT_MS + 200);
  }, []);

  const [zones, setZones] = useState<Zone[]>([]);
  const addZone = useCallback((row: Element | null, tone: Zone['tone']) => {
    if (!row) return;
    const r = row.getBoundingClientRect();
    const id = fxId.current++;
    setZones((zs) => [...zs, { id, x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12, tone }]);
    window.setTimeout(() => setZones((zs) => zs.filter((z) => z.id !== id)), 1300);
  }, []);

  /** 当たった側を、攻撃元と反対へ押し込んで戻す。 */
  const recoil = (target: Element | null, from: Element | null, px = 9) => {
    const a = centerOf(from);
    const b = centerOf(target);
    if (!target || !a || !b) return;
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const dx = ((b.x - a.x) / d) * px;
    const dy = ((b.y - a.y) / d) * px;
    animate(target, { x: [0, dx, 0], y: [0, dy, 0] }, { duration: 0.28, ease: 'easeOut' });
  };

  const flash = (el: Element | null) => {
    if (el) animate(el, { filter: ['brightness(2.4) saturate(0.4)', 'brightness(1) saturate(1)'] }, { duration: 0.55 });
  };

  useEffect(() => {
    const fresh = game.events.filter((e) => e.id > seenEvent.current);
    if (fresh.length === 0) return;
    seenEvent.current = fresh[fresh.length - 1]!.id;
    playBatch(fresh);
    // playBatch は描画済みの DOM を読むだけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.events]);

  /** 1 回の操作で起きた出来事をまとめて演出する。選んだ瞬間（溜めに入る）は小さな合図だけ。
   *  溜めが明けて効いた瞬間に、攻撃は突進が当たるところで、狙撃・呪文・砲撃は弾が届くところで、
   *  ダメージの数字と音を出す。 */
  function playBatch(batch: GameEvent[]) {
    const attackEv = batch.find((e) => e.kind === 'attack');
    const shotEv = batch.find((e) => e.kind === 'ability' || e.kind === 'spell' || e.kind === 'pulse');
    const delay = attackEv ? HIT_AT_MS : shotEv ? SHOT_AT_MS : 0;
    const firstHitUid = batch.flatMap((e) =>
      e.kind === 'damage' && e.target.kind === 'unit' ? [e.target.uid] : e.kind === 'stun' ? [e.uid] : [],
    )[0];

    for (const e of batch) {
      if (e.kind === 'summon') {
        // 着地の輪。枠は描画のあとで出来るので、1 フレーム待って位置を読む
        window.setTimeout(() => addBurst(unitEl(e.uid), 'summon'), 60);
        if (!e.token) playSummon(CARDS[e.card].summon);
        if (e.p === 0 && !e.token) hapticUseCard();
      }
      if (e.kind === 'windup') {
        const x = e.pending;
        if (x.kind === 'spell') playSpellCast();
        else if (x.kind === 'attack') playSelect();
        if (e.p === 0) hapticUseCard();
      }
      if (e.kind === 'reserve' && e.p === 0) playSelect();
      if (e.kind === 'cancel') {
        const x = e.pending;
        const at = x.kind === 'spell' ? heroEl(x.p) : (unitEl(x.uid) ?? heroEl(x.p));
        addPopup(at, '中断', 'stun');
        if (e.p === 0) playReject();
      }
      if (e.kind === 'attack') lunge(e);
      if (e.kind === 'ability') {
        const card = unitEl(e.uid)?.getAttribute('data-card') as CardId | null;
        shoot(unitEl(e.uid), unitEl(e.target), card && CARDS[card].ab.onSummon?.kind === 'destroy' ? 'magic' : 'arrow');
      }
      if (e.kind === 'spell') {
        const eff = CARDS[e.card].ab.spell!;
        // 全体・遅延は相手の場ごと、再動は自分の場ごと光らせる。単体は使った側から弾を飛ばす。
        if (eff.kind === 'bolt' && e.target !== null) shoot(heroEl(e.p), unitEl(e.target), 'rock');
        else {
          const foeSide = eff.kind === 'blast' || eff.kind === 'freeze' || eff.kind === 'poisonAll' || eff.kind === 'sealAll';
          const row = (e.p === 0) === foeSide ? foeFieldRef.current : fieldRef.current;
          if (row) animate(row, { filter: ['brightness(1)', 'brightness(1.9)', 'brightness(1)'] }, { duration: 0.8 });
          if (eff.kind === 'blast' || eff.kind === 'freeze') {
            const tone = eff.kind === 'blast' ? 'quake' : 'block';
            window.setTimeout(() => addZone(row, tone), tone === 'quake' ? 120 : 0);
            // 素材は枠ごとに少しずつずらして出す（爆発 / 氷）
            row?.querySelectorAll('.slot').forEach((slot, i) =>
              window.setTimeout(() => addBurst(slot, tone === 'quake' ? 'blast' : 'ice'), (tone === 'quake' ? 140 : 40) + i * 90),
            );
            if (eff.kind === 'blast') window.setTimeout(() => shake(8), 220);
          }
        }
      }
      if (e.kind === 'pulse' && firstHitUid !== undefined) shoot(unitEl(e.uid), unitEl(firstHitUid));
      if (e.kind === 'pulse') flash(unitEl(e.uid));
      if (e.kind === 'end') {
        const r = gameRef.current.result;
        addResult(r?.winner ?? null);
        // 決着の見せ場: 倒れた側のプレイヤー札で連続の爆発・画面の閃光・大きな揺れ
        if (r && r.reason === 'hp' && r.winner !== null) {
          const loser = heroEl(r.winner === 0 ? 1 : 0);
          [0, 120, 260].forEach((d, i) => window.setTimeout(() => addBurst(loser, i === 1 ? 'blast' : 'face'), d));
          shake(12);
          setFlash(true);
          window.setTimeout(() => setFlash(false), 450);
        }
        if (r?.winner === 0) {
          playWin();
          hapticWin();
        } else {
          playLose();
          hapticLose();
        }
      }
    }

    window.setTimeout(() => {
      let hitKind: 'player' | 'blocker' | 'unit' | null = null;
      for (const e of batch) {
        if (e.kind === 'damage') {
          if (e.target.kind === 'player') {
            const el = heroEl(e.p);
            addPopup(el, `-${e.amount}`, 'face');
            addBurst(el, 'face');
            shake(Math.min(9, 3 + e.amount));
            if (el) animate(el, { x: [0, -9, 9, -6, 6, -3, 0] }, { duration: 0.5 });
            if (e.p === 0) hapticImpact([28]);
            hitKind = 'player';
          } else {
            const el = unitEl(e.target.uid);
            if (e.guard === 'barrier') {
              addPopup(el, '結界', 'guard');
              addBurst(el, 'guard');
              playBarrier();
            } else {
              addPopup(el, `-${e.amount}`, e.guard === 'armor' ? 'guard' : 'dmg');
              const atkEl = attackEv?.kind === 'attack' ? unitEl(attackEv.uid) : null;
              const atkCard = atkEl?.getAttribute('data-card') as CardId | null;
              const atkAb = atkCard ? CARDS[atkCard].ab : null;
              addBurst(el, atkAb?.doubleStrike ? 'cross' : atkAb?.freeAim ? 'pierce' : 'hit');
              addBurst(el, 'wave');
              if (atkAb?.lifesteal) addBurst(atkEl, 'drain');
              flash(el);
              if (attackEv?.kind === 'attack') recoil(el, unitEl(attackEv.uid));
              if (batch.some((x) => x.kind === 'spell')) {
                // 落石: 爆発と地面の揺れ
                addBurst(el, 'blast');
                shake(5);
              }
            }
            const card = el?.getAttribute('data-card') as CardId | null;
            if (hitKind !== 'player') hitKind = card && isBlocker(card) ? 'blocker' : 'unit';
          }
        }
        if (e.kind === 'death') addBurst(unitEl(e.uid), 'puff');
        if (e.kind === 'ability') {
          const card = unitEl(e.uid)?.getAttribute('data-card') as CardId | null;
          if (card && CARDS[card].ab.onSummon?.kind === 'destroy') {
            addBurst(unitEl(e.target), 'blast');
            shake(7);
          }
        }
        if (e.kind === 'cdcut') {
          addPopup(unitEl(e.uid), `-${Math.round(e.ms / 1000)}秒`, 'heal');
          flash(unitEl(e.uid));
          playHeal();
        }
        if (e.kind === 'wipe') {
          // 全破壊: すべてのユニットの上で爆発、画面の閃光と大きな揺れ
          document.querySelectorAll('.unit[data-card]').forEach((el, i) => {
            if (el.getAttribute('data-uid') !== String(e.uid)) window.setTimeout(() => addBurst(el, i % 2 ? 'blast' : 'face'), i * 60);
          });
          shake(14);
          setFlash(true);
          window.setTimeout(() => setFlash(false), 450);
          playHit('player');
        }
        if (e.kind === 'heal') {
          addPopup(heroEl(e.p), `+${e.amount}`, 'heal');
          playHeal();
        }
        if (e.kind === 'healUnit') {
          addPopup(unitEl(e.uid), `+${e.amount}`, 'heal');
          addBurst(unitEl(e.uid), 'heal');
          flash(unitEl(e.uid));
          playHeal();
        }
        if (e.kind === 'buff') {
          addPopup(unitEl(e.uid), `${e.atk ? `攻+${e.atk}` : ''}${e.atk && e.hp ? ' ' : ''}${e.hp ? `体+${e.hp}` : ''}`, 'buff');
          addBurst(unitEl(e.uid), 'buff');
          flash(unitEl(e.uid));
          playReady();
        }
        if (e.kind === 'poison') {
          addPopup(unitEl(e.uid), `毒${e.amount}`, 'poison');
          addBurst(unitEl(e.uid), 'poison');
        }
        if (e.kind === 'seal') {
          addPopup(unitEl(e.uid), '封印', 'guard');
          addBurst(unitEl(e.uid), 'seal');
          playBarrier();
        }
        if (e.kind === 'disarm') {
          addPopup(unitEl(e.uid), '攻撃不能', 'stun');
          addBurst(unitEl(e.uid), 'seal');
          playStun();
        }
        if (e.kind === 'stun') {
          addPopup(unitEl(e.uid), '遅延', 'stun');
          playStun();
          setStunned((s) => new Set(s).add(e.uid));
        }
        if (e.kind === 'ready') {
          addPopup(unitEl(e.uid), '再動', 'heal');
          flash(unitEl(e.uid));
        }
      }
      if (batch.some((e) => e.kind === 'ready')) playHeal();
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
    const lean = dx >= 0 ? 1 : -1;
    // 構え（少し引く）→ 突進（当たる瞬間は HIT_AT_MS）→ 当たって止まる → 勢いよく戻る
    const wrap = atkEl.parentElement;
    if (wrap) {
      wrap.style.zIndex = '6';
      window.setTimeout(() => (wrap.style.zIndex = ''), 700);
    }
    animate(
      atkEl,
      {
        x: [0, -dx * 0.14, dx, dx * 0.9, 0],
        y: [0, -dy * 0.14, dy, dy * 0.9, 0],
        scale: [1, 0.93, 1.2, 1.12, 1],
        rotate: [0, -3 * lean, 5 * lean, 2 * lean, 0],
      },
      { duration: 0.62, times: [0, 0.16, 0.37, 0.5, 1], ease: ['easeOut', 'easeIn', 'easeOut', 'easeInOut'] },
    );
  }

  // 自分のユニットのクールタイムが明けた瞬間: 音・振動・カードが弾んで光る
  const waitingRef = useRef(new Set<number>());
  const [justReady, setJustReady] = useState<Set<number>>(() => new Set());
  useEffect(() => {
    if (game.result) return;
    const waiting = new Set<number>();
    const ready: number[] = [];
    for (const u of game.players[0].field) {
      if (!u || CARDS[u.card].type !== 'unit') continue;
      if (game.time < u.readyAt) waiting.add(u.uid);
      else if (waitingRef.current.has(u.uid)) ready.push(u.uid);
    }
    waitingRef.current = waiting;
    if (ready.length === 0) return;
    playReady();
    hapticReady();
    setJustReady((s) => new Set([...s, ...ready]));
    for (const uid of ready) {
      const el = unitEl(uid);
      if (el) animate(el, { scale: [1, 1.13, 1] }, { type: 'spring', stiffness: 520, damping: 14 });
    }
    window.setTimeout(() => setJustReady((s) => new Set([...s].filter((uid) => !ready.includes(uid)))), 700);
  }, [game]);

  // 足止め・遅延が明けたら鎖を外す
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
  const trayRef = useRef<HTMLDivElement>(null);

  /** 手札を落とす枠: 指の下に自分の枠があればその枠（埋まっていれば上書き）。
   *  枠と枠のすき間などでは、指にいちばん近い空き枠（無ければ近い枠）。 */
  const slotAt = useCallback((x: number, y: number): number | null => {
    const row = fieldRef.current;
    if (!row) return null;
    const r = row.getBoundingClientRect();
    if (y < r.top - 40 || y > r.bottom + 40 || x < r.left - 20 || x > r.right + 20) return null;
    const under = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-slot]');
    if (under && row.contains(under)) return Number(under.dataset.slot);
    const field = gameRef.current.players[0].field;
    if (field.every(Boolean)) {
      let near = 0;
      let nearD = Infinity;
      row.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => {
        const d = Math.abs(centerOf(el)!.x - x);
        if (d < nearD) {
          nearD = d;
          near = Number(el.dataset.slot);
        }
      });
      return near;
    }
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

  /** 手札より上（盤面の上）で離したか。呪文はここで離すと使える。 */
  const onBoardAt = (y: number): boolean => {
    const tray = trayRef.current?.getBoundingClientRect();
    return !!tray && y < tray.top - 10;
  };

  const dropKeyAt = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
    return el?.dataset.drop ?? null;
  };

  const onPressStart = (e: ReactPointerEvent, p: { kind: 'hand'; index: number } | { kind: 'unit'; uid: number }) => {
    if (gameRef.current.result || pressRef.current) return;
    primeAudio();
    // 登場時に選ぶ待ち: 選べる味方をタップしたら選ぶ（それ以外は、ここでは何もしない）
    if (pick) {
      if (p.kind === 'unit' && summonSide(pick.card) === 'ally' && summonTargets(gameRef.current.players[0], pick.card).some((x) => x.uid === p.uid)) confirmPick(p.uid);
      return;
    }
    if (p.kind === 'hand') playPickup();
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
        if (card) setDetail({ card });
      } else {
        const u = findUnit(s.players[0], cur.uid)?.unit;
        if (u) setDetail({ card: u.card, hp: u.hp });
      }
      playUiTap();
    }, LONG_PRESS_MS);
    pressRef.current = { ...p, x0: e.clientX, y0: e.clientY, timer } as Press;
  };

  const handOver = (index: number, x: number, y: number): string | null => {
    const card = gameRef.current.players[0].hand[index];
    if (!card || CARDS[card].type !== 'spell' || !needsTarget(card)) return null;
    const key = dropKeyAt(x, y);
    return key?.startsWith('foe:') ? key : null;
  };

  const handDragAt = (index: number, x: number, y: number): Drag => ({
    kind: 'hand',
    index,
    x,
    y,
    slot: slotAt(x, y),
    over: handOver(index, x, y),
    onBoard: onBoardAt(y),
  });

  const onPressMove = (e: ReactPointerEvent) => {
    const press = pressRef.current;
    const d = dragRef.current;
    const { clientX: x, clientY: y } = e;
    if (press && !d) {
      if (Math.hypot(x - press.x0, y - press.y0) < DRAG_THRESHOLD_PX) return;
      window.clearTimeout(press.timer);
      if (press.kind === 'hand') {
        setDrag(handDragAt(press.index, x, y));
      } else {
        const u = findUnit(gameRef.current.players[0], press.uid)?.unit;
        // 建築物は攻撃しないので、ドラッグしても矢印を出さない
        if (!u || CARDS[u.card].type !== 'unit') {
          pressRef.current = null;
          return reject(ATTACK_REASON.building);
        }
        const c = centerOf(unitEl(press.uid)) ?? { x: press.x0, y: press.y0 };
        setDrag({ kind: 'unit', uid: press.uid, sx: c.x, sy: c.y, x, y, over: null });
      }
      return;
    }
    if (!d) return;
    if (d.kind === 'hand') setDrag(handDragAt(d.index, x, y));
    else setDrag({ ...d, x, y, over: dropKeyAt(x, y) });
  };

  const onPressEnd = () => {
    const press = pressRef.current;
    if (press) window.clearTimeout(press.timer);
    pressRef.current = null;
    const d = dragRef.current;
    setDrag(null);
    if (!d) {
      // ドラッグにならなかった = タップ: カードの情報を見る
      if (press) {
        const cur = gameRef.current;
        if (press.kind === 'hand') {
          const card = cur.players[0].hand[press.index];
          if (card) {
            playUiTap();
            setDetail({ card });
          }
        } else {
          const u = findUnit(cur.players[0], press.uid)?.unit;
          if (u) {
            playUiTap();
            setDetail({ card: u.card, hp: u.hp });
          }
        }
      }
      return;
    }
    const s = gameRef.current;
    if (d.kind === 'hand') {
      const card = s.players[0].hand[d.index];
      if (!card) return;
      const target = d.over ? Number(d.over.slice(4)) : undefined;
      // 呪文: 単体は相手のカードの上、それ以外は盤面の上で離す
      if (CARDS[card].type === 'spell') {
        if (requiresTarget(card) ? target === undefined && !d.onBoard : !d.onBoard) return;
        const block = summonBlock(s, 0, d.index, -1, target);
        if (block) return reject(SUMMON_REASON[block]);
        commit(step(s, { type: 'summon', p: 0, handIndex: d.index, slot: -1, target }));
        return;
      }
      if (d.slot === null) {
        const r = fieldRef.current?.getBoundingClientRect();
        const nearField = r && d.y > r.top - 40 && d.y < r.bottom + 40;
        if (nearField && firstEmptySlot(s.players[0]) < 0) reject(SUMMON_REASON.slot);
        return;
      }
      // 登場時に敵を選ぶカード（狙撃・足止・破壊）: 場に置く操作のあと、効かせる敵をタップして選ぶ。
      // 選ばなければ配置失敗。選べる敵がいなければ、そのまま置く
      if (needsTarget(card)) {
        const choices = summonTargets(s.players[summonSide(card) === 'ally' ? 0 : 1], card);
        if (choices.length > 0) {
          const block0 = summonBlock(s, 0, d.index, d.slot, choices[0]!.uid);
          if (block0) return reject(SUMMON_REASON[block0]);
          playSelect();
          setPick({ index: d.index, slot: d.slot, card });
          return;
        }
      }
      const block = summonBlock(s, 0, d.index, d.slot);
      if (block) return reject(SUMMON_REASON[block]);
      commit(step(s, { type: 'summon', p: 0, handIndex: d.index, slot: d.slot }));
      return;
    }
    const reservedNow = findUnit(s.players[0], d.uid)?.unit.reserved;
    if (!d.over) {
      if (reservedNow) commit(step(s, { type: 'reserve', p: 0, uid: d.uid, target: null }));
      return;
    }
    const target: Target | null =
      d.over === 'foe-player'
        ? { kind: 'player' }
        : d.over.startsWith('foe:')
          ? { kind: 'unit', uid: Number(d.over.slice(4)) }
          : null;
    if (!target) return;
    const block = attackBlock(s, 0, d.uid, target);
    if (block === 'target' && target.kind === 'player' && isWalled(s.players[1])) {
      return reject(`相手の場が ${FIELD_SLOTS} 枚で壁になっています`);
    }
    // クールタイム中（溜め中も）は予約にする。明けた瞬間に攻撃が始まる
    if (block === 'cooldown') {
      commit(step(s, { type: 'reserve', p: 0, uid: d.uid, target }));
      return;
    }
    if (block) return reject(ATTACK_REASON[block]);
    commit(step(s, { type: 'attack', p: 0, uid: d.uid, target }));
  };

  /** 敵カードをタップして選んだ: 置いて、効果を溜める。 */
  const confirmPick = (uid: number) => {
    const p = pick;
    if (!p) return;
    const s = gameRef.current;
    const block = summonBlock(s, 0, p.index, p.slot, uid);
    setPick(null);
    if (block) return reject(SUMMON_REASON[block]);
    commit(step(s, { type: 'summon', p: 0, handIndex: p.index, slot: p.slot, target: uid }));
  };

  /** 敵を選ばずにやめた: 配置失敗（手札もコインもそのまま）。 */
  const cancelPick = (text = '敵を選ばなかったので置けませんでした') => {
    if (!pick) return;
    setPick(null);
    reject(text);
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
  const unitDrag = drag?.kind === 'unit' ? drag : null;
  const legal = useMemo(() => new Set(unitDrag ? legalTargetsFor(game, 0, unitDrag.uid).map(targetKey) : []), [game, unitDrag?.uid]);
  const handDrag = drag?.kind === 'hand' ? drag : null;
  const handDragCard = handDrag ? me.hand[handDrag.index] : undefined;
  const aiming = !!handDragCard && CARDS[handDragCard].type === 'spell' && needsTarget(handDragCard);
  const dragSpell = !!handDragCard && CARDS[handDragCard].type === 'spell';
  const dragBlock = unitDrag ? attackBlock(game, 0, unitDrag.uid) : null;

  /** クールタイムの輪の起点。readyAt が変わった時刻を覚える（engine は起点を持たない）。 */
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
    commit(createGame(decks, next));
  };

  /** 場のカードの状態アイコン。 */
  const statesOf = (u: Unit, left: number): CardState[] => {
    const out: CardState[] = [];
    if (isBlockerUnit(u)) out.push('blocker');
    if (u.barrier) out.push('barrier');
    if (u.stealth) out.push('stealth');
    if (u.endure) out.push('endure');
    if (u.sealed) out.push('seal');
    if (u.poison) out.push('poison');
    if (abOf(u).cannotAttack || game.time < (u.disarmUntil ?? 0)) out.push('disarm');
    if (stunned.has(u.uid) && left > 0) out.push('stun');
    return out;
  };

  const renderUnit = (u: Unit, side: 0 | 1) => {
    const isUnit = CARDS[u.card].type === 'unit';
    const left = isUnit ? cooldownLeft(u) : 0;
    const key = targetKey({ kind: 'unit', uid: u.uid });
    const cls = ['unit'];
    if (side === 0 && isUnit && left === 0 && !game.result) cls.push('is-ready');
    if (side === 1 && unitDrag) cls.push(legal.has(key) ? 'is-target' : 'is-off');
    if (side === 1 && aiming) cls.push('is-target');
    const pickSide = pick ? (summonSide(pick.card) === 'ally' ? 0 : 1) : null;
    const pickable = !!pick && side === pickSide && summonTargets(game.players[side], pick.card).some((x) => x.uid === u.uid);
    if (pick && side === pickSide) cls.push(pickable ? (side === 0 ? 'is-pick is-pick-ally' : 'is-target is-pick') : 'is-off');
    else if (pick && side === 1) cls.push('is-off');
    if (side === 1 && (unitDrag?.over === key ? legal.has(key) : handDrag?.over === key)) cls.push('is-over');
    if (unitDrag?.uid === u.uid) cls.push('is-aiming');
    if (justReady.has(u.uid)) cls.push('is-just-ready');
    if (game.pending.some((x) => x.kind === 'attack' && x.uid === u.uid)) cls.push(side === 0 ? 'is-winding' : 'is-winding is-foe');
    if (u.stealth) cls.push('is-stealth');
    const pl = game.players[side];
    return (
      <motion.div
        key={u.uid}
        className="unit-wrap"
        initial={{ scale: 0.4, opacity: 0, y: side === 0 ? 30 : -30 }}
        animate={{ scale: 1, opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } }}
        exit={{
          scale: [1, 1.1, 0.5],
          rotate: [0, side === 0 ? -4 : 4, side === 0 ? 14 : -14],
          y: [0, -8, side === 0 ? 26 : -26],
          opacity: [1, 1, 0],
          filter: 'grayscale(1) brightness(1.5)',
          pointerEvents: 'none',
          transition: { delay: SHOT_AT_MS / 1000 + 0.1, duration: 0.6, times: [0, 0.25, 1] },
        }}
      >
        <div
          className={cls.join(' ')}
          data-uid={u.uid}
          data-card={u.card}
          data-drop={side === 1 ? key : undefined}
          data-pickable={pickable ? u.uid : undefined}
          onClick={
            pickable
              ? () => confirmPick(u.uid)
              : side === 1 && !pick
                ? () => {
                    // 相手のカードをタップ: 情報を見る
                    playUiTap();
                    setDetail({ card: u.card, hp: u.hp });
                  }
                : undefined
          }
          onPointerDown={side === 0 ? (e) => onPressStart(e, { kind: 'unit', uid: u.uid }) : undefined}
          onPointerMove={side === 0 ? onPressMove : undefined}
          onPointerUp={side === 0 ? onPressEnd : undefined}
          onPointerCancel={side === 0 ? onPressCancel : undefined}
          onContextMenu={(e) => e.preventDefault()}
        >
          <CardFace card={u.card} hp={u.hp} maxHp={maxHpOf(u)} atk={attackOf(pl, u)} states={statesOf(u, left)} />
          {left > 0 ? (
            <span className="unit-cd" style={{ ['--cd' as string]: `${left * 360}deg` }} aria-hidden="true">
              <span className="unit-cd-num">{Math.ceil((u.readyAt - game.time) / 1000)}</span>
            </span>
          ) : null}
        </div>
      </motion.div>
    );
  };

  const fieldRow = (side: 0 | 1) =>
    game.players[side].field.map((u, i) => (
      <div
        key={i}
        className={`slot${side === 0 && handDrag && !dragSpell && !handDrag.over && handDrag.slot === i ? (u ? ' is-drop is-replace' : ' is-drop') : ''}`}
        data-slot={side === 0 ? i : undefined}
      >
        <AnimatePresence>{u ? renderUnit(u, side) : null}</AnimatePresence>
        {pick && side === 0 && pick.slot === i ? (
          <div className="slot-preview" aria-hidden="true">
            <CardFace card={pick.card} />
          </div>
        ) : null}
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
  const dragInfo = handDragCard ? (needsTarget(handDragCard) || CARDS[handDragCard].type === 'spell' ? usageNote(handDragCard) : abilityLines(handDragCard)[0]) ?? null : null;
  const castReady = dragSpell && handDragCard && !requiresTarget(handDragCard) && handDrag?.onBoard;

  return (
    <div
      className="app-battle"
      onPointerDown={(e) => {
        // 敵を選ぶ待ち: 選べる敵のカードと、取りやめボタン以外をタップしたら取りやめ（配置失敗）
        if (!pick) return;
        if ((e.target as Element).closest('[data-pickable], .pick-bar')) return;
        cancelPick();
      }}
      style={{ backgroundImage: `url(${FIELD_URL})`, backgroundSize: floorBg?.size, backgroundPosition: floorBg?.pos }}
    >
      <main className={`battle${castReady ? ' is-casting' : ''}`}>
        <div className="arena">
          <div className="arena-top">
            <span className={`clock${remaining <= 30_000 ? ' is-urgent' : ''}`}>
              {formatClock(remaining)}
              {overtime ? <b className="clock-double">×2</b> : null}
            </span>
            <div className={foeCls.join(' ')} data-player={1} data-drop={foeKey}>
              <HeroBadge hp={foe.hp} label="あいて" walled={isWalled(foe)} portrait={HERO_FOE_URL} />
            </div>
            <span className="hero-coins">
              <img src={COIN_URL} alt="" />
              {Math.floor(foe.coins)}
            </span>
          </div>
          <div className="field field-foe" ref={foeFieldRef}>
            {fieldRow(1)}
          </div>
          <div className="midline" aria-hidden="true" />
          <div className="field field-me" ref={fieldRef}>
            {fieldRow(0)}
          </div>
          <div className="hero hero-me" data-player={0}>
            <HeroBadge hp={me.hp} label="あなた" walled={isWalled(me)} portrait={HERO_ME_URL} />
          </div>
          <button
            className="menu-btn"
            aria-label="メニュー"
            onClick={() => {
              playUiTap();
              setMenu('menu');
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="6" y="5" width="4.2" height="14" rx="1.4" />
              <rect x="13.8" y="5" width="4.2" height="14" rx="1.4" />
            </svg>
          </button>
        </div>

        <div className="tray" ref={trayRef}>
          <div className={`coin-gauge${coinInt >= COIN_MAX ? ' is-full' : ''}`} aria-label={`コイン ${coinInt}`}>
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
                        key={`${card}-${i}`}
                        className={`hand-card${lack === 0 ? ' is-affordable' : ''}${dragging ? ' is-lifted' : ''}`}
                        initial={{ y: 26, opacity: 0, scale: 0.85 }}
                        animate={{ y: 0, opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 30 } }}
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

        {pick ? (
          <div className="pick-bar" role="status">
            <span>効かせる敵カードをタップ</span>
            <button className="pick-cancel" onClick={() => cancelPick('取りやめました')}>
              やめる
            </button>
          </div>
        ) : null}

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
        <div className={`drag-ghost${handDrag.over || castReady ? ' is-aiming' : ''}`} style={{ left: handDrag.x, top: handDrag.y }}>
          <CardFace card={handDragCard} />
        </div>
      ) : null}
      {unitDrag ? (
        <svg className="aim" aria-hidden="true">
          <CrossMask id="xm-drag" x0={unitDrag.sx} y0={unitDrag.sy} x1={unitDrag.x} y1={unitDrag.y} />
          <line
            mask="url(#xm-drag)"
            x1={unitDrag.sx}
            y1={unitDrag.sy}
            x2={unitDrag.x}
            y2={unitDrag.y}
            className={dragBlock === 'cooldown' ? 'aim-line is-reserve' : dragBlock ? 'aim-line is-blocked' : 'aim-line'}
          />
          <circle
            cx={unitDrag.x}
            cy={unitDrag.y}
            r={10}
            className={dragBlock === 'cooldown' ? 'aim-dot is-reserve' : dragBlock ? 'aim-dot is-blocked' : 'aim-dot'}
          />
        </svg>
      ) : null}

      {/* 溜め中の行動: 攻撃元から対象へ矢印、対象に縮んでいく照準。範囲の呪文は場ごと光らせる */}
      <PendingMarks game={game} fieldMe={fieldRef.current} fieldFoe={foeFieldRef.current} />

      {/* 狙撃・呪文・砲撃の弾（尾を引く彗星。落石は上から落ちる） */}
      <div className="shots" aria-hidden="true">
        {shots.map((s) => {
          const angle = s.tone === 'rock' ? 0 : (Math.atan2(s.y1 - s.y0, s.x1 - s.x0) * 180) / Math.PI;
          return (
            <motion.div
              key={s.id}
              className={`comet comet-${s.tone}`}
              style={{ rotate: angle }}
              initial={{ x: s.x0, y: s.y0, opacity: 0, scale: s.tone === 'rock' ? 1.6 : 1 }}
              animate={{
                x: s.x1,
                y: s.y1,
                opacity: [0, 1, 1, 0],
                scale: 1,
                transition: { duration: SHOT_AT_MS / 1000, ease: s.tone === 'rock' ? 'easeIn' : [0.3, 0, 0.9, 0.6], times: [0, 0.1, 0.92, 1] },
              }}
            />
          );
        })}
      </div>

      {/* 場ごとにかかる呪文の効果（地鳴り・通行止め） */}
      <div className="zones" aria-hidden="true">
        {zones.map((z) => (
          <div key={z.id} className={`zone zone-${z.tone}`} style={{ left: z.x, top: z.y, width: z.w, height: z.h }}>
            {z.tone === 'quake' ? (
              <>
                <svg viewBox="0 0 100 40" preserveAspectRatio="none">
                  <path d="M0 22 L14 16 L22 24 L38 12 L47 22 L63 10 L72 21 L86 14 L100 20" />
                  <path d="M30 40 L38 28 L33 20 M70 40 L63 27 L68 18" />
                </svg>
                {[8, 24, 41, 58, 74, 90].map((l, i) => (
                  <i key={l} className="debris" style={{ left: `${l}%`, animationDelay: `${i * 0.04}s` }} />
                ))}
              </>
            ) : (
              <>
                <span className="barricade" />
              </>
            )}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {flashOn ? (
          <motion.div
            key="flash"
            className="screen-flash"
            aria-hidden="true"
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          />
        ) : null}
      </AnimatePresence>

      <div className="bursts" aria-hidden="true">
        {bursts.map((b) => (
          <span key={b.id} className={`burst burst-${b.tone}`} style={{ left: b.x, top: b.y, ['--r' as string]: `${b.r}deg` }} />
        ))}
      </div>

      <AnimatePresence>
        {intro ? (
          <motion.div
            key="intro"
            className="intro"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.15 } }}
            exit={{ opacity: 0, pointerEvents: 'none', transition: { duration: 0.35 } }}
          >
            <div className="intro-duel">
              <motion.div
                className="intro-side is-me"
                initial={{ x: -260, opacity: 0 }}
                animate={{ x: 0, opacity: 1, transition: { type: 'spring', stiffness: 260, damping: 22, delay: 0.1 } }}
              >
                <span className="intro-medal">
                  <img src={HERO_ME_URL} alt="" draggable={false} />
                </span>
                <b>あなた</b>
              </motion.div>
              <motion.span
                className="intro-vs"
                initial={{ scale: 3, opacity: 0, rotate: -12 }}
                animate={{ scale: 1, opacity: 1, rotate: 0, transition: { delay: 0.45, type: 'spring', stiffness: 500, damping: 16 } }}
              >
                VS
              </motion.span>
              <motion.div
                className="intro-side is-foe"
                initial={{ x: 260, opacity: 0 }}
                animate={{ x: 0, opacity: 1, transition: { type: 'spring', stiffness: 260, damping: 22, delay: 0.1 } }}
              >
                <span className="intro-medal">
                  <img src={HERO_FOE_URL} alt="" draggable={false} />
                </span>
                <b>あいて</b>
              </motion.div>
            </div>
            <motion.div
              className="intro-band"
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1, transition: { delay: 0.75, type: 'spring', stiffness: 420, damping: 30 } }}
            >
              <motion.span
                className="intro-text"
                initial={{ x: 140, opacity: 0, scale: 1.3 }}
                animate={{ x: 0, opacity: 1, scale: 1, transition: { delay: 0.85, type: 'spring', stiffness: 360, damping: 22 } }}
              >
                バトル開始！
              </motion.span>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {overBanner ? (
          <motion.div
            key="over"
            className="banner-over"
            aria-hidden="true"
            initial={{ x: '110%' }}
            animate={{ x: 0, transition: { type: 'spring', stiffness: 380, damping: 30 } }}
            exit={{ x: '-110%', opacity: 0, pointerEvents: 'none', transition: { duration: 0.3 } }}
          >
            <span>コイン 2 倍！</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="popups" aria-hidden="true">
        <AnimatePresence>
          {popups.map((p) => (
            <motion.span
              key={p.id}
              className={`popup popup-${p.tone}`}
              style={{ left: p.x, top: p.y }}
              initial={{ opacity: 0, y: 0, scale: 0.6 }}
              animate={{ opacity: [0, 1, 1, 0], y: -44, scale: [0.4, 1.5, 1, 1], transition: { duration: 1.3, times: [0, 0.12, 0.75, 1] } }}
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
            className={`result${game.result.winner === 0 ? ' is-win' : ''}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.5 } }}
            exit={{ opacity: 0, pointerEvents: 'none' }}
          >
            {game.result.winner === 0 ? (
              <div className="confetti" aria-hidden="true">
                {Array.from({ length: 26 }, (_, i) => (
                  <i
                    key={i}
                    style={{
                      left: `${(i * 37) % 100}%`,
                      animationDelay: `${((i * 53) % 18) / 10}s`,
                      animationDuration: `${2.4 + ((i * 29) % 12) / 10}s`,
                      ['--c' as string]: ['#ffd84a', '#ff6b6b', '#6bc4ff', '#7be495', '#d9a8ff'][i % 5],
                    }}
                  />
                ))}
              </div>
            ) : null}
            <motion.div
              className="result-card"
              initial={{ scale: 0.7, y: 20 }}
              animate={{ scale: 1, y: 0, transition: { delay: 0.5, type: 'spring', stiffness: 380, damping: 22 } }}
            >
              {(() => {
                const w = game.result.winner;
                const tone = w === 0 ? 'win' : w === null ? 'draw' : 'lose';
                const stars = w === 0 ? 3 : w === null ? 1 : 0;
                return (
                  <>
                    <div className={`result-ribbon is-${tone}`}>
                      <p className={`result-title is-${tone}`}>{w === 0 ? 'かち！' : w === null ? 'ひきわけ' : 'まけ…'}</p>
                    </div>
                    <div className="result-stars" aria-hidden="true">
                      {[0, 1, 2].map((i) => (
                        <motion.svg
                          key={i}
                          viewBox="0 0 32 32"
                          className={`result-star${i < stars ? ' is-lit' : ''}`}
                          initial={{ scale: 0, rotate: -40 }}
                          animate={{ scale: 1, rotate: 0, transition: { delay: 0.9 + i * 0.18, type: 'spring', stiffness: 420, damping: 14 } }}
                        >
                          <path d="M16 2.5 L20.2 11.2 L29.6 12.4 L22.7 19 L24.5 28.4 L16 23.8 L7.5 28.4 L9.3 19 L2.4 12.4 L11.8 11.2 Z" />
                        </motion.svg>
                      ))}
                    </div>
                    <div className="result-duel">
                      <span className="result-side is-me">
                        <span className="result-medal">
                          <img src={HERO_ME_URL} alt="" draggable={false} />
                        </span>
                        <b>{me.hp}</b>
                      </span>
                      <span className="result-vs">{game.result.reason === 'time' ? '時間切れ' : 'VS'}</span>
                      <span className="result-side is-foe">
                        <span className="result-medal">
                          <img src={HERO_FOE_URL} alt="" draggable={false} />
                        </span>
                        <b>{foe.hp}</b>
                      </span>
                    </div>
                  </>
                );
              })()}
              <div className="result-buttons">
                <button
                  className="res-btn is-gold"
                  onClick={() => {
                    playUiTap();
                    restart();
                  }}
                >
                  もう一度
                </button>
                <button
                  className="res-btn"
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
        {menu === 'menu' ? (
          <Sheet key="menu" title="一時停止" onClose={() => setMenu(null)}>
            <div className="sheet-buttons">
              <button className="sheet-btn" onClick={() => setMenu(null)}>
                つづける
              </button>
              <button className="sheet-btn quiet" onClick={() => setMenu('help')}>
                あそびかた
              </button>
              <button
                className="sheet-btn quiet"
                onClick={() => {
                  setMenu(null);
                  restart();
                }}
              >
                さいしょからやり直す
              </button>
              <button className="sheet-btn quiet" onClick={onExit}>
                ホームへもどる
              </button>
            </div>
          </Sheet>
        ) : null}
        {menu === 'help' ? (
          <Sheet key="help" title="あそびかた" onClose={() => setMenu('menu')}>
            <HelpBody />
            <button className="sheet-btn" onClick={() => setMenu('menu')}>
              もどる
            </button>
          </Sheet>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {detail ? (
          <Sheet key="card" title={CARDS[detail.card].name} onClose={() => setDetail(null)}>
            <CardDetail card={detail.card} hp={detail.hp} />
            <button className="sheet-btn" onClick={() => setDetail(null)}>
              とじる
            </button>
          </Sheet>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** 溜め中の行動の印。描画のたびに要素の位置を読む（盤面は操作で 1px も動かないので、読むだけで足りる）。 */
function PendingMarks({ game, fieldMe, fieldFoe }: { game: GameState; fieldMe: HTMLElement | null; fieldFoe: HTMLElement | null }) {
  const reserves: { key: number; x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const p of [0, 1] as const) {
    for (const u of game.players[p].field) {
      if (!u?.reserved) continue;
      if (game.pending.some((x) => x.kind === 'attack' && x.uid === u.uid)) continue;
      const tgt = u.reserved.kind === 'player' ? heroEl(p === 0 ? 1 : 0) : unitEl(u.reserved.uid);
      const a = centerOf(unitEl(u.uid));
      const b = centerOf(tgt);
      if (a && b) reserves.push({ key: u.uid, x0: a.x, y0: a.y, x1: b.x, y1: b.y });
    }
  }
  if (game.pending.length === 0 && reserves.length === 0) return null;
  const lines: { key: number; x0: number; y0: number; x1: number; y1: number; mine: boolean; t: number }[] = [];
  const areas: { key: number; r: DOMRect; mine: boolean; t: number }[] = [];
  /** 溜めている呪文の魔法陣（対象の足元・場の真ん中）。 */
  const circles: { key: number; x: number; y: number; size: number; mine: boolean; t: number }[] = [];
  for (const x of game.pending) {
    const t = Math.max(0, Math.min(1, 1 - (x.at - game.time) / WINDUP_MS));
    const mine = x.p === 0;
    const foe: 0 | 1 = x.p === 0 ? 1 : 0;
    if (x.kind === 'spell' && x.target === null) {
      const eff = CARDS[x.card].ab.spell!;
      const toFoe = eff.kind === 'blast' || eff.kind === 'freeze' || eff.kind === 'poisonAll' || eff.kind === 'sealAll';
      const row = (x.p === 0) === toFoe ? fieldFoe : fieldMe;
      if (row) {
        const r = row.getBoundingClientRect();
        areas.push({ key: x.id, r, mine, t });
        circles.push({ key: x.id, x: r.left + r.width / 2, y: r.top + r.height / 2, size: Math.min(r.width, 300), mine, t });
      }
      continue;
    }
    const src = x.kind === 'spell' ? heroEl(x.p) : unitEl(x.uid);
    const tgt =
      x.kind === 'attack' ? (x.target.kind === 'player' ? heroEl(foe) : unitEl(x.target.uid)) : unitEl(x.target as number);
    const a = centerOf(src);
    const b = centerOf(tgt);
    if (a && b) lines.push({ key: x.id, x0: a.x, y0: a.y, x1: b.x, y1: b.y, mine, t });
    if (b && x.kind === 'spell') circles.push({ key: x.id, x: b.x, y: b.y, size: 130, mine, t });
  }
  return (
    <>
      <div className="circles" aria-hidden="true">
        {circles.map((c) => (
          <span
            key={c.key}
            className={`circle-spin${c.mine ? ' is-mine' : ''}`}
            style={{ left: c.x, top: c.y, width: c.size, height: c.size, opacity: 0.35 + c.t * 0.65 }}
          />
        ))}
      </div>
      {areas.map((m) => (
        <div
          key={m.key}
          className={`pending-area${m.mine ? ' is-mine' : ''}`}
          style={{ left: m.r.left - 6, top: m.r.top - 6, width: m.r.width + 12, height: m.r.height + 12, opacity: 0.35 + m.t * 0.65 }}
        />
      ))}
      <svg className="aim" aria-hidden="true">
        {reserves.map((m) => (
          <g key={`r${m.key}`} className="reserve">
            <CrossMask id={`xm-r${m.key}`} x0={m.x0} y0={m.y0} x1={m.x1} y1={m.y1} />
            <line mask={`url(#xm-r${m.key})`} x1={m.x0} y1={m.y0} x2={m.x1} y2={m.y1} className="reserve-line" />
          </g>
        ))}
        {lines.map((m) => (
          <g key={m.key} className={`pending${m.mine ? ' is-mine' : ''}`}>
            <CrossMask id={`xm-p${m.key}`} x0={m.x0} y0={m.y0} x1={m.x1} y1={m.y1} />
            <line mask={`url(#xm-p${m.key})`} x1={m.x0} y1={m.y0} x2={m.x0 + (m.x1 - m.x0) * Math.min(1, m.t * 1.6)} y2={m.y0 + (m.y1 - m.y0) * Math.min(1, m.t * 1.6)} className="pending-line" />
            <circle cx={m.x1} cy={m.y1} r={30 - m.t * 16} className="pending-ring" />
            <circle cx={m.x1} cy={m.y1} r={4} className="pending-dot" />
          </g>
        ))}
      </svg>
    </>
  );
}
