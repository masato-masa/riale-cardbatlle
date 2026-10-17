import { CARDS, isBlocker, type CardId } from '@/game/cards';

import { CARD_ART } from './art';

/** カードの面。四隅に固定の値（左上 召喚コスト・右上 アタックコスト・左下 攻撃力・右下 HP）。
 *  上端の中央に能力の短い名前（ブロッカーは青い盾の形）。
 *  hp・atk を渡すと場のカードとして、減った HP を赤、上がった攻撃力を緑で出す。 */
export function CardFace({ card, hp, atk, small }: { card: CardId; hp?: number; atk?: number; small?: boolean }) {
  const def = CARDS[card];
  const shownHp = hp ?? def.hp;
  const shownAtk = atk ?? def.atk;
  const blocker = isBlocker(card);
  return (
    <div className={`face${blocker ? ' is-blocker' : ''}${small ? ' is-small' : ''}${def.token ? ' is-token' : ''}`}>
      <div className="face-body">
        <img className="face-art" src={CARD_ART[card]} alt="" draggable={false} />
        <span className="face-name">{def.name}</span>
      </div>
      {def.chip || blocker ? (
        <span className={`face-chip${blocker ? ' is-blocker' : ''}${def.chip ? '' : ' is-icon'}`}>
          {def.chip || <ShieldMark />}
        </span>
      ) : null}
      <span className="pip pip-summon" aria-label="召喚コスト">
        {def.summon}
      </span>
      <span className="pip pip-attack" aria-label="アタックコスト">
        {def.attackCost}
      </span>
      <span className={`pip pip-atk${shownAtk > def.atk ? ' is-up' : ''}`} aria-label="攻撃力">
        {shownAtk}
      </span>
      <span className={`pip pip-hp${shownHp < def.hp ? ' is-hurt' : ''}`} aria-label="HP">
        {shownHp}
      </span>
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
