import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';

import { App } from './App';
// ホーム画面に追加の合図（beforeinstallprompt）は読み込み直後に来るので、最初に聞き始める
import './ui/install';

// 端末の「動きを減らす」設定に、アプリ全体で従う。
// reducedMotion="user" は transform と opacity の動きだけを止め、
// 色や影の変化は残すので、見た目が壊れない。
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
      {/* 横向きのスマホでは「縦向きに」を全面に出す（クラロワと同じく縦向き専用。表示は CSS の向きと高さで切り替える） */}
      <div className="rotate-hint" role="alert">
        <span className="rotate-phone" aria-hidden="true" />
        <b>スマホを縦向きにしてください</b>
      </div>
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
