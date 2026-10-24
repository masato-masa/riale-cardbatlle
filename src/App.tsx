import { lazy, Suspense, useEffect, useState } from 'react';

import type { CpuLevel } from '@/ai/cpu';
import type { CardId } from '@/game/cards';
import { loadDeck } from '@/storage/deck';

import { startBgm } from './ui/bgm';
import { Home } from './ui/Home';
import { RewardChest } from './ui/RewardChest';
import './ui/shared/tokens.css';
import './ui/shared/chrome.css';
import './ui/styles.css';
import './ui/polish.css';
import './ui/title.css';

// 最初に要るのはホームだけ。対戦・デッキ画面・サウンドテストは別ファイルにして、ホームを出したあとで先読みする（最初の読み込みを軽く）
const loadGame = () => import('./ui/Game');
const loadDeckScreen = () => import('./ui/DeckScreen');
const Game = lazy(() => loadGame().then((m) => ({ default: m.Game })));
const DeckScreen = lazy(() => loadDeckScreen().then((m) => ({ default: m.DeckScreen })));
const SoundLab = lazy(() => import('./ui/SoundLab').then((m) => ({ default: m.SoundLab })));

/** 別ファイルの画面を読み込む一瞬の間（ほぼ見えない。先読みしているので通常は待たない）。 */
const Wait = () => <div style={{ position: 'fixed', inset: 0, background: '#1a1338' }} />;

type Screen = { kind: 'home' } | { kind: 'deck' } | { kind: 'game'; level: CpuLevel };

export function App() {
  // ?sounds: サウンドテスト（聞き比べ）
  if (new URLSearchParams(location.search).has('sounds'))
    return (
      <Suspense fallback={<Wait />}>
        <SoundLab />
      </Suspense>
    );
  // ?chest: 宝箱の開封演出の確認
  if (new URLSearchParams(location.search).has('chest'))
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#1b1440' }}>
        <RewardChest cards={['reaper']} />
      </div>
    );
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const [deck, setDeck] = useState<CardId[]>(loadDeck);
  const inGame = screen.kind === 'game';
  // ホームとデッキ画面ではホームの曲を流し続ける（対戦に入ると Game が対戦の曲に切り替える）
  useEffect(() => {
    if (!inGame) startBgm('home');
  }, [inGame]);
  // ホームを出したら、対戦とデッキ画面を裏で先に読んでおく（押した瞬間に待たない）
  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadGame();
      void loadDeckScreen();
    }, 300);
    return () => window.clearTimeout(t);
  }, []);
  if (screen.kind === 'game')
    return (
      <Suspense fallback={<Wait />}>
        <Game level={screen.level} deck={deck} onExit={() => setScreen({ kind: 'home' })} />
      </Suspense>
    );
  if (screen.kind === 'deck')
    return (
      <Suspense fallback={<Wait />}>
        <DeckScreen deck={deck} onChange={setDeck} onBack={() => setScreen({ kind: 'home' })} />
      </Suspense>
    );
  return <Home deck={deck} onStart={(level) => setScreen({ kind: 'game', level })} onDeck={() => setScreen({ kind: 'deck' })} />;
}
