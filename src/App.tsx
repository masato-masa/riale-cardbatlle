import { useState } from 'react';

import type { CpuLevel } from '@/ai/cpu';
import type { CardId } from '@/game/cards';
import { loadDeck } from '@/storage/deck';

import { DeckScreen } from './ui/DeckScreen';
import { Game } from './ui/Game';
import { Home } from './ui/Home';
import './ui/shared/tokens.css';
import './ui/shared/chrome.css';
import './ui/styles.css';
import './ui/polish.css';

type Screen = { kind: 'home' } | { kind: 'deck' } | { kind: 'game'; level: CpuLevel };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const [deck, setDeck] = useState<CardId[]>(loadDeck);
  if (screen.kind === 'game') return <Game level={screen.level} deck={deck} onExit={() => setScreen({ kind: 'home' })} />;
  if (screen.kind === 'deck') return <DeckScreen deck={deck} onChange={setDeck} onBack={() => setScreen({ kind: 'home' })} />;
  return <Home onStart={(level) => setScreen({ kind: 'game', level })} onDeck={() => setScreen({ kind: 'deck' })} />;
}
