import { useEffect, useState } from 'react';

import type { CpuLevel } from '@/ai/cpu';
import type { CardId } from '@/game/cards';
import { loadDeck } from '@/storage/deck';

import { startBgm } from './ui/bgm';
import { DeckScreen } from './ui/DeckScreen';
import { Game } from './ui/Game';
import { Home } from './ui/Home';
import './ui/shared/tokens.css';
import './ui/shared/chrome.css';
import './ui/styles.css';
import './ui/polish.css';
import './ui/title.css';

// 開発中だけ、音の検査（audio lab）を読み込む
if (import.meta.env.DEV) void import('./ui/audio-lab');

type Screen = { kind: 'home' } | { kind: 'deck' } | { kind: 'game'; level: CpuLevel };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const [deck, setDeck] = useState<CardId[]>(loadDeck);
  const inGame = screen.kind === 'game';
  // ホームとデッキ画面ではホームの曲を流し続ける（対戦に入ると Game が対戦の曲に切り替える）
  useEffect(() => {
    if (!inGame) startBgm('home');
  }, [inGame]);
  if (screen.kind === 'game') return <Game level={screen.level} deck={deck} onExit={() => setScreen({ kind: 'home' })} />;
  if (screen.kind === 'deck') return <DeckScreen deck={deck} onChange={setDeck} onBack={() => setScreen({ kind: 'home' })} />;
  return <Home deck={deck} onStart={(level) => setScreen({ kind: 'game', level })} onDeck={() => setScreen({ kind: 'deck' })} />;
}
