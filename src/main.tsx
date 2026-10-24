import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';

import { App } from './App';

// 端末の「動きを減らす」設定に、アプリ全体で従う。
// reducedMotion="user" は transform と opacity の動きだけを止め、
// 色や影の変化は残すので、見た目が壊れない。
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);

// 公開版だけ、オフラインでも遊べるように Service Worker を入れる（開発中は入れない）。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const register = () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  // 読み込みが終わっていればすぐ、まだなら終わってから（最初の表示の邪魔をしない）
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
