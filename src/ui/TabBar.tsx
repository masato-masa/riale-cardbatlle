import { AnimatePresence } from 'motion/react';
import { useState, type ReactNode } from 'react';

import { SettingsSheet } from './SettingsSheet';
import { playUiTap } from './sound';

export type Tab = 'deck' | 'battle';

function CardsIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="8" width="14" height="19" rx="3" fill="#c9b8ff" stroke="#2a1658" strokeWidth="2" transform="rotate(-12 11 17)" />
      <rect x="13" y="5" width="14" height="19" rx="3" fill="#ffe08a" stroke="#5a3a06" strokeWidth="2" transform="rotate(8 20 15)" />
      <path d="M20 10 L21.6 13.4 L25.2 13.8 L22.5 16.2 L23.3 19.8 L20 18 L16.7 19.8 L17.5 16.2 L14.8 13.8 L18.4 13.4 Z" fill="#5a3a06" transform="rotate(8 20 15)" />
    </svg>
  );
}

function SwordsIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M6 6 L9 5 L24 20 L21 23 Z M26 6 L23 5 L8 20 L11 23 Z" fill="#fff3c0" stroke="#5a3a06" strokeWidth="2" strokeLinejoin="round" />
      <path d="M5 24 L9 20 M27 24 L23 20 M7 27 L11 23 M25 27 L21 23" stroke="#5a3a06" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M14 3 H18 L19 7 L22 8.5 L25.5 6.5 L28 9 L26 13 L27 16 L31 17 V21 L27 22 L26 25 L28 28.5 L25.5 31 L22 29 L19 30 L18 34 H14 L13 30 L10 29 L6.5 31 L4 28.5 L6 25 L5 22 L1 21 V17 L5 16 L6 13 L4 9 L6.5 6.5 L10 8.5 L13 7 Z"
        transform="translate(0 -2) scale(0.95 0.9) translate(1 3)"
        fill="#cfd6ff"
        stroke="#1b2a5c"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="4.5" fill="#1b2a5c" />
    </svg>
  );
}

/** 画面下のタブ（クラロワ型）。選んでいるタブは持ち上がって明るくなる。設定はここから開く。 */
export function TabBar({ active, onDeck, onBattle }: { active: Tab; onDeck: () => void; onBattle: () => void }) {
  const [settings, setSettings] = useState(false);
  const tab = (id: string, label: string, icon: ReactNode, on: boolean, go: () => void) => (
    <button
      key={id}
      className={`tab${on ? ' is-active' : ''}`}
      aria-current={on ? 'page' : undefined}
      onClick={() => {
        playUiTap();
        go();
      }}
    >
      <span className="tab-icon">{icon}</span>
      <span className="tab-label">{label}</span>
    </button>
  );
  return (
    <>
      <nav className="tabbar" aria-label="メニュー">
        {tab('deck', 'デッキ', <CardsIcon />, active === 'deck', onDeck)}
        {tab('battle', 'バトル', <SwordsIcon />, active === 'battle', onBattle)}
        {tab('settings', '設定', <GearIcon />, false, () => setSettings(true))}
      </nav>
      <AnimatePresence>{settings ? <SettingsSheet key="s" onClose={() => setSettings(false)} /> : null}</AnimatePresence>
    </>
  );
}
