import { CARDS, type CardId } from '@/game/cards';

import { cardArt } from './art';

/** 場のカードの状態。ブロッカー・結界・ステルス・遅延（足止め・通行止め）。 */
export type CardState = 'blocker' | 'barrier' | 'stealth' | 'stun' | 'seal' | 'poison' | 'disarm';

const STATE_LABEL: Record<CardState, string> = {
  blocker: 'ブロッカー',
  barrier: '結界',
  stealth: 'ステルス',
  stun: '遅延中',
  seal: '封印',
  poison: '毒',
  disarm: '攻撃不能',
};

/** カードの面。左上 召喚コスト・右上 クールタイム（秒）・左下 攻撃力（赤）・右下 HP（緑）。
 *  建築物は攻撃力とクールタイムが無く（石の枠）、呪文は召喚コストだけ（紫の枠）。
 *  能力の文字は面に書かない（長押しの説明で見る）。場のカードだけ、上端に状態のアイコンを並べる。
 *  hp・atk を渡すと場のカードとして、減った HP を赤、上がった攻撃力を金の縁で出す。 */
export function CardFace({
  card,
  hp,
  maxHp,
  atk,
  small,
  states: statesProp,
  mine,
}: {
  card: CardId;
  hp?: number;
  /** 最大 HP（バフを含む）。無ければカードの HP。 */
  maxHp?: number;
  atk?: number;
  small?: boolean;
  states?: CardState[];
  /** 場のカードの持ち主: 自分（true）は攻撃力・HP を上、コスト・クールタイムを下に入れ替える。相手（false）は能力のアイコンを下に出す。 */
  mine?: boolean;
}) {
  const def = CARDS[card];
  const shownHp = hp ?? def.hp;
  const shownAtk = atk ?? def.atk;
  const states = statesProp ?? [];
  // 場のカードは、いまの状態（封印されたブロッカーは数えない）。手札・一覧は、カードの定義どおり
  const blocker = statesProp ? statesProp.includes('blocker') : !!def.ab.blocker;
  const cls = ['face', `is-${def.type}`];
  if (blocker) cls.push('is-blocker');
  if (mine === true) cls.push('is-flip');
  if (mine === false) cls.push('is-foe');
  if (small) cls.push('is-small');
  if (def.token) cls.push('is-token');
  return (
    <div className={cls.join(' ')}>
      <div className="face-body">
        <img className="face-art" src={cardArt(card, def.type)} alt="" draggable={false} />
        <span className="face-name">{def.name}</span>
      </div>
      {blocker ? (
        <span className="blocker-badge" aria-label="ブロッカー" title="ブロッカー">
          <svg viewBox="0 0 24 28" aria-hidden="true">
            <path d="M12 1.5 L22 5 V13 C22 19.5 17.5 24.5 12 26.5 C6.5 24.5 2 19.5 2 13 V5 Z" fill="url(#bb-grad)" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M12 5.5 V22 M6 11 H18" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
            <defs>
              <linearGradient id="bb-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#7fc0ff" />
                <stop offset="1" stopColor="#1f5fc4" />
              </linearGradient>
            </defs>
          </svg>
        </span>
      ) : null}
      {states.length > 0 ? (
        <span className="face-states">
          {states.filter((s) => s !== 'blocker').map((s) => (
            <span key={s} className={`state state-${s}`} aria-label={STATE_LABEL[s]} title={STATE_LABEL[s]}>
              <StateIcon state={s} />
            </span>
          ))}
        </span>
      ) : null}
      <span className="pip pip-summon" aria-label="召喚コスト">
        <PipBg kind="coin" />
        <i>{def.summon}</i>
      </span>
      {def.type === 'unit' ? (
        <span className="pip pip-cd" aria-label={`クールタイム ${def.cd / 1000} 秒`}>
          <PipBg kind="cd" />
          <i>{def.cd / 1000}</i>
        </span>
      ) : null}
      {def.type === 'unit' ? (
        <span className={`pip pip-atk${shownAtk > def.atk ? ' is-up' : ''}`} aria-label="攻撃力">
          <PipBg kind="atk" />
          <i>{shownAtk}</i>
        </span>
      ) : null}
      {def.type !== 'spell' ? (
        <span className={`pip pip-hp${shownHp < (maxHp ?? def.hp) ? ' is-hurt' : shownHp > def.hp ? ' is-up' : ''}`} aria-label="HP">
          <PipBg kind="hp" />
          <i>{shownHp}</i>
        </span>
      ) : null}
    </div>
  );
}

function StateIcon({ state }: { state: CardState }) {
  if (state === 'blocker') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 L19.5 5.8 V11.5 C19.5 16.2 16.3 19.5 12 21 C7.7 19.5 4.5 16.2 4.5 11.5 V5.8 Z" fill="#fff" />
      </svg>
    );
  }
  if (state === 'barrier') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill="none" stroke="#fff" strokeWidth="2.6" />
        <path d="M8.5 10.5 A4 4 0 0 1 12 8" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (state === 'stealth') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2.5 12 C5.5 7 9 5.5 12 5.5 C15 5.5 18.5 7 21.5 12 C18.5 17 15 18.5 12 18.5 C9 18.5 5.5 17 2.5 12 Z" fill="none" stroke="#fff" strokeWidth="2.2" />
        <circle cx="12" cy="12" r="2.8" fill="#fff" />
        <path d="M4 20 L20 4" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (state === 'seal') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill="none" stroke="#fff" strokeWidth="2.4" />
        <path d="M6.5 6.5 L17.5 17.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (state === 'poison') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 C12 3 5 11 5 15 A7 7 0 0 0 19 15 C19 11 12 3 12 3 Z" fill="#fff" />
        <circle cx="9.5" cy="15.5" r="1.6" fill="#7a2fb0" />
        <circle cx="14.5" cy="15.5" r="1.6" fill="#7a2fb0" />
      </svg>
    );
  }
  if (state === 'disarm') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19 L16 8 M14 6 L18 10" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M4 4 L20 20" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="9" width="8" height="6" rx="3" fill="none" stroke="#fff" strokeWidth="2.4" />
      <rect x="13" y="9" width="8" height="6" rx="3" fill="none" stroke="#fff" strokeWidth="2.4" />
      <path d="M9 12 H15" stroke="#fff" strokeWidth="2.4" />
    </svg>
  );
}

import coinUrl from '../assets/art/ui/pip-coin.webp';
import atkUrl from '../assets/art/ui/pip-atk.webp';
import hpUrl from '../assets/art/ui/pip-hp.webp';
import cdUrl from '../assets/art/ui/pip-cd.webp';

const PIP_URL = { coin: coinUrl, atk: atkUrl, hp: hpUrl, cd: cdUrl };

/** 四隅の数字の台（ChatGPT 製: 金貨・赤い宝石・緑のハート・青い時計の台）。数字は上に HTML で重ねる。 */
function PipBg({ kind }: { kind: 'coin' | 'atk' | 'hp' | 'cd' }) {
  return <img className="pip-bg" src={PIP_URL[kind]} alt="" draggable={false} />;
}
