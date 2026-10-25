import { memo } from 'react';

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

/** カードの面。左上 召喚コスト・左下 攻撃力（赤）・右下 HP（緑）。クールタイムは面に出さない（説明で見る。ユーザー指定 2026-10-25）。
 *  建築物は攻撃力とクールタイムが無く（石の枠）、呪文は召喚コストだけ（紫の枠）。
 *  能力の文字は面に書かない（長押しの説明で見る）。場のカードだけ、上端に状態のアイコンを並べる。
 *  hp・atk を渡すと場のカードとして、減った HP を赤、上がった攻撃力を金の縁で出す。 */
function CardFaceView({
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
  /** 場のカード（登場待ちの表示も同じ）の持ち主。場に出たカードは召喚コストとクールタイムの台座を出さない（クールタイムは輪で見せる）。自分（true）は攻撃力・HP を上、コスト・クールタイムを下に入れ替える。相手（false）は能力のアイコンを下に出す。 */
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
          <img src={STATE_ICON.blocker} alt="" draggable={false} />
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
      {mine === undefined ? (
        <span className="pip pip-summon" aria-label="召喚コスト">
          <PipBg kind="coin" />
          <i>{def.summon}</i>
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

type CardFaceProps = Parameters<typeof CardFaceView>[0];

/** 対戦中は毎フレーム親が描き直すので、中身が同じカードは描き直さない（状態の配列は中身で比べる）。 */
export const CardFace = memo(CardFaceView, (a: CardFaceProps, b: CardFaceProps) => {
  if (a.card !== b.card || a.hp !== b.hp || a.maxHp !== b.maxHp || a.atk !== b.atk || a.small !== b.small || a.mine !== b.mine) return false;
  if ((a.states === undefined) !== (b.states === undefined)) return false;
  const x = a.states ?? [];
  const y = b.states ?? [];
  return x.length === y.length && x.every((v, i) => v === y[i]);
});

/** 状態のアイコン（ChatGPT で作成。scripts/slice-icons.mjs の states-sheet）。 */
function StateIcon({ state }: { state: CardState }) {
  return <img src={STATE_ICON[state]} alt="" draggable={false} />;
}

import stateBarrierUrl from '../assets/art/ui/state-barrier.webp';
import stateBlockerUrl from '../assets/art/ui/state-blocker.webp';
import stateDisarmUrl from '../assets/art/ui/state-disarm.webp';
import statePoisonUrl from '../assets/art/ui/state-poison.webp';
import stateSealUrl from '../assets/art/ui/state-seal.webp';
import stateStealthUrl from '../assets/art/ui/state-stealth.webp';
import stateStunUrl from '../assets/art/ui/state-stun.webp';
import coinUrl from '../assets/art/ui/pip-coin.webp';

const STATE_ICON: Record<CardState, string> = {
  blocker: stateBlockerUrl,
  barrier: stateBarrierUrl,
  stealth: stateStealthUrl,
  stun: stateStunUrl,
  seal: stateSealUrl,
  poison: statePoisonUrl,
  disarm: stateDisarmUrl,
};
import atkUrl from '../assets/art/ui/pip-atk.webp';
import hpUrl from '../assets/art/ui/pip-hp.webp';
import cdUrl from '../assets/art/ui/pip-cd.webp';

const PIP_URL = { coin: coinUrl, atk: atkUrl, hp: hpUrl, cd: cdUrl };

/** 四隅の数字の台（ChatGPT 製: 金貨・赤い宝石・緑のハート・青い時計の台）。数字は上に HTML で重ねる。 */
function PipBg({ kind }: { kind: 'coin' | 'atk' | 'hp' | 'cd' }) {
  return <img className="pip-bg" src={PIP_URL[kind]} alt="" draggable={false} />;
}
