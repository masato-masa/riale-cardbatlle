// 効果ごとに、持っているカードを一覧にして docs/effects.md を作る。使い方: npx tsx scripts/list-effects.ts
import { writeFileSync } from 'node:fs';

import { abilityLines, CARDS, type CardId } from '../src/game/cards';

const ids = (Object.keys(CARDS) as CardId[]).filter((i) => !CARDS[i].token);
const name = (i: CardId) => `${CARDS[i].name}(${CARDS[i].summon})`;

type Group = { title: string; note: string; pick: (i: CardId) => boolean };
const ab = (i: CardId) => CARDS[i].ab;
const sk = (i: CardId) => ab(i).onSummon?.kind;

/** 1. 基本能力: 名前だけで効果が分かる、一般的な能力。 */
const basic: Group[] = [
  { title: '速攻', note: '召喚してすぐ攻撃できる', pick: (i) => !!ab(i).haste },
  { title: 'ブロッカー', note: '相手はブロッカーしか攻撃できない（妨害の主役）', pick: (i) => !!ab(i).blocker },
  { title: '結界', note: '最初に受けるダメージを 0 にする', pick: (i) => !!ab(i).barrier },
  { title: 'ステルス', note: '自分で攻撃するまで選ばれず、場にいない扱い（壁に数えない）', pick: (i) => !!ab(i).stealth },
  { title: '狙い撃ち', note: 'ブロッカー・壁を無視して攻撃', pick: (i) => !!ab(i).freeAim },
  { title: '連撃', note: '1 回のクールタイムで 2 回攻撃', pick: (i) => !!ab(i).doubleStrike },
  { title: '遠隔', note: '攻撃時に反撃を受けない', pick: (i) => !!ab(i).ranged },
  { title: '吸血', note: '与えたダメージぶん自分の HP を回復', pick: (i) => !!ab(i).lifesteal },
  { title: '鉄壁', note: '受けるダメージ -N', pick: (i) => !!ab(i).armor },
];

/** 2. 時機能力: 「いつ」起きるか＋何が起きるか。 */
const timing: Group[] = [
  { title: '場にいる間（常在）', note: '場にいる間ずっと効く（鼓舞・コイン加速・クールタイム短縮）', pick: (i) => !!ab(i).rally || !!ab(i).coinBoost || !!ab(i).cooldownCut },
  { title: 'N 秒ごと（定期）', note: '建築物が一定時間ごとに起こす', pick: (i) => !!ab(i).pulse },
  { title: '登場時', note: '召喚したときに起きる（敵や味方を選ぶものを含む）', pick: (i) => !!ab(i).onSummon },
  { title: '攻撃時', note: '攻撃したときに起きる（薙ぎ払い・毒の牙・追加ダメージなど）', pick: (i) => !!ab(i).splash || !!ab(i).venom || !!ab(i).unitBonus || !!ab(i).faceBonus },
  { title: '討伐時', note: '自分の攻撃で敵ユニットを倒したとき', pick: (i) => !!ab(i).onKill },
  { title: '死亡時', note: '倒されたときに起きる', pick: (i) => !!ab(i).onDeath },
  { title: '生贄時', note: 'チェンジで入れ替わって場を離れるとき', pick: (i) => !!ab(i).onReplaced },
  { title: 'チェンジ登場時', note: '自分のカードの上に召喚したとき', pick: (i) => !!ab(i).onOverwrite },
  { title: '妨害時', note: '自分が（ブロッカー・かわして）相手の攻撃を妨害したとき', pick: (i) => !!ab(i).onInterrupt },
];

/** 3. そのほか: 「されたとき」系など、いまは時機に入れないもの。 */
const other: Group[] = [
  { title: '妨害耐性', note: '妨害されても、クールタイムが増えない', pick: (i) => !!ab(i).interfereImmune },
  { title: '妨害された時', note: '自分の攻撃が妨害されたとき', pick: (i) => !!ab(i).onCancelled },
];

/** 状態（能力ではない）。能力で自分や相手に付与する。 */
const states: Group[] = [
  { title: '攻撃不能', note: '攻撃できない。最初から持つ（モルド）／能力・呪文で相手に付与', pick: (i) => !!ab(i).cannotAttack || sk(i) === 'disarm' },
  { title: '毒', note: '攻撃するたびに N ダメージを受ける。能力・呪文・建築物で相手に付与', pick: (i) => !!ab(i).venom || sk(i) === 'poison' || ab(i).onDeath?.kind === 'poisonFoes' || ab(i).pulse?.kind === 'poison' || ab(i).spell?.kind === 'poisonAll' },
  { title: '封印', note: '能力がすべて無効になる。能力・呪文で相手に付与', pick: (i) => sk(i) === 'seal' || ab(i).spell?.kind === 'sealAll' },
];

const sections: { title: string; groups: Group[] }[] = [
  { title: '1. 基本能力', groups: basic },
  { title: '2. 時機能力', groups: timing },
  { title: '3. そのほかの能力', groups: other },
  { title: '4. 状態（能力ではない）', groups: states },
];

let md = `# 効果の一覧（自動生成: npx tsx scripts/list-effects.ts）

カード名の（）はコスト。説明では、基本能力と状態の名前を黄色で表示する。

| 分類 | 効果 | 内容 | 枚数 |
|---|---|---|---|
`;
for (const sec of sections) for (const g of sec.groups) md += `| ${sec.title} | ${g.title} | ${g.note} | ${ids.filter(g.pick).length} |\n`;
md += '\n';
for (const sec of sections) {
  md += `# ${sec.title}\n\n`;
  for (const g of sec.groups) {
    const list = ids.filter(g.pick);
    md += `## ${g.title}（${list.length}）\n${g.note}\n\n`;
    for (const i of list) md += `- ${name(i)}: ${abilityLines(i).join(' / ')}\n`;
    md += '\n';
  }
}
const spells = ids.filter((i) => CARDS[i].type === 'spell');
md += `# 呪文（${spells.length}）\n\n${spells.map(name).join('、')}\n\n`;
const none = ids.filter((i) => CARDS[i].type === 'unit' && abilityLines(i).length === 0);
md += `# 能力なし（基礎スタッツ）（${none.length}）\n\n${none.map(name).join('、')}\n`;
writeFileSync('docs/effects.md', md);
console.log(md.split('\n# 1.')[0]);
