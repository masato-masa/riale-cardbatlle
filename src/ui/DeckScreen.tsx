import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useRef, useState } from 'react';

import { CARDS, RIVAL_DECKS, STARTER_DECK, TYPE_NAME, type CardId, type CardType } from '@/game/cards';
import { loadUnlocked } from '@/storage/collection';
import { ARENAS, arenaForCost, arenaIndex, loadTrophies } from '@/storage/trophy';
import { applyPreset, averageCost, COLLECTION, DECK_SLOTS, loadBook, saveBook, saveDeck } from '@/storage/deck';

import { CardFace } from './CardFace';
import { DECK_BG_URL } from './art';
import { CardDetail } from './GameParts';
import { Sheet } from './Sheets';
import { playSelect, playUiTap } from './sound';
import { TabBar } from './TabBar';

const TYPE_ORDER: CardType[] = ['unit', 'building', 'spell'];

/** コンセプトデッキ（選ぶと、いまのデッキに入る）。 */
const PRESETS: { name: string; deck: CardId[] }[] = [
  { name: 'はじめてのデッキ', deck: STARTER_DECK },
  ...RIVAL_DECKS.map((d) => ({ name: `${d.name}デッキ`, deck: d.deck })),
];

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

/** デッキ編成（クラロワ方式）。上がデッキ 8 枚（横 4 列）、下が持っているカードの一覧（横 4 列）。
 *  カードをタップ → 説明と「デッキに入れる」→ 入れ替えるデッキのカードをタップ（長押しの操作は無い）。
 *  デッキはいつも 8 枚のまま（入れ替えだけ）。変えたらその場で保存する。 */
export function DeckScreen({ deck, onChange, onBack }: { deck: CardId[]; onChange: (deck: CardId[]) => void; onBack: () => void }) {
  const [open, setOpen] = useState<{ card: CardId; inDeck: boolean; locked?: boolean } | null>(null);
  const unlocked = useMemo(() => loadUnlocked(), []);
  const myArena = useMemo(() => arenaIndex(loadTrophies()), []);
  /** 鍵カードがまだ出ないアリーナなら、その名前（いまのアリーナで出るなら null）。 */
  const unlockArena = (id: CardId): string | null => {
    const a = arenaForCost(CARDS[id].summon);
    return a > myArena ? ARENAS[a]!.name : null;
  };
  /** 保存した 5 つのデッキと、使っている番号。 */
  const [active, setActive] = useState(() => loadBook().active);
  /** コンセプトデッキの一覧と、補った枚数の知らせ。 */
  const [presets, setPresets] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const chooseSlot = (i: number) => {
    const b = loadBook();
    b.active = i;
    saveBook(b);
    setActive(i);
    setSwapIn(null);
    setNote(null);
    onChange(b.decks[i]!);
    playUiTap();
  };
  const usePreset = (pdeck: CardId[]) => {
    const { deck: next, missing } = applyPreset(pdeck, deck, unlocked);
    saveDeck(next);
    onChange(next);
    setPresets(false);
    setSwapIn(null);
    setNote(missing > 0 ? `未獲得の ${missing} 枚は、いまのデッキのカードで補いました` : null);
    playSelect();
  };
  const mainRef = useRef<HTMLElement>(null);
  /** 未獲得の一覧は最初は閉じておく（60 枚以上あって長いため）。 */
  const [showLocked, setShowLocked] = useState(false);
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

  return (
    <div className="ts dk" style={{ backgroundImage: `url(${DECK_BG_URL})` }}>
      <header className="dk-top">
        <h1 className="dk-title">デッキ</h1>
        <span className="dk-avg">
          {/* コストの分布（1〜2・3〜4・5〜6・7〜）。軽いカードと重いカードの釣り合いが一目で分かる */}
          <span className="dk-curve" aria-label="コストの分布">
            {[
              [1, 2],
              [3, 4],
              [5, 6],
              [7, 99],
            ].map(([lo, hi]) => {
              const n = deck.filter((c) => CARDS[c].summon >= lo! && CARDS[c].summon <= hi!).length;
              return <i key={lo} style={{ height: `${Math.max(2, (n / 8) * 100 * 2)}%` }} title={`コスト ${lo}${hi === 99 ? '〜' : `〜${hi}`}: ${n} 枚`} />;
            })}
          </span>
          平均コスト <b>{averageCost(deck).toFixed(1)}</b>
        </span>
      </header>

      <main className="deck-main" ref={mainRef}>
        <div className="slot-chips" role="tablist" aria-label="保存したデッキ">
          {Array.from({ length: DECK_SLOTS }, (_, i) => (
            <button key={i} role="tab" aria-selected={active === i} className={`slot-chip${active === i ? ' is-on' : ''}`} onClick={() => chooseSlot(i)}>
              {i + 1}
            </button>
          ))}
          <button
            className="preset-btn"
            onClick={() => {
              playUiTap();
              setPresets(true);
            }}
          >
            コンセプトデッキ
          </button>
        </div>
        {note ? <p className="deck-note">{note}</p> : null}
        <section className={`deck-box${swapIn ? ' is-swapping' : ''}`}>
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
                className="deck-card"
                // 入れ替えを始めた瞬間に 1 回だけ小さく揺れる（ずっとは揺らさない）。選んでいる間は CSS の光で示す
                initial={justIn === id ? { scale: 1.3, opacity: 0.35 } : false}
                animate={
                  justIn === id
                    ? { scale: 1, opacity: 1, rotate: 0, transition: { type: 'spring', stiffness: 520, damping: 16 } }
                    : swapIn
                      ? { rotate: [0, -1.1, 1.1, -0.5, 0], transition: { duration: 0.42, delay: (i % 4) * 0.025 } }
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
                    className={`deck-card${swapIn === id ? ' is-picked' : ''}`}
                    onClick={() => {
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
            <button
              className="collection-title locked-toggle"
              aria-expanded={showLocked}
              onClick={() => {
                playUiTap();
                setShowLocked((v) => !v);
              }}
            >
              まだ持っていない（{COLLECTION.length - unlocked.size} 枚）{showLocked ? ' ▲' : ' ▼'}
            </button>
            {showLocked ? <p className="locked-note">対戦するとたまる宝箱で、1 枚ずつ手に入ります。</p> : null}
            <div className="collection-grid" hidden={!showLocked}>
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
                  {unlockArena(id) ? <span className="lock-arena">{unlockArena(id)}</span> : null}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <AnimatePresence>
        {presets ? (
          <Sheet key="presets" title="コンセプトデッキ" subtitle={`デッキ ${active + 1} に入ります`} onClose={() => setPresets(false)}>
            <div className="preset-list">
              {PRESETS.map((pr) => {
                const missing = pr.deck.filter((id) => !unlocked.has(id)).length;
                return (
                  <button key={pr.name} className="preset-row" onClick={() => usePreset(pr.deck)}>
                    <span className="preset-head">
                      <b>{pr.name}</b>
                      <small>平均コスト {averageCost(pr.deck).toFixed(1)}{missing > 0 ? ` ・ 未獲得 ${missing} 枚` : ''}</small>
                    </span>
                    <span className="preset-faces">
                      {pr.deck.map((id) => (
                        <span key={id} className={`preset-face${unlocked.has(id) ? '' : ' is-locked'}`}>
                          <CardFace card={id} small />
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            <button className="sheet-btn quiet" onClick={() => setPresets(false)}>
              とじる
            </button>
          </Sheet>
        ) : null}
      </AnimatePresence>

      <TabBar active="deck" onDeck={() => undefined} onBattle={onBack} />

      <AnimatePresence>
        {open ? (
          <Sheet key="card" title={CARDS[open.card].name} anchor="bottom" onClose={() => setOpen(null)}>
            <CardDetail card={open.card} />
            {open.locked ? (
              <p className="card-detail-note">
                {unlockArena(open.card)
                  ? `🔒 まだ持っていません。アリーナ「${unlockArena(open.card)}」に上がると、宝箱から出るようになります。`
                  : '🔒 まだ持っていません。対戦でたまる宝箱から手に入ります。'}
              </p>
            ) : null}
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
                    // 入れ替え先のデッキが見えるよう、いちばん上へ戻す
                    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
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
