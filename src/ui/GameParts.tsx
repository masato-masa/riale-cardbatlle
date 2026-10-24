import { abilityLines, CARDS, KEYWORDS, STATUS_NOTES, TYPE_NAME, usageNote, WALL_TEXT, type CardId } from '@/game/cards';
import { PLAYER_ATK, PLAYER_HP } from '@/game/rules';

import { cardArt } from './art';
import { CardFace } from './CardFace';

/** 説明の中のキーワード（基本能力・状態の名前）と、時機の見出し（登場時・攻撃時・N 秒ごと など、「：」の前）を黄色にする。 */
function highlight(line: string): React.ReactNode[] {
  const re = new RegExp(`(${KEYWORDS.join('|')})`, 'g');
  const colon = line.indexOf('：');
  const head = colon > 0 && colon <= 14 ? line.slice(0, colon) : '';
  const rest = head ? line.slice(colon) : line;
  const body = rest.split(re).map((part, i) => (KEYWORDS.includes(part) ? <b key={i} className="kw">{part}</b> : part));
  return head ? [<b key="t" className="kw">{head}</b>, ...body] : body;
}

export function HeroBadge({ hp, label, portrait }: { hp: number; label: string; portrait: string }) {
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
      {/* クラロワの説明画面のように、カードの絵を大きく見せる帯（上を中心に切り抜き、下はシートの地へ溶かす） */}
      <div className="card-hero" aria-hidden="true">
        <img src={cardArt(card, def.type)} alt="" draggable={false} />
      </div>
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
          {highlight(line)}
        </p>
      ))}
      {abilityLines(card).length === 0 ? <p className="card-detail-text">能力なし</p> : null}
      {usageNote(card) ? <p className="card-detail-note">{usageNote(card)}</p> : null}
      {STATUS_NOTES.filter((n) => abilityLines(card).join('').includes(n.slice(0, n.indexOf(':')))).map((n) => (
        <p key={n} className="card-detail-note">
          {n}
        </p>
      ))}
      {def.flavor ? <p className="card-flavor">「{def.flavor}」</p> : null}
    </div>
  );
}

export function HelpBody() {
  return (
    <ul className="help-list">
      <li>コインは時間でたまります（最大 10）。残り 2 分からは、ユニットのクールタイムが 2 倍の速さで減ります。</li>
      <li>手札を自分の場へドラッグすると召喚。自分のカードの上に重ねると入れ替わります（チェンジ）。左上の数字が召喚コストです。</li>
      <li>場のカードを相手のカードか相手のプレイヤーへドラッグすると攻撃。カードに重なる時計の輪と数字がクールタイム（残り秒）で、明けるとまた攻撃できます。</li>
      <li>カードは、場へ置いてから 0.5 秒後に登場します（半透明のカードが濃くなります）。攻撃の溜め（1 秒）より短いので、相手が攻撃を溜め始めたのを見てからブロッカーを出しても割り込めます。</li>
      <li>クールタイム中に相手を選ぶと予約になり、明けた瞬間に攻撃します。攻撃は少し溜めてから当たります。</li>
      <li>カード同士はお互いにダメージを受けます。赤い宝石が攻撃力、緑のハートが HP（自分の場のカードは上側に出ます）。プレイヤーは反撃しません。</li>
      <li>盾のマークはブロッカー。相手にブロッカーがいる間は、ブロッカーしか攻撃できません。ほかの相手は予約しておけば、ブロッカーがいなくなるまで待機して、狙えた瞬間に攻撃します。</li>
      <li>{WALL_TEXT}。</li>
      <li>能力は、カードをタップすると説明が出ます（相手のカードも）。登場時に相手や味方を選ぶカードは、置いたあとに対象をタップします。</li>
      <li>場のカードの上端のアイコン: 盾=ブロッカー、丸=結界、目=ステルス、鎖=遅延（足止め中）、しずく=毒、斜線の丸=封印、折れた剣=攻撃不能。</li>
      <li>毒を受けたカードは、攻撃するたびに毒の数だけダメージを受けます。封印されると能力が使えません。</li>
      <li>妨害: 攻撃は溜めの間に中断できます。相手が攻撃を溜めているとき（線の真ん中に「！」）にブロッカーを出す、壁を完成させる、狙われたカードをチェンジで入れ替える、のどれでも攻撃は止まり、妨害された攻撃元はクールタイムが 5 秒増えます。「パリィ」の呪文でも弾けます。</li>
      <li>チェンジ: 自分のカードの上に召喚すると入れ替わります。場を離れるカードの「生贄時」の能力が起きます。</li>
      <li>相手の HP を 0 にしたら勝ち。4 分たったら HP の多い方の勝ちです。</li>
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
