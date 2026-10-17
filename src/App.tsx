import { useState } from 'react';

import type { CpuLevel } from '@/ai/cpu';

import { Game } from './ui/Game';
import { Home } from './ui/Home';
import './ui/shared/tokens.css';
import './ui/shared/chrome.css';
import './ui/styles.css';

export function App() {
  const [level, setLevel] = useState<CpuLevel | null>(null);
  if (level) return <Game level={level} onExit={() => setLevel(null)} />;
  return <Home onStart={setLevel} />;
}
