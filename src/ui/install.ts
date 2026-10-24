// ホーム画面に追加（PWA）。Android の Chrome などは beforeinstallprompt を覚えておいて、設定のボタンから出す。
// iPhone の Safari には仕組みが無いので、共有ボタンからの手順を文で案内する。すでにアプリとして開いていれば何も出さない。

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // ブラウザが勝手に出す案内は止め、設定のボタンから出す
    e.preventDefault();
    deferred = e as InstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
  });
}

/** すでにホーム画面のアプリとして開いている。 */
export function isStandalone(): boolean {
  try {
    return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/** iPhone・iPad の Safari（手順の案内を出す）。 */
export function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** ボタン 1 つで追加できる（Android の Chrome など）。 */
export function canPromptInstall(): boolean {
  return deferred !== null;
}

/** 追加の確認を出す。追加されたら true。 */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  return (await e.userChoice).outcome === 'accepted';
}
