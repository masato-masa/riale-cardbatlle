import { useState } from 'react';

import { refreshBgm } from './bgm';
import {
  isBgmEnabled,
  isHapticsEnabled,
  isSoundEnabled,
  setBgmEnabled,
  setHapticsEnabled,
  setSoundEnabled,
} from './settings';
import { resetTutorial } from '@/storage/profile';
import { Sheet } from './Sheets';
import { getKit, setKit } from './samples';
import { playVoice, playUiTap } from './sound';

function Row({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="sheet-row static">
      <span>{label}</span>
      <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} />
    </div>
  );
}

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [sound, setSound] = useState(isSoundEnabled());
  const [bgm, setBgm] = useState(isBgmEnabled());
  const [haptics, setHaptics] = useState(isHapticsEnabled());
  const [kit, setKitState] = useState(getKit());
  const [tutAgain, setTutAgain] = useState(false);
  return (
    <Sheet title="設定" onClose={onClose}>
      <div className="sheet-list">
        <Row
          label="効果音"
          on={sound}
          onToggle={() => {
            setSoundEnabled(!sound);
            setSound(!sound);
            refreshBgm();
            playUiTap();
          }}
        />
        <Row
          label="BGM"
          on={bgm}
          onToggle={() => {
            setBgmEnabled(!bgm);
            setBgm(!bgm);
            refreshBgm();
            playUiTap();
          }}
        />
        <Row
          label="振動"
          on={haptics}
          onToggle={() => {
            setHapticsEnabled(!haptics);
            setHaptics(!haptics);
            playUiTap();
          }}
        />
        <div className="sheet-row static">
          <span>効果音の種類</span>
          <span className="kit-pick">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                className={`kit-btn${kit === n ? ' is-on' : ''}`}
                aria-pressed={kit === n}
                onClick={() => {
                  setKit(n);
                  setKitState(n);
                  playVoice('summonSmall');
                }}
              >
                {'ABCD'[n - 1]}
              </button>
            ))}
          </span>
        </div>
        <div className="sheet-row static">
          <span>遊びかたの案内</span>
          <button
            className="sheet-btn quiet kit-again"
            disabled={tutAgain}
            onClick={() => {
              resetTutorial();
              setTutAgain(true);
              playUiTap();
            }}
          >
            {tutAgain ? '次の対戦で出ます' : 'もう一度見る'}
          </button>
        </div>
      </div>
      <button className="sheet-btn" onClick={onClose}>
        とじる
      </button>
    </Sheet>
  );
}
