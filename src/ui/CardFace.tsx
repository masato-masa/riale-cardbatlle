import { CARDS, isBlocker, type CardId } from '@/game/cards';

import { CARD_ART } from './art';

/** カードの面。左上 召喚コスト・左下 攻撃力（赤）・右下 HP（緑）。
 *  建築物は攻撃力が無く（石の枠）、呪文は召喚コストだけ（紫の枠）。
 *  能力の文字は面に書かない（長押しの説明で見る）。ブロッカーだけ上端に盾の印。
 *  hp・atk を渡すと場のカードとして、減った HP を赤、上がった攻撃力を金の縁で出す。 */
export function CardFace({ card, hp, atk, small }: { card: CardId; hp?: number; atk?: number; small?: boolean }) {
  const def = CARDS[card];
  const shownHp = hp ?? def.hp;
  const shownAtk = atk ?? def.atk;
  const blocker = isBlocker(card);
  const cls = ['face', `is-${def.type}`];
  if (blocker) cls.push('is-blocker');
  if (small) cls.push('is-small');
  if (def.token) cls.push('is-token');
  return (
    <div className={cls.join(' ')}>
      <div className="face-body">
        <img className="face-art" src={CARD_ART[card]} alt="" draggable={false} />
        <span className="face-name">{def.name}</span>
      </div>
      {blocker ? (
        <span className="face-chip is-icon" aria-label="ブロッカー">
          <ShieldMark />
        </span>
      ) : null}
      <span className="pip pip-summon" aria-label="召喚コスト">
        {def.summon}
      </span>
      {def.type === 'unit' ? (
        <span className={`pip pip-atk${shownAtk > def.atk ? ' is-up' : ''}`} aria-label="攻撃力">
          {shownAtk}
        </span>
      ) : null}
      {def.type !== 'spell' ? (
        <span className={`pip pip-hp${shownHp < def.hp ? ' is-hurt' : ''}`} aria-label="HP">
          {shownHp}
        </span>
      ) : null}
    </div>
  );
}

export function ShieldMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.5 L20 5.5 V11.5 C20 16.5 16.6 20 12 21.5 C7.4 20 4 16.5 4 11.5 V5.5 Z"
        fill="#4fa3ff"
        stroke="#0b1520"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
