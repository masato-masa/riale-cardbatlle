import { AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';

import type { CpuLevel } from '@/ai/cpu';
import type { CardId } from '@/game/cards';
import { CHEST_POINTS, isUnlockAll, loadNew, loadPoints, loadUnlocked, pickReward, setUnlockAll } from '@/storage/collection';
import { loadAvatar, loadBeaten, loadLevel, loadName, loadRecord, resetProgress, saveAvatar, saveLevel } from '@/storage/profile';
import { CARDS, RIVAL_DECKS } from '@/game/cards';
import { CHALLENGE_POINTS, challengeFor, isChallengeCleared } from '@/storage/challenge';
import { loadDaily, MISSIONS } from '@/storage/daily';
import { loadHistory, suggestLevel, summarize } from '@/storage/history';
import { ARENAS, arenaIndex, loadArenaSeen, loadBestTrophies, loadTrophies, saveArenaSeen } from '@/storage/trophy';

import { ARENA_FLOOR_URLS, avatarUrl, CHEST_URL, COIN_URL, foePersona, foePortrait, HERO_ME_URL, ICON_URL } from './art';
import { CardFace } from './CardFace';
import { Sheet } from './Sheets';
import { getKit, setKit } from './samples';
import { playUiTap, playVoice, primeAudio } from './sound';
import { TabBar } from './TabBar';

const LEVELS: { id: CpuLevel; label: string }[] = [
  { id: 'easy', label: 'よわい' },
  { id: 'normal', label: 'ふつう' },
  { id: 'hard', label: 'つよい' },
];

/** ホーム（クラロワ型）。上=自分の札、中央=ロゴとデッキ、下=難易度・大きな「バトル」・タブ。 */
export function Home({ deck, onStart, onDeck }: { deck: CardId[]; onStart: (level: CpuLevel, challenge?: string) => void; onDeck: () => void }) {
  const [level, setLevel] = useState<CpuLevel>(loadLevel);
  const [name, setName] = useState(loadName);
  useEffect(() => {
    const on = () => setName(loadName());
    window.addEventListener('riale:name', on);
    return () => window.removeEventListener('riale:name', on);
  }, []);
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
  const [roadOpen, setRoadOpen] = useState(false);
  const [chalOpen, setChalOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatar, setAvatar] = useState(loadAvatar);
  const chal = challengeFor();
  const chalDone = isChallengeCleared();
  /** アリーナ i で初めて出てくる相手デッキ（それより前のアリーナに無いもの）。 */
  const freshFoes = (i: number) => ARENAS[i]!.pool.filter((n) => !ARENAS.slice(0, i).some((b) => b.pool.includes(n)));
  const newFoes = freshFoes(ai);
  /** 新しいアリーナに上がってから初めてホームに来たときの演出（一度だけ）。 */
  const [arenaUp, setArenaUp] = useState(() => arenaIndex(loadTrophies()) > loadArenaSeen());
  const daily = loadDaily();
  const dailyDone = daily.missions.filter((id) => (daily.progress[id] ?? 0) >= MISSIONS[id].goal).length;
  const [allOn, setAllOn] = useState(isUnlockAll);
  const [kit, setKitState] = useState(getKit);
  /** 「きろくをけす」を 1 回押した（もう 1 回で消す）。 */
  const [resetArmed, setResetArmed] = useState(false);
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
              {newFoes.length > 0 ? (
                <span className="road-foes arena-up-foes" aria-label={`新しい相手: ${newFoes.join('・')}`}>
                  {newFoes.map((n) => (
                    <img key={n} src={foePortrait(n)} alt="" title={`${n}デッキ`} draggable={false} />
                  ))}
                </span>
              ) : null}
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
        {avatarOpen ? (
          <Sheet key="avatar" title="アイコン" onClose={() => setAvatarOpen(false)}>
            {(() => {
              const beaten = loadBeaten();
              const all = ['hero', ...RIVAL_DECKS.map((d) => d.name)];
              return (
                <>
                  <p className="card-detail-note">勝ったことのある相手の顔を、自分のアイコンにできます（{beaten.size}/{RIVAL_DECKS.length}）。</p>
                  <div className="avatar-grid">
                    {all.map((a) => {
                      const open = a === 'hero' || beaten.has(a);
                      return (
                        <button
                          key={a}
                          className={`avatar-pick${a === avatar ? ' is-on' : ''}${open ? '' : ' is-locked'}`}
                          disabled={!open}
                          aria-label={open ? (a === 'hero' ? '最初の顔' : foePersona(a).name) : `${foePersona(a).name}に勝つと使える`}
                          onClick={() => {
                            playUiTap();
                            saveAvatar(a);
                            setAvatar(a);
                          }}
                        >
                          <img src={a === 'hero' ? HERO_ME_URL : foePortrait(a)} alt="" draggable={false} />
                          <small>{open ? (a === 'hero' ? 'はじめ' : foePersona(a).name) : '？'}</small>
                        </button>
                      );
                    })}
                  </div>
                </>
              );
            })()}
            <button className="sheet-btn" onClick={() => setAvatarOpen(false)}>
              とじる
            </button>
          </Sheet>
        ) : null}
        {chalOpen ? (
          <Sheet key="challenge" title="きょうのチャレンジ" onClose={() => setChalOpen(false)}>
            <div className="chal-card">
              <img className="chal-face" src={foePortrait(chal)} alt="" draggable={false} />
              <b className="chal-name">{foePersona(chal).name}</b>
              <small>
                {foePersona(chal).title}・{chal}デッキ・つよい
              </small>
              <span className="result-foe-deck chal-deck" aria-label="相手のデッキ">
                {(RIVAL_DECKS.find((d) => d.name === chal)?.deck ?? []).map((c, i) => (
                  <span key={`${c}-${i}`} className="result-foe-card">
                    <CardFace card={c} small />
                  </span>
                ))}
              </span>
              <p>{chalDone ? 'きょうはもう達成しました。また明日、別の相手が来ます。' : `勝つと宝箱ゲージ +${CHALLENGE_POINTS}（1 日 1 回）。トロフィーは「つよい」と同じだけ増減します。`}</p>
            </div>
            <button
              className="sheet-btn"
              onClick={() => {
                primeAudio();
                playUiTap();
                setChalOpen(false);
                onStart('hard', chal);
              }}
            >
              {chalDone ? 'もう一度戦う' : '挑戦する'}
            </button>
          </Sheet>
        ) : null}
        {roadOpen ? (
          <Sheet key="road" title="トロフィーロード" onClose={() => setRoadOpen(false)}>
            {/* クラロワのトロフィーロード: アリーナごとに、必要なトロフィー・宝箱の上限・新しく出てくる相手。上ほど先 */}
            <div className="road">
              {ARENAS.map((a, i) => {
                const fresh = freshFoes(i);
                const state = i < ai ? 'is-past' : i === ai ? 'is-now' : 'is-locked';
                return (
                  <div key={a.name} className={`road-row ${state}`}>
                    <img className="road-floor" src={ARENA_FLOOR_URLS[i]} alt="" draggable={false} />
                    <div className="road-body">
                      <b className="road-name">
                        {a.name}
                        {i === ai ? <span className="road-now">いまここ</span> : null}
                      </b>
                      <small className="road-need">
                        <img src={ICON_URL.trophy} alt="" draggable={false} />
                        {a.from}
                        {i > ai ? `（あと ${a.from - trophies}）` : ''}・宝箱からコスト {a.cardCap} まで
                      </small>
                      {fresh.length > 0 ? (
                        <span className="road-foes" aria-label={`新しい相手: ${fresh.join('・')}`}>
                          {fresh.map((n) => (
                            <img key={n} src={foePortrait(n)} alt="" title={`${n}デッキ`} draggable={false} />
                          ))}
                        </span>
                      ) : (
                        <small className="road-need">これまでの相手すべてが出てくる</small>
                      )}
                    </div>
                  </div>
                );
              }).reverse()}
            </div>
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
                  <div className="stat-row is-total">
                    <span>最高トロフィー</span>
                    <b>{loadBestTrophies()}</b>
                    <small>勝った相手 {loadBeaten().size}/{RIVAL_DECKS.length}</small>
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
                      <span title={`${r.label}デッキ`}>{foePersona(r.label).name}</span>
                      <span className="mission-bar" aria-hidden="true"><i style={{ width: `${r.pct}%` }} /></span>
                      <b>{r.pct}%</b>
                      <small>{r.n} 試合</small>
                    </div>
                  ))}
                  <div className="stat-head">よく出すカード</div>
                  <div className="stat-cards">
                    {s.topCards.map(({ card, count }) => (
                      <span key={card} className="stat-card">
                        <span className="stat-face">
                          <CardFace card={card} small />
                        </span>
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
          <Sheet key="dev" title="テスト用" onClose={() => { setDev(false); setResetArmed(false); }}>
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
              <div className="sheet-row static">
                <span>効果音の種類</span>
                <span className="kit-pick">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      className={`kit-btn${kit === n ? ' is-on' : ''}`}
                      aria-pressed={kit === n}
                      onClick={() => {
                        setKit(n);
                        setKitState(n);
                        playVoice('summonSmall');
                      }}
                    >
                      {'ABCD'[n - 1]}
                    </button>
                  ))}
                </span>
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
              {/* 自走ループの感想箱（遊んで気づいたことを送ると、次の周で読まれる） */}
              <a className="sheet-row" href="https://claude.ai/artifact/Um54dYbv9eUVcsTD2XyioL" target="_blank" rel="noreferrer">
                <span>感想を送る（感想箱）</span>
                <span aria-hidden="true">›</span>
              </a>
              <button
                className={`sheet-row reset-row${resetArmed ? ' is-armed' : ''}`}
                onClick={() => {
                  playUiTap();
                  if (!resetArmed) return setResetArmed(true);
                  resetProgress();
                  location.reload();
                }}
              >
                <span>{resetArmed ? 'もう一度押すと消えます' : 'きろくをけす'}</span>
                <small>トロフィー・カード・デッキ・戦績</small>
              </button>
            </div>
            <button className="sheet-btn" onClick={() => { setDev(false); setResetArmed(false); }}>
              とじる
            </button>
          </Sheet>
        ) : null}
      </AnimatePresence>
      <header className="ts-top">
        <div className="ts-player">
          <button
            className="ts-medal"
            aria-label="アイコンを変える"
            onClick={() => {
              playUiTap();
              setAvatarOpen(true);
            }}
          >
            <img src={avatarUrl(avatar)} alt="" draggable={false} />
          </button>
          <span className="ts-name">
            <b>{name}</b>
            <small>
              {record.win} 勝 {record.lose} 敗{record.streak >= 2 ? ` ・ ${record.streak} 連勝中` : ''}
            </small>
          </span>
        </div>
        <div className="ts-arena" aria-label={`トロフィー ${trophies}、${ARENAS[ai]!.name}`}>
          <button
            className="ts-arena-name"
            onClick={() => {
              playUiTap();
              setRoadOpen(true);
            }}
          >
            <img src={ICON_URL.arena} alt="" draggable={false} />
            {ARENAS[ai]!.name}
            <span aria-hidden="true">›</span>
          </button>
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
          <button
            className={`ts-daily ts-chal${chalDone ? ' is-done' : ''}`}
            onClick={() => {
              playUiTap();
              setChalOpen(true);
            }}
          >
            <img src={foePortrait(chal)} alt="" draggable={false} />
            チャレンジ{chalDone ? ' ✓' : ''}
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
        {(() => {
          // 次の宝箱の見通し（クラロワのホームの宝箱の枠）。勝てば 2 点で必ず開き、1 点たまっていれば負けても開く
          if (pickReward(loadUnlocked(), () => 0) === null) return null;
          const pts = loadPoints();
          return (
            <div className="ts-chest" aria-label={`宝箱ゲージ ${pts}/${CHEST_POINTS}`}>
              <img className="ts-chest-icon" src={CHEST_URL} alt="" draggable={false} />
              <span>{pts > 0 ? '次の 1 戦で宝箱が開く（負けても）' : '勝てば宝箱が開いて、新しいカード'}</span>
              {Array.from({ length: CHEST_POINTS }, (_, i) => (
                <img key={i} src={COIN_URL} alt="" draggable={false} className={`reward-coin${i < pts ? ' is-on' : ''}`} />
              ))}
            </div>
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
        <TabBar active="battle" onDeck={onDeck} onBattle={() => undefined} onDev={() => setDev(true)} deckBadge={loadNew().size > 0} />
      </footer>
    </div>
  );
}
