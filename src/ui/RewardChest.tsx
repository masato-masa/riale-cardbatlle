import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { CardId } from '@/game/cards';
import { CARDS } from '@/game/cards';

import chestClosed from '../assets/art/ui/chest-closed.webp';
import chestOpen from '../assets/art/ui/chest-open.webp';
import { CardFace } from './CardFace';
import { playReady, playSelect } from './sound';

/** 結果画面の宝箱。閉じた箱が揺れる → ぱかっと開いて光る → カードが飛び出す（クラロワの宝箱と同じ流れ）。
 *  カードが出た瞬間は画面全体を使って大きく見せ（回る光の筋）、タップで結果画面の小さなカードに戻る。 */
export function RewardChest({ cards }: { cards: CardId[] }) {
  const [phase, setPhase] = useState<'shake' | 'open' | 'card'>('shake');
  /** 画面全体で見せている間（タップで閉じる）。 */
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    const t1 = window.setTimeout(() => {
      setPhase('open');
      playSelect();
    }, 1500);
    const t2 = window.setTimeout(() => {
      setPhase('card');
      setReveal(true);
      playReady();
    }, 2100);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);
  return (
    <div className="chest">
      <motion.img
        className="chest-img"
        src={phase === 'shake' ? chestClosed : chestOpen}
        alt=""
        draggable={false}
        initial={{ scale: 0, y: 30 }}
        animate={
          phase === 'shake'
            ? { scale: 1, y: 0, rotate: [0, -7, 7, -9, 9, -5, 5, 0], transition: { scale: { type: 'spring', stiffness: 300, damping: 16 }, rotate: { delay: 0.5, duration: 1, ease: 'easeInOut' } } }
            : { scale: phase === 'open' ? 1.12 : 0.9, y: 0, rotate: 0, transition: { type: 'spring', stiffness: 400, damping: 14 } }
        }
      />
      {phase !== 'shake' ? <span className="chest-glow" aria-hidden="true" /> : null}
      {phase === 'card'
        ? cards.map((c) => (
            <motion.div
              key={c}
              className="chest-card"
              initial={{ y: 40, scale: 0.2, opacity: 0, rotate: -10 }}
              animate={{ y: -8, scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 14, opacity: { duration: 0.2 } }}
            >
              <b>新しいカード！</b>
              <div className="reward-face">
                <CardFace card={c} />
              </div>
              <span>{CARDS[c].name}</span>
            </motion.div>
          ))
        : null}
      {createPortal(
        <AnimatePresence>
          {reveal ? (
            <motion.div
              key="reveal"
              className="card-reveal"
              role="dialog"
              aria-label="新しいカード"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, pointerEvents: 'none' }}
              onClick={() => setReveal(false)}
            >
              <span className="card-reveal-rays" aria-hidden="true" />
              <motion.b className="card-reveal-title" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}>
                新しいカード！
              </motion.b>
              <div className="card-reveal-cards">
                {cards.map((c, i) => (
                  <motion.div
                    key={c}
                    className="card-reveal-card"
                    initial={{ scale: 0.2, rotateY: 180, y: 80 }}
                    animate={{ scale: 1, rotateY: 0, y: 0 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 16, delay: i * 0.25 }}
                  >
                    <div className="card-reveal-face">
                      <CardFace card={c} />
                    </div>
                    <b>{CARDS[c].name}</b>
                    {CARDS[c].epithet ? <small>{CARDS[c].epithet}</small> : null}
                  </motion.div>
                ))}
              </div>
              <motion.small className="card-reveal-tap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
                タップでとじる
              </motion.small>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
