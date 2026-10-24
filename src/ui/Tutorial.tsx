import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

/** 初回だけの案内（クラロワの最初の数戦と同じ。1 つずつ、その操作をするまで次へ進まない）。
 *  step 0: コインの説明（OK で次へ。時間は止まる）/ 1: 手札を場へドラッグ / 2: 場のカードを相手へドラッグ / 3: 完了の一言。
 *  指のガイドは、いまの要素の位置を読んでその上を往復する。 */
export type TutorialStep = 0 | 1 | 2 | 3;

const TEXT: Record<TutorialStep, { title: string; body: string }> = {
  0: { title: 'コインでカードを出そう', body: '下のコインは時間でたまります。カードの左上の数字がコスト。たまったぶんのカードを出せます。' },
  1: { title: '手札を場へドラッグ', body: '光っているカードを、自分の場の空き枠へドラッグして離すと召喚できます。' },
  2: { title: '相手を攻撃しよう', body: '場のカードを、相手のカードかプレイヤーへドラッグすると攻撃。時計の輪が一周するまではクールタイムです。' },
  3: { title: 'その調子！', body: '相手の HP を 0 にしたら勝ち。カードをタップすると能力の説明が見られます。' },
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
    body: '線の真ん中の「！」が溜め中のしるし。いまブロッカー（盾のカード）を出すと、攻撃に割り込んで止められます。止められた相手はクールタイムが 5 秒のびます。',
  },
  overwrite: {
    title: '場がいっぱいでも出せる',
    body: '自分のカードの上に手札を重ねると「チェンジ」で入れ替わります。弱ったカードや、狙われているカードを入れ替えて守りましょう。',
  },
  reserve: {
    title: 'クールタイム中も予約できる',
    body: 'まだ攻撃できないカードも、相手へドラッグしておくと予約になり、明けた瞬間に攻撃します。ブロッカーや壁で狙えない相手は、狙えるようになるまで待機します。',
  },
};

export function Tip({ id, onClose }: { id: TipId; onClose: () => void }) {
  const t = TIP_TEXT[id];
  return (
    <div className="tutorial" aria-live="polite">
      <motion.div className="tut-card" key={id} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <b>{t.title}</b>
        <p>{t.body}</p>
        <button className="tut-ok" onClick={onClose}>
          OK
        </button>
      </motion.div>
    </div>
  );
}

export function Tutorial({ step, onNext }: { step: TutorialStep; onNext: () => void }) {
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
  const t = TEXT[step];
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
