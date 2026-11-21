import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

/** 初回だけの案内（クラロワの最初の数戦と同じ。1 つずつ、その操作をするまで次へ進まない）。
 *  step 0: コインの説明（OK で次へ。時間は止まる）/ 1: 手札を場へドラッグ / 2: 場のカードを相手へドラッグ / 3: 完了の一言。
 *  指のガイドは、いまの要素の位置を読んでその上を往復する。 */
export type TutorialStep = 0 | 1 | 2 | 3;

const TEXT: Record<TutorialStep, { title: string; body: string }> = {
  0: { title: 'コインでカードを出そう', body: 'コインがたまるとカードを出せます。左上の数字が必要なコインです。' },
  1: { title: '手札を場へドラッグ', body: '光っているカードを、空き枠へドラッグして出そう。' },
  2: { title: '相手を攻撃しよう', body: '場のカードを相手へドラッグすると攻撃。輪が一周するまで待とう。' },
  3: { title: 'その調子！', body: '相手の HP を 0 にしたら勝ち。カードをタップすると能力が見られます。' },
};

function center(sel: string): { x: number; y: number } | null {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** 場面ごとの一言案内。その場面が初めて来たときに 1 回だけ、時間を止めて出す（このゲーム特有の読み合いを覚えてもらう）。 */
export type TipId = 'interrupt' | 'overwrite' | 'reserve';

export const TIP_TEXT: Record<TipId, { title: string; body: string }> = {
  interrupt: {
    title: '相手が攻撃を溜めている！',
    body: 'いまブロッカー（盾のカード）を出すと、攻撃を止められます。',
  },
  overwrite: {
    title: '場がいっぱいでも出せる',
    body: '手札を自分のカードに重ねると、入れ替え（チェンジ）できます。',
  },
  reserve: {
    title: 'クールタイム中も予約できる',
    body: '攻撃できないカードも、相手へドラッグで予約。明けた瞬間に攻撃します。',
  },
};

/** 場面ごとの一言案内。試合は止めず、盤面の中央（両方の場のあいだ）に帯で出して、しばらくすると消える。触れても消える。
 *  （以前は試合を止める大きな窓で、自分の場が隠れた。クラロワ・ライバルズの対戦中の案内は止めない帯） */
export function Tip({ id, onClose }: { id: TipId; onClose: () => void }) {
  const t = TIP_TEXT[id];
  // 親は毎フレーム描き直す（onClose も毎回新しい）ので、タイマーは id ごとに 1 回だけ張る
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const timer = window.setTimeout(() => close.current(), TIP_MS);
    return () => window.clearTimeout(timer);
  }, [id]);
  return (
    <motion.button
      type="button"
      className="tip-banner"
      key={id}
      aria-live="polite"
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      onClick={onClose}
    >
      <b>{t.title}</b>
      <span>{t.body}</span>
    </motion.button>
  );
}

/** 案内の帯を出しておく時間。 */
const TIP_MS = 7000;

export function Tutorial({ step, auto, onNext }: { step: TutorialStep; auto?: boolean; onNext: () => void }) {
  const [path, setPath] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  useEffect(() => {
    const read = () => {
      const from = step === 1 ? center('.hand-card') : step === 2 ? center('.field-me .unit') : null;
      const to = step === 1 ? center('.field-me .slot') : step === 2 ? center('.hero-foe') : null;
      setPath(from && to ? { from, to } : null);
    };
    read();
    const id = window.setInterval(read, 400);
    return () => window.clearInterval(id);
  }, [step]);
  // 自動攻撃のルール（テスト用の案 2・3）では、場のカードが自分で攻撃する
  const t = auto && step === 3 ? { title: 'その調子！', body: '場のカードは自分で攻撃します。相手の HP を 0 にしたら勝ち。' } : TEXT[step];
  return (
    <div className="tutorial" aria-live="polite">
      {path ? (
        <motion.div
          key={`${step}-${Math.round(path.from.x)}-${Math.round(path.to.y)}`}
          className="tut-finger"
          initial={{ left: path.from.x, top: path.from.y, opacity: 0 }}
          animate={{ left: [path.from.x, path.from.x, path.to.x, path.to.x], top: [path.from.y, path.from.y, path.to.y, path.to.y], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.9, repeat: Infinity, times: [0, 0.15, 0.8, 1], ease: 'easeInOut' }}
        />
      ) : null}
      <motion.div className="tut-card" key={step} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <b>{t.title}</b>
        <p>{t.body}</p>
        {step === 0 ? (
          <button className="tut-ok" onClick={onNext}>
            OK
          </button>
        ) : null}
      </motion.div>
    </div>
  );
}
