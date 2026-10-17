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
import { Sheet } from './Sheets';
import { playUiTap } from './sound';

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
      </div>
      <button className="sheet-btn" onClick={onClose}>
        とじる
      </button>
    </Sheet>
  );
}
