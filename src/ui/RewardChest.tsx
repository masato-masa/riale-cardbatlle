import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

import type { CardId } from '@/game/cards';
import { CARDS } from '@/game/cards';

import chestClosed from '../assets/art/ui/chest-closed.webp';
import chestOpen from '../assets/art/ui/chest-open.webp';
import { CardFace } from './CardFace';
import { playReady, playSelect } from './sound';

/** 結果画面の宝箱。閉じた箱が揺れる → ぱかっと開いて光る → カードが飛び出す（クラロワの宝箱と同じ流れ）。 */
export function RewardChest({ cards }: { cards: CardId[] }) {
  const [phase, setPhase] = useState<'shake' | 'open' | 'card'>('shake');
  useEffect(() => {
    const t1 = window.setTimeout(() => {
      setPhase('open');
      playSelect();
    }, 1500);
    const t2 = window.setTimeout(() => {
      setPhase('card');
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
    </div>
  );
}
