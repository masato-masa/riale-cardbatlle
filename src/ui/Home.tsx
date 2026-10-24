import { AnimatePresence } from 'motion/react';
import { useState } from 'react';

import type { CpuLevel } from '@/ai/cpu';
import type { CardId } from '@/game/cards';
import { isUnlockAll, setUnlockAll } from '@/storage/collection';
import { loadLevel, loadRecord, saveLevel } from '@/storage/profile';
import { CARDS } from '@/game/cards';
import { loadDaily, MISSIONS } from '@/storage/daily';
import { loadHistory, suggestLevel, summarize } from '@/storage/history';
import { ARENAS, arenaIndex, loadArenaSeen, loadTrophies, saveArenaSeen } from '@/storage/trophy';

import { ARENA_FLOOR_URLS, HERO_ME_URL, ICON_URL } from './art';
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
  const trophies = loadTrophies();
  const ai = arenaIndex(trophies);
  const nextArena = ARENAS[ai + 1];
  const arenaPct = nextArena ? ((trophies - ARENAS[ai]!.from) / (nextArena.from - ARENAS[ai]!.from)) * 100 : 100;
  // 扇に出すのは、いまのデッキのユニットのうちコストの高い 3 枚（クラロワのホームのように、自分のデッキが見える）
  const fan = (() => {
    const units = [...deck].filter((c) => CARDS[c].type === 'unit').sort((a, b) => CARDS[b].summon - CARDS[a].summon);
    const pick = [...units, ...deck].filter((c, i, arr) => arr.indexOf(c) === i);
    return [pick[0] ?? 'boss', pick[1] ?? 'guard', pick[2] ?? 'inspector'] as const;
  })();
  const [dev, setDev] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  /** 新しいアリーナに上がってから初めてホームに来たときの演出（一度だけ）。 */
  const [arenaUp, setArenaUp] = useState(() => arenaIndex(loadTrophies()) > loadArenaSeen());
  const daily = loadDaily();
  const dailyDone = daily.missions.filter((id) => (daily.progress[id] ?? 0) >= MISSIONS[id].goal).length;
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
    <div className="ts" style={{ backgroundImage: `url(${ARENA_FLOOR_URLS[ai]})` }}>
      <div className="arena-floor" aria-hidden="true" style={{ backgroundImage: `url(${ARENA_FLOOR_URLS[ai]})`, filter: ARENAS[ai]!.tint }} />
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
        {arenaUp ? (
          <Sheet
            key="arena-up"
            title="アリーナ昇格！"
            onClose={() => {
              saveArenaSeen(ai);
              setArenaUp(false);
            }}
          >
            <div className="arena-up-card">
              <img className="arena-up-floor" src={ARENA_FLOOR_URLS[ai]} alt="" draggable={false} />
              <b className="arena-up-name">
                <img src={ICON_URL.arena} alt="" draggable={false} />
                {ARENAS[ai]!.name}
              </b>
              <p>宝箱からコスト {ARENAS[ai]!.cardCap} までのカードが出るようになり、出てくる相手デッキが増えました。</p>
            </div>
            <button
              className="sheet-btn"
              onClick={() => {
                playUiTap();
                saveArenaSeen(ai);
                setArenaUp(false);
              }}
            >
              OK
            </button>
          </Sheet>
        ) : null}
        {statsOpen ? (
          <Sheet key="stats" title="戦績（直近 50 試合）" onClose={() => setStatsOpen(false)}>
            {(() => {
              const s = summarize(loadHistory());
              if (s.total.n === 0) return <p className="card-detail-note">まだ記録がありません。対戦すると、ここに勝率やよく出すカードが出ます。</p>;
              return (
                <div className="sheet-list">
                  <div className="stat-row is-total">
                    <span>勝率</span>
                    <b>{s.total.pct}%</b>
                    <small>{s.total.n} 試合・平均 {s.avgSec} 秒・最高 {record.best} 連勝</small>
                  </div>
                  <div className="stat-head">最近の対戦</div>
                  <div className="stat-recent">
                    {loadHistory()
                      .slice(0, 10)
                      .map((r, i) => (
                        <span key={i} className={`recent-mark is-${r.result}`} title={`${r.rival}デッキ（${{ easy: 'よわい', normal: 'ふつう', hard: 'つよい' }[r.level]}）`}>
                          {r.result === 'win' ? '勝' : r.result === 'lose' ? '負' : '分'}
                        </span>
                      ))}
                  </div>
                  <div className="stat-head">難易度別</div>
                  {s.byLevel.map((r) => (
                    <div key={r.label} className="stat-row">
                      <span>{r.label}</span>
                      <span className="mission-bar" aria-hidden="true"><i style={{ width: `${r.pct}%` }} /></span>
                      <b>{r.pct}%</b>
                      <small>{r.n} 試合</small>
                    </div>
                  ))}
                  <div className="stat-head">相手デッキ別</div>
                  {s.byRival.slice(0, 6).map((r) => (
                    <div key={r.label} className="stat-row">
                      <span>{r.label}</span>
                      <span className="mission-bar" aria-hidden="true"><i style={{ width: `${r.pct}%` }} /></span>
                      <b>{r.pct}%</b>
                      <small>{r.n} 試合</small>
                    </div>
                  ))}
                  <div className="stat-head">よく出すカード</div>
                  <div className="stat-cards">
                    {s.topCards.map(({ card, count }) => (
                      <span key={card} className="stat-card">
                        <CardFace card={card} small />
                        <small>
                          {CARDS[card].name} ×{count}
                        </small>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </Sheet>
        ) : null}
        {dailyOpen ? (
          <Sheet key="daily" title="きょうのミッション" onClose={() => setDailyOpen(false)}>
            <div className="sheet-list">
              {daily.missions.map((id) => {
                const n = daily.progress[id] ?? 0;
                const goal = MISSIONS[id].goal;
                return (
                  <div key={id} className={`mission-row${n >= goal ? ' is-done' : ''}`}>
                    <span className="mission-text">{MISSIONS[id].text}</span>
                    <span className="mission-bar" aria-hidden="true">
                      <i style={{ width: `${(n / goal) * 100}%` }} />
                    </span>
                    <b className="mission-count">{n >= goal ? '達成' : `${n}/${goal}`}</b>
                  </div>
                );
              })}
            </div>
            <p className="card-detail-note">達成するたびに宝箱ゲージが 1 たまります。ミッションは毎日入れ替わります。</p>
          </Sheet>
        ) : null}
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
        <div className="ts-arena" aria-label={`トロフィー ${trophies}、${ARENAS[ai]!.name}`}>
          <span className="ts-arena-name">
            <img src={ICON_URL.arena} alt="" draggable={false} />
            {ARENAS[ai]!.name}
          </span>
          <span className="ts-trophy">
            <img src={ICON_URL.trophy} alt="" draggable={false} />
            <b>{trophies}</b>
          </span>
          {nextArena ? <span className="ts-arena-bar" aria-hidden="true"><i style={{ width: `${Math.max(4, arenaPct)}%` }} /></span> : null}
          {nextArena ? <small className="ts-arena-next">{nextArena.name}まで あと {nextArena.from - trophies}</small> : null}
          <button
            className={`ts-daily${dailyDone === daily.missions.length ? ' is-done' : ''}`}
            onClick={() => {
              playUiTap();
              setDailyOpen(true);
            }}
          >
            <img src={ICON_URL.mission} alt="" draggable={false} />
            ミッション {dailyDone}/{daily.missions.length}
          </button>
          <button
            className="ts-daily"
            onClick={() => {
              playUiTap();
              setStatsOpen(true);
            }}
          >
            <img src={ICON_URL.stats} alt="" draggable={false} />
            戦績
          </button>
        </div>
      </header>

      <main className="ts-main">
        <div className="ts-fan" aria-hidden="true">
          <div className="ts-card ts-card-l">
            <CardFace card={fan[1]} />
          </div>
          <div className="ts-card ts-card-r">
            <CardFace card={fan[2]} />
          </div>
          <div className="ts-card ts-card-c">
            <CardFace card={fan[0]} />
          </div>
        </div>
        <h1 className="ts-logo">リアルカードバトル</h1>
        <p className="ts-sub">コインでカードを出して、相手を倒そう</p>

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
        {(() => {
          const sug = suggestLevel(loadHistory(), level);
          if (!sug) return null;
          const name = LEVELS.find((l) => l.id === sug.to)!.label;
          return (
            <button className="ts-suggest" onClick={() => pick(sug.to)}>
              {sug.why === 'win' ? `3 連勝！「${name}」に挑戦する？` : `3 連敗中。「${name}」で腕を磨く？`}
            </button>
          );
        })()}
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
