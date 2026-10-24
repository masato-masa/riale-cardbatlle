import { AnimatePresence } from 'motion/react';
import { useState, type ReactNode } from 'react';

import { ICON_URL } from './art';
import { SettingsSheet } from './SettingsSheet';
import { playUiTap } from './sound';

export type Tab = 'deck' | 'battle';

const icon = (src: string) => <img src={src} alt="" draggable={false} />;

/** 画面下のタブ（クラロワ型）。選んでいるタブは持ち上がって明るくなる。設定はここから開く。 */
/** onDev を渡すと、設定の一番下に「テスト用」（開発者メニュー）を出す。 */
export function TabBar({ active, onDeck, onBattle, onDev }: { active: Tab; onDeck: () => void; onBattle: () => void; onDev?: () => void }) {
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
        {tab('deck', 'デッキ', icon(ICON_URL.tabDeck), active === 'deck', onDeck)}
        {tab('battle', 'バトル', icon(ICON_URL.tabBattle), active === 'battle', onBattle)}
        {tab('settings', '設定', icon(ICON_URL.tabSettings), false, () => setSettings(true))}
      </nav>
      <AnimatePresence>{settings ? <SettingsSheet key="s" onClose={() => setSettings(false)} onDev={onDev} /> : null}</AnimatePresence>
    </>
  );
}
