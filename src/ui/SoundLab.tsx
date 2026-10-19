import { useEffect, useState } from 'react';

import { setBgmTension, startBgm, stopBgm } from './bgm';
import { getPick, knownVariants, setPick, type VoiceName } from './samples';
import { playVoice, primeAudio } from './sound';

/** サウンドテスト（聞き比べ）。URL に ?sounds を付けるか、ホームの「テスト用」から開く。
 *  音ごとに候補（録音 1〜、合成）が並ぶ。押すとその音が鳴り、そのまま「採用」になる（端末に保存）。
 *  「おまかせ」は録音の候補をランダムに鳴らす（既定）。 */
const GROUPS: { title: string; items: { name: VoiceName; label: string; note: string }[] }[] = [
  {
    title: '操作',
    items: [
      { name: 'tap', label: 'ボタン', note: '' },
      { name: 'select', label: '選ぶ', note: '' },
    ],
  },
  {
    title: '召喚',
    items: [
      { name: 'summonSmall', label: '小さな召喚', note: 'コスト 4 以下' },
      { name: 'summonBig', label: '大きな召喚', note: 'コスト 5 以上' },
      { name: 'spellCast', label: '呪文を唱える', note: '' },
    ],
  },
  {
    title: '戦闘',
    items: [
      { name: 'hitUnit', label: '命中（ユニット）', note: '' },
      { name: 'hitBlocker', label: '命中（ブロッカー）', note: '' },
      { name: 'hitPlayer', label: '命中（プレイヤー）', note: 'いちばん重い' },
      { name: 'death', label: '倒れる', note: '' },
      { name: 'barrier', label: '結界が弾く', note: '' },
    ],
  },
  {
    title: '合図',
    items: [
      { name: 'ready', label: 'クールタイム明け', note: '' },
      { name: 'heal', label: '回復', note: '' },
      { name: 'horn', label: '角笛（コイン 2 倍）', note: '' },
      { name: 'battleStart', label: '対戦開始', note: 'VS の演出に合わせる' },
    ],
  },
  {
    title: '勝敗',
    items: [
      { name: 'win', label: '勝ち', note: '' },
      { name: 'lose', label: '負け', note: '' },
    ],
  },
];

type Song = 'home' | 'battle' | 'battleTense' | null;

function Item({ name, label, note }: { name: VoiceName; label: string; note: string }) {
  const [pick, setP] = useState<number | null>(() => getPick(name));
  const vs = knownVariants(name);
  const choose = (n: number | null, play = true) => {
    primeAudio();
    setPick(name, n);
    setP(n);
    if (play) playVoice(name, n ?? undefined);
  };
  return (
    <div className="lab-item">
      <div className="lab-item-head">
        <b>{label}</b>
        {note ? <small>{note}</small> : null}
      </div>
      <div className="lab-cands">
        {vs.map((n) => (
          <button key={n} className={`lab-cand${pick === n ? ' is-on' : ''}`} onClick={() => choose(n)}>
            {n}
          </button>
        ))}
        <button className={`lab-cand lab-auto${pick === null ? ' is-on' : ''}`} onClick={() => choose(null)}>
          おまかせ
        </button>
      </div>
    </div>
  );
}

export function SoundLab() {
  const [song, setSong] = useState<Song>(null);
  useEffect(() => () => stopBgm(0.2), []);
  const play = (s: Song) => {
    primeAudio();
    if (s === null) {
      stopBgm(0.4);
    } else {
      startBgm(s === 'home' ? 'home' : 'battle');
      setBgmTension(s === 'battleTense');
    }
    setSong(s);
  };
  return (
    <div className="lab">
      <a className="lab-back" href={location.pathname}>
        ← ゲームへもどる
      </a>
      <h1 className="lab-title">サウンドテスト</h1>
      <p className="lab-sub">
        数字は録音の候補です。押すと鳴り、そのまま採用されます（この端末に保存）。「おまかせ」は候補をランダムに鳴らします（既定）。
      </p>

      <section className="lab-group">
        <h2>BGM</h2>
        <div className="lab-row">
          {(
            [
              ['home', 'ホーム'],
              ['battle', '対戦'],
              ['battleTense', '対戦（終盤）'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={`lab-btn${song === id ? ' is-on' : ''}`} onClick={() => play(id)}>
              {label}
            </button>
          ))}
          <button className="lab-btn is-stop" onClick={() => play(null)}>
            止める
          </button>
        </div>
      </section>

      {GROUPS.map((g) => (
        <section key={g.title} className="lab-group">
          <h2>{g.title}</h2>
          <div className="lab-list">
            {g.items.map((it) => (
              <Item key={it.name} {...it} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
