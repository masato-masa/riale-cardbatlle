import { abilityLines, CARDS, TYPE_NAME, usageNote, WALL_TEXT, type CardId } from '@/game/cards';
import { PLAYER_ATK, PLAYER_HP } from '@/game/rules';

import { CardFace } from './CardFace';

export function HeroBadge({ hp, label, walled, portrait }: { hp: number; label: string; walled: boolean; portrait: string }) {
  const ratio = hp / PLAYER_HP;
  return (
    <span className={`hero-badge${ratio <= 0.3 ? ' is-low' : ''}`}>
      <span className="hero-portrait" aria-hidden="true">
        <img src={portrait} alt="" draggable={false} />
      </span>
      <span className="hero-label">{label}</span>
      {PLAYER_ATK > 0 ? (
        <span className="hero-atk" aria-label={`攻撃力 ${PLAYER_ATK}（攻撃されたら反撃する）`}>
          {PLAYER_ATK}
        </span>
      ) : null}
      <span className="hero-hp">
        <HeartMark />
        <b>{hp}</b>
      </span>
      {walled ? (
        <span className="hero-wall" title={WALL_TEXT}>
          壁
        </span>
      ) : null}
      <span className="hero-bar" aria-hidden="true">
        <i style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} />
      </span>
    </span>
  );
}

export function CardDetail({ card, hp }: { card: CardId; hp?: number }) {
  const def = CARDS[card];
  return (
    <div className="card-detail">
      {def.epithet ? <p className="card-epithet">{def.epithet}</p> : null}
      <div className="card-detail-face">
        <CardFace card={card} hp={hp} />
      </div>
      <dl className="card-detail-stats">
        <dt>種類</dt>
        <dd>{TYPE_NAME[def.type]}</dd>
        <dt>召喚コスト</dt>
        <dd>{def.summon}</dd>
        {def.type === 'unit' ? (
          <>
            <dt>攻撃力</dt>
            <dd>{def.atk}</dd>
            <dt>クールタイム</dt>
            <dd>{def.cd / 1000} 秒</dd>
          </>
        ) : null}
        {def.type !== 'spell' ? (
          <>
            <dt>HP</dt>
            <dd>{hp !== undefined && hp < def.hp ? `${hp} / ${def.hp}` : def.hp}</dd>
          </>
        ) : null}
      </dl>
      {abilityLines(card).map((line) => (
        <p key={line} className="card-detail-text">
          {line}
        </p>
      ))}
      {abilityLines(card).length === 0 ? <p className="card-detail-text">能力なし</p> : null}
      {usageNote(card) ? <p className="card-detail-note">{usageNote(card)}</p> : null}
      {def.flavor ? <p className="card-flavor">「{def.flavor}」</p> : null}
    </div>
  );
}

export function HelpBody() {
  return (
    <ul className="help-list">
      <li>コインは時間でたまります（最大 10）。最後の 1 分は 2 倍速。</li>
      <li>手札を自分の場へドラッグすると召喚。自分のカードの上に重ねると上書きします。左上の数字が召喚コストです。</li>
      <li>場のカードを相手のカードか相手のプレイヤーへドラッグすると攻撃。右上の数字がクールタイム（秒）で、明けるとまた攻撃できます。</li>
      <li>クールタイム中に相手を選ぶと予約になり、明けた瞬間に攻撃します。攻撃は少し溜めてから当たります。</li>
      <li>カード同士はお互いにダメージを受けます。左下が攻撃力、右下が HP。（プレイヤーは今は反撃しません）</li>
      <li>盾のマークはブロッカー。相手にブロッカーがいる間は、ブロッカーしか狙えません。</li>
      <li>{WALL_TEXT}。</li>
      <li>カードの上端の 2 文字は能力。「狙撃」「足止」は相手のカードの上へドラッグして召喚します。</li>
      <li>相手の HP を 0 にしたら勝ち。3 分たったら HP の多い方の勝ちです。</li>
      <li>カードをタップすると説明が出ます（相手のカードも）。</li>
    </ul>
  );
}

export function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5 L8 12 L15 19" />
    </svg>
  );
}

function HeartMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.5 C5 15.5 2.5 12 2.5 8.5 C2.5 5.6 4.8 3.5 7.5 3.5 C9.4 3.5 11 4.6 12 6.2 C13 4.6 14.6 3.5 16.5 3.5 C19.2 3.5 21.5 5.6 21.5 8.5 C21.5 12 19 15.5 12 20.5 Z"
        fill="#e5484d"
        stroke="#0b1520"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
