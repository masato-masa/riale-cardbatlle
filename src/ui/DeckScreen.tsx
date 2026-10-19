import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import { CARDS, TYPE_NAME, type CardId, type CardType } from '@/game/cards';
import { averageCost, COLLECTION, saveDeck } from '@/storage/deck';

import { CardFace } from './CardFace';
import { FIELD_URL } from './art';
import { CardDetail } from './GameParts';
import { Sheet } from './Sheets';
import { playSelect, playUiTap } from './sound';
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

/** デッキ編成（クラロワ方式）。上がデッキ 10 枚、下が持っているカードの一覧。
 *  一覧のカードをタップ → 説明と「デッキに入れる」→ 入れ替えるデッキのカードをタップ。
 *  デッキはいつも 10 枚のまま（入れ替えだけ）。変えたらその場で保存する。 */
export function DeckScreen({ deck, onChange, onBack }: { deck: CardId[]; onChange: (deck: CardId[]) => void; onBack: () => void }) {
  const [open, setOpen] = useState<{ card: CardId; inDeck: boolean } | null>(null);
  /** 入れようとしているカード。決まっている間は、デッキのカードをタップすると入れ替わる。 */
  const [swapIn, setSwapIn] = useState<CardId | null>(null);
  const rest = sorted(COLLECTION.filter((id) => !deck.includes(id)));

  const replace = (out: CardId) => {
    if (!swapIn) return;
    const next = deck.map((id) => (id === out ? swapIn : id));
    saveDeck(next);
    onChange(next);
    setSwapIn(null);
    playSelect();
  };

  return (
    <div className="ts dk" style={{ backgroundImage: `url(${FIELD_URL})` }}>
      <header className="dk-top">
        <h1 className="dk-title">デッキ</h1>
        <span className="dk-avg">
          平均コスト <b>{averageCost(deck).toFixed(1)}</b>
        </span>
      </header>

      <main className="deck-main">
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
                <span>入れ替えるカードをタップ</span>
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
            {deck.map((id, i) => (
              <motion.button
                key={id}
                layout
                className="deck-card"
                animate={swapIn ? { rotate: [0, -2.5, 2.5, 0] } : { rotate: 0 }}
                transition={swapIn ? { duration: 0.4, repeat: Infinity, delay: (i % 5) * 0.05 } : { duration: 0.15 }}
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
      </main>

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
