import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { CARDS, TYPE_NAME, type CardId, type CardType } from '@/game/cards';
import { loadUnlocked } from '@/storage/collection';
import { averageCost, COLLECTION, saveDeck } from '@/storage/deck';

import { CardFace } from './CardFace';
import { DECK_BG_URL } from './art';
import { CardDetail } from './GameParts';
import { Sheet } from './Sheets';
import { playPickup, playReject, playSelect, playUiTap } from './sound';
import { TabBar } from './TabBar';

const TYPE_ORDER: CardType[] = ['unit', 'building', 'spell'];

/** 一覧の並び: 種類ごと、コストの安い順。 */
function sorted(ids: CardId[]): CardId[] {
  return [...ids].sort(
    (a, b) =>
      TYPE_ORDER.indexOf(CARDS[a].type) - TYPE_ORDER.indexOf(CARDS[b].type) ||
      CARDS[a].summon - CARDS[b].summon ||
      a.localeCompare(b),
  );
}

/** デッキの並び: コストの安い順（同じなら種類、名前）。表示だけの並びで、保存する中身は変えない。 */
function byCost(ids: CardId[]): CardId[] {
  return [...ids].sort(
    (a, b) => CARDS[a].summon - CARDS[b].summon || TYPE_ORDER.indexOf(CARDS[a].type) - TYPE_ORDER.indexOf(CARDS[b].type) || a.localeCompare(b),
  );
}

/** 長押しで持ち上がるまでの時間（ms）と、それまでに動いたら「スクロール」とみなす距離（px）。 */
const HOLD_MS = 260;
const MOVE_PX = 9;

/** デッキ編成（クラロワ方式）。上がデッキ 10 枚、下が持っているカードの一覧。
 *  一覧のカードを長押し → そのままスライドして、デッキの入れ替えたいカードの上で離す（デッキ同士・一覧同士の移動は無い）。
 *  タップなら説明と「デッキに入れる」→ 入れ替えるデッキのカードをタップ。
 *  デッキはいつも 10 枚のまま（入れ替えだけ）。変えたらその場で保存する。 */
export function DeckScreen({ deck, onChange, onBack }: { deck: CardId[]; onChange: (deck: CardId[]) => void; onBack: () => void }) {
  const [open, setOpen] = useState<{ card: CardId; inDeck: boolean; locked?: boolean } | null>(null);
  const unlocked = useMemo(() => loadUnlocked(), []);
  /** 入れようとしているカード。決まっている間は、デッキのカードをタップすると入れ替わる。 */
  const [swapIn, setSwapIn] = useState<CardId | null>(null);
  /** いま入れ替わって入ったカード（ポンと弾ませる。少しだけ覚える）。 */
  const [justIn, setJustIn] = useState<CardId | null>(null);
  /** 一覧のコストの絞り込み（0 = すべて）。 */
  const [band, setBand] = useState(0);
  const inBand = (id: CardId) => {
    const c = CARDS[id].summon;
    return band === 0 || (band === 1 && c <= 2) || (band === 2 && c >= 3 && c <= 4) || (band === 3 && c >= 5 && c <= 6) || (band === 4 && c >= 7);
  };
  const rest = sorted(COLLECTION.filter((id) => !deck.includes(id) && unlocked.has(id) && inBand(id)));
  const lockedList = sorted(COLLECTION.filter((id) => !unlocked.has(id) && inBand(id)));
  const deckView = byCost(deck);

  /** 一覧のカード incoming を、デッキのカード out と入れ替える。 */
  const replace = (out: CardId, incoming: CardId | null = swapIn) => {
    if (!incoming) return;
    const next = deck.map((id) => (id === out ? incoming : id));
    saveDeck(next);
    onChange(next);
    setJustIn(incoming);
    window.setTimeout(() => setJustIn(null), 700);
    setSwapIn(null);
    playSelect();
  };

  // ---- 長押しスライド ----
  /** 持ち上げているカード（x, y は指の位置、over は下にあるデッキのカード）。 */
  const [lift, setLift] = useState<{ card: CardId; x: number; y: number; over: CardId | null } | null>(null);
  const liftRef = useRef(lift);
  liftRef.current = lift;
  /** スライドで離したあとに出る click（説明を開く）を無視するための印。 */
  const justDragged = useRef(false);
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const replaceRef = useRef(replace);
  replaceRef.current = replace;

  const overDeckCard = (x: number, y: number): CardId | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-deck-card]');
    return (el?.dataset.deckCard as CardId | undefined) ?? null;
  };

  /** 一覧のカードを押した。長押しで持ち上がり、動かすとスクロールとみなして何もしない。 */
  const onHoldStart = (e: React.PointerEvent, card: CardId) => {
    const x0 = e.clientX;
    const y0 = e.clientY;
    let timer = 0;
    let active = false;
    const onMove = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > MOVE_PX) {
          // スクロール・なぞり: 離したあとに出る click（説明を開く）は無視する
          justDragged.current = true;
          window.setTimeout(() => (justDragged.current = false), 350);
          end(false);
        }
        return;
      }
      setLift({ card, x: ev.clientX, y: ev.clientY, over: overDeckCard(ev.clientX, ev.clientY) });
    };
    const onTouchMove = (ev: TouchEvent) => {
      // 持ち上げたあとは、指を動かしてもページが動かないようにする
      if (active) ev.preventDefault();
    };
    const onUp = () => end(true);
    const end = (commit: boolean) => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('touchmove', onTouchMove);
      if (!active) return;
      const l = liftRef.current;
      setLift(null);
      justDragged.current = true;
      window.setTimeout(() => (justDragged.current = false), 350);
      if (commit && l?.over) replaceRef.current(l.over, card);
      else playReject();
    };
    const onCancel = () => end(false);
    timer = window.setTimeout(() => {
      active = true;
      playPickup();
      setLift({ card, x: x0, y: y0, over: null });
    }, HOLD_MS);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
  };

  // 画面を離れるときに残らないように
  useEffect(() => () => setLift(null), []);

  return (
    <div className="ts dk" style={{ backgroundImage: `url(${DECK_BG_URL})` }}>
      <header className="dk-top">
        <h1 className="dk-title">デッキ</h1>
        <span className="dk-avg">
          平均コスト <b>{averageCost(deck).toFixed(1)}</b>
        </span>
      </header>

      <main className="deck-main">
        <section className={`deck-box${swapIn || lift ? ' is-swapping' : ''}`}>
          {lift ? <p className="deck-lift-hint">入れ替えるカードの上で離す</p> : null}
          <AnimatePresence>
            {swapIn ? (
              <motion.div
                key="swap"
                className="deck-swap"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, pointerEvents: 'none' }}
              >
                <span className="deck-swap-card">
                  <CardFace card={swapIn} small />
                </span>
                <span>入れ替えるデッキのカードをタップ</span>
                <button
                  className="deck-swap-cancel"
                  onClick={() => {
                    playUiTap();
                    setSwapIn(null);
                  }}
                >
                  やめる
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <div className="deck-grid">
            {deckView.map((id, i) => (
              <motion.button
                key={id}
                layout
                data-deck-card={id}
                className={`deck-card${lift?.over === id ? ' is-over' : ''}`}
                // 入れ替えを始めた瞬間に 1 回だけ小さく揺れる（ずっとは揺らさない）。選んでいる間は CSS の光で示す
                initial={justIn === id ? { scale: 1.3, opacity: 0.35 } : false}
                animate={
                  justIn === id
                    ? { scale: 1, opacity: 1, rotate: 0, transition: { type: 'spring', stiffness: 520, damping: 16 } }
                    : swapIn
                      ? { rotate: [0, -1.1, 1.1, -0.5, 0], transition: { duration: 0.42, delay: (i % 5) * 0.025 } }
                      : { rotate: 0, transition: { duration: 0.15 } }
                }
                onClick={() => {
                  if (swapIn) return replace(id);
                  playUiTap();
                  setOpen({ card: id, inDeck: true });
                }}
              >
                <CardFace card={id} />
              </motion.button>
            ))}
          </div>
        </section>

        <div className="band-chips" role="tablist" aria-label="コストで絞る">
          {['すべて', '1〜2', '3〜4', '5〜6', '7〜'].map((label, i) => (
            <button
              key={label}
              role="tab"
              aria-selected={band === i}
              className={`band-chip${band === i ? ' is-on' : ''}`}
              onClick={() => {
                playUiTap();
                setBand(i);
              }}
            >
              {i > 0 ? <span className="band-coin" aria-hidden="true" /> : null}
              {label}
            </button>
          ))}
        </div>

        {TYPE_ORDER.map((type) => {
          const list = rest.filter((id) => CARDS[id].type === type);
          if (list.length === 0) return null;
          return (
            <section key={type} className="collection">
              <h2 className="collection-title">{TYPE_NAME[type]}</h2>
              <div className="collection-grid">
                {list.map((id) => (
                  <motion.button
                    key={id}
                    layout
                    className={`deck-card${swapIn === id ? ' is-picked' : ''}${lift?.card === id ? ' is-lifted' : ''}`}
                    onPointerDown={(e) => onHoldStart(e, id)}
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={() => {
                      if (justDragged.current) return;
                      playUiTap();
                      setSwapIn(null);
                      setOpen({ card: id, inDeck: false });
                    }}
                  >
                    <CardFace card={id} />
                  </motion.button>
                ))}
              </div>
            </section>
          );
        })}

        {lockedList.length > 0 ? (
          <section className="collection is-locked-section">
            <h2 className="collection-title">まだ持っていない（{COLLECTION.length - unlocked.size} 枚）</h2>
            <p className="locked-note">対戦するとたまる宝箱で、1 枚ずつ手に入ります。</p>
            <div className="collection-grid">
              {lockedList.map((id) => (
                <button
                  key={id}
                  className="deck-card is-locked"
                  onClick={() => {
                    playUiTap();
                    setOpen({ card: id, inDeck: true, locked: true });
                  }}
                >
                  <CardFace card={id} />
                  <span className="lock-mark" aria-label="未獲得">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="5" y="11" width="14" height="10" rx="2" fill="#fff" />
                      <path d="M8 11 V8 a4 4 0 0 1 8 0 V11" fill="none" stroke="#fff" strokeWidth="2.4" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      {lift ? (
        <div className="deck-ghost" style={{ left: lift.x, top: lift.y }} aria-hidden="true">
          <CardFace card={lift.card} />
        </div>
      ) : null}

      <TabBar active="deck" onDeck={() => undefined} onBattle={onBack} />

      <AnimatePresence>
        {open ? (
          <Sheet key="card" title={CARDS[open.card].name} anchor="bottom" onClose={() => setOpen(null)}>
            <CardDetail card={open.card} />
            {open.inDeck ? (
              <button className="sheet-btn" onClick={() => setOpen(null)}>
                とじる
              </button>
            ) : (
              <div className="sheet-buttons">
                <button
                  className="sheet-btn"
                  onClick={() => {
                    playSelect();
                    setSwapIn(open.card);
                    setOpen(null);
                  }}
                >
                  デッキに入れる
                </button>
                <button className="sheet-btn quiet" onClick={() => setOpen(null)}>
                  とじる
                </button>
              </div>
            )}
          </Sheet>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
