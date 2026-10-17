import { AnimatePresence } from 'motion/react';
import { useState } from 'react';

import type { CpuLevel } from '@/ai/cpu';

import { CardFace } from './CardFace';
import { SettingsIcon } from './icons';
import { SettingsSheet } from './SettingsSheet';
import { playUiTap, primeAudio } from './sound';

export function Home({ onStart }: { onStart: (level: CpuLevel) => void }) {
  const [settings, setSettings] = useState(false);
  const start = (level: CpuLevel) => {
    primeAudio();
    playUiTap();
    onStart(level);
  };
  return (
    <div className="app app-home">
      <div className="home-top">
        <button
          className="icon-btn"
          aria-label="設定"
          onClick={() => {
            playUiTap();
            setSettings(true);
          }}
        >
          <SettingsIcon />
        </button>
      </div>
      <div className="home">
        <div className="home-art home-fan" aria-hidden="true">
          <div className="fan-card fan-l">
            <CardFace card="guard" />
          </div>
          <div className="fan-card fan-c">
            <CardFace card="boss" />
          </div>
          <div className="fan-card fan-r">
            <CardFace card="inspector" />
          </div>
        </div>
        <h1 className="home-title">リアルカードバトル</h1>
        <p className="home-sub">時間でたまるコインでカードを出し、相手の HP を 0 に</p>
        <div className="home-buttons">
          <button className="home-btn primary" onClick={() => start('normal')}>
            CPU と対戦（ふつう）
          </button>
          <button className="home-btn" onClick={() => start('easy')}>
            よわい CPU
          </button>
          <button className="home-btn" onClick={() => start('hard')}>
            つよい CPU
          </button>
        </div>
      </div>
      <AnimatePresence>{settings ? <SettingsSheet key="s" onClose={() => setSettings(false)} /> : null}</AnimatePresence>
    </div>
  );
}
