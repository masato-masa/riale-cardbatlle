import { AnimatePresence } from 'motion/react';
import { useState } from 'react';

import type { CpuLevel } from '@/ai/cpu';
import type { CardId } from '@/game/cards';
import { isUnlockAll, setUnlockAll } from '@/storage/collection';
import { loadLevel, loadRecord, saveLevel } from '@/storage/profile';

import { FIELD_URL, HERO_ME_URL } from './art';
import { CardFace } from './CardFace';
import { Sheet } from './Sheets';
import { playUiTap, primeAudio } from './sound';
import { TabBar } from './TabBar';

const LEVELS: { id: CpuLevel; label: string }[] = [
  { id: 'easy', label: 'よわい' },
  { id: 'normal', label: 'ふつう' },
  { id: 'hard', label: 'つよい' },
];

/** ホーム（クラロワ型）。上=自分の札、中央=ロゴとデッキ、下=難易度・大きな「バトル」・タブ。 */
export function Home({ deck, onStart, onDeck }: { deck: CardId[]; onStart: (level: CpuLevel) => void; onDeck: () => void }) {
  const [level, setLevel] = useState<CpuLevel>(loadLevel);
  const record = loadRecord();
  const [dev, setDev] = useState(false);
  const [allOn, setAllOn] = useState(isUnlockAll);
  const pick = (l: CpuLevel) => {
    playUiTap();
    saveLevel(l);
    setLevel(l);
  };
  const start = () => {
    primeAudio();
    playUiTap();
    onStart(level);
  };
  return (
    <div className="ts" style={{ backgroundImage: `url(${FIELD_URL})` }}>
      <button
        className="ts-dev"
        onClick={() => {
          playUiTap();
          setDev(true);
        }}
      >
        テスト用
      </button>
      <AnimatePresence>
        {dev ? (
          <Sheet key="dev" title="テスト用" onClose={() => setDev(false)}>
            <div className="sheet-list">
              <div className="sheet-row static">
                <span>全カード解放</span>
                <button
                  className="switch"
                  role="switch"
                  aria-checked={allOn}
                  aria-label="全カード解放"
                  onClick={() => {
                    setUnlockAll(!allOn);
                    setAllOn(!allOn);
                    playUiTap();
                  }}
                />
              </div>
              <button
                className="sheet-row"
                onClick={() => {
                  playUiTap();
                  // サウンド・BGM の確認ページ（?sounds）へ
                  window.location.search = '?sounds';
                }}
              >
                <span>サウンド・BGM の調整</span>
                <span aria-hidden="true">›</span>
              </button>
            </div>
            <button className="sheet-btn" onClick={() => setDev(false)}>
              とじる
            </button>
          </Sheet>
        ) : null}
      </AnimatePresence>
      <header className="ts-top">
        <div className="ts-player">
          <span className="ts-medal">
            <img src={HERO_ME_URL} alt="" draggable={false} />
          </span>
          <span className="ts-name">
            <b>あなた</b>
            <small>
              {record.win} 勝 {record.lose} 敗{record.streak >= 2 ? ` ・ ${record.streak} 連勝中` : ''}
            </small>
          </span>
        </div>
      </header>

      <main className="ts-main">
        <div className="ts-fan" aria-hidden="true">
          <div className="ts-card ts-card-l">
            <CardFace card="guard" />
          </div>
          <div className="ts-card ts-card-r">
            <CardFace card="inspector" />
          </div>
          <div className="ts-card ts-card-c">
            <CardFace card="boss" />
          </div>
        </div>
        <h1 className="ts-logo">リアルカードバトル</h1>
        <p className="ts-sub">コインでカードを出して、相手の HP を 0 に</p>

        <button
          className="ts-deck"
          onClick={() => {
            playUiTap();
            onDeck();
          }}
          aria-label="デッキを見る"
        >
          <span className="ts-deck-title">あなたのデッキ</span>
          <span className="ts-deck-grid">
            {deck.map((id) => (
              <span key={id} className="ts-deck-card">
                <CardFace card={id} small />
              </span>
            ))}
          </span>
        </button>
      </main>

      <footer className="ts-bottom">
        <div className="ts-levels" role="radiogroup" aria-label="CPU のつよさ">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              role="radio"
              aria-checked={level === l.id}
              className={`ts-level${level === l.id ? ' is-on' : ''}`}
              onClick={() => pick(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <button className="ts-battle" onClick={start}>
          <span>バトル！</span>
        </button>
        <TabBar active="battle" onDeck={onDeck} onBattle={() => undefined} />
      </footer>
    </div>
  );
}
