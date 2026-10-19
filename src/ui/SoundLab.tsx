import { useEffect, useState } from 'react';

import { setBgmTension, startBgm, stopBgm } from './bgm';
import { primeAudio, playVoice } from './sound';
import type { VoiceName } from './sfx-voices';

/** サウンドテスト（聞き比べ）。URL に ?sounds を付けると開く。ボタンを押すと、その音がゲームと同じ経路で鳴る。 */
const GROUPS: { title: string; items: { name: VoiceName; label: string; note: string }[] }[] = [
  {
    title: '操作',
    items: [
      { name: 'tap', label: 'ボタン', note: '押すたびに高さが少し変わる' },
      { name: 'select', label: '選ぶ', note: '上がる 2 音' },
      { name: 'pickup', label: '手札を持ち上げる', note: 'ふわっと浮く' },
      { name: 'reject', label: '打てない札', note: '低くてやわらかい 2 音' },
    ],
  },
  {
    title: '召喚',
    items: [
      { name: 'summonSmall', label: '小さな召喚', note: 'コスト 4 以下' },
      { name: 'summonBig', label: '大きな召喚', note: 'コスト 5 以上' },
      { name: 'spellCast', label: '呪文を唱える', note: '上がる風ときらめき' },
    ],
  },
  {
    title: '戦闘',
    items: [
      { name: 'hitUnit', label: '命中（ユニット）', note: '' },
      { name: 'hitBlocker', label: '命中（ブロッカー）', note: '金属の音' },
      { name: 'hitPlayer', label: '命中（プレイヤー）', note: 'いちばん重い' },
      { name: 'death', label: '倒れる', note: '' },
      { name: 'barrier', label: '結界が弾く', note: 'ガラスの響き' },
      { name: 'stun', label: '足止め', note: '氷と鎖' },
    ],
  },
  {
    title: '合図',
    items: [
      { name: 'ready', label: 'クールタイム明け', note: '高い小さな鐘' },
      { name: 'heal', label: '回復', note: '上がるきらめき' },
      { name: 'horn', label: '角笛（コイン 2 倍）', note: '' },
      { name: 'battleStart', label: '対戦開始', note: 'VS の演出に合わせる' },
    ],
  },
  {
    title: '勝敗',
    items: [
      { name: 'win', label: '勝ち', note: 'ファンファーレ' },
      { name: 'lose', label: '負け', note: '静かな 3 音' },
    ],
  },
];

type Song = 'home' | 'battle' | 'battleTense' | null;

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
      <h1 className="lab-title">サウンドテスト</h1>
      <p className="lab-sub">押すと鳴ります。スマホの音量を上げて、イヤホンとスピーカーの両方で聴き比べてください。</p>

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
              <button
                key={it.name}
                className="lab-item"
                onClick={() => {
                  primeAudio();
                  playVoice(it.name);
                }}
              >
                <b>{it.label}</b>
                {it.note ? <small>{it.note}</small> : null}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
