// 効果ごとに、持っているカードを一覧にして docs/effects.md を作る。使い方: npx tsx scripts/list-effects.ts
import { writeFileSync } from 'node:fs';

import { abilityLines, CARDS, type CardId } from '../src/game/cards';

const ids = (Object.keys(CARDS) as CardId[]).filter((i) => !CARDS[i].token);
const name = (i: CardId) => `${CARDS[i].name}(${CARDS[i].summon})`;

type Group = { title: string; note: string; pick: (i: CardId) => boolean };
const ab = (i: CardId) => CARDS[i].ab;
const groups: Group[] = [
  { title: '速攻', note: '召喚してすぐ攻撃できる', pick: (i) => !!ab(i).haste },
  { title: 'ブロッカー', note: '相手はブロッカーしか攻撃できない（妨害の主役）', pick: (i) => !!ab(i).blocker },
  { title: '結界', note: '最初に受けるダメージを 0 にする', pick: (i) => !!ab(i).barrier },
  { title: 'ステルス', note: '自分で攻撃するまで選ばれない', pick: (i) => !!ab(i).stealth },
  { title: '狙い撃ち', note: 'ブロッカー・壁を無視して攻撃', pick: (i) => !!ab(i).freeAim },
  { title: '連撃', note: '1 回のクールタイムで 2 回攻撃', pick: (i) => !!ab(i).doubleStrike },
  { title: '遠隔', note: '攻撃時に反撃を受けない', pick: (i) => !!ab(i).ranged },
  { title: '薙ぎ払い', note: '攻撃時にほかの敵カードにもダメージ', pick: (i) => !!ab(i).splash },
  { title: '吸血', note: '与えたダメージぶん自分の HP を回復', pick: (i) => !!ab(i).lifesteal },
  { title: '不屈', note: '最初に倒されるとき HP 1 で耐える', pick: (i) => !!ab(i).endure },
  { title: '鉄壁（軽減）', note: '受けるダメージ -N', pick: (i) => !!ab(i).armor },
  { title: '攻撃できない', note: '壁役', pick: (i) => !!ab(i).cannotAttack },
  { title: '攻撃時の追加効果', note: '毒の牙・対ユニット/対プレイヤーの追加ダメージ', pick: (i) => !!ab(i).venom || !!ab(i).unitBonus || !!ab(i).faceBonus },
  { title: '登場時効果', note: '召喚したときに起きる（敵や味方を選ぶものを含む）', pick: (i) => !!ab(i).onSummon },
  { title: '死亡時効果', note: '倒されたときに起きる', pick: (i) => !!ab(i).onDeath },
  { title: '討伐時効果', note: '自分の攻撃で敵ユニットを倒したとき', pick: (i) => !!ab(i).onKill },
  { title: '生贄時効果', note: 'チェンジで入れ替わって場を離れるとき', pick: (i) => !!ab(i).onReplaced },
  { title: 'チェンジ登場時効果', note: '自分のカードの上に召喚したとき', pick: (i) => !!ab(i).onOverwrite },
  { title: '妨害成功時効果', note: '自分が（ブロッカー・かわして）相手の攻撃を妨害したとき', pick: (i) => !!ab(i).onInterrupt },
  { title: '妨害された時効果', note: '自分の攻撃が妨害されたとき', pick: (i) => !!ab(i).onCancelled },
  { title: '妨害耐性', note: '妨害されてもクールタイムが増えない', pick: (i) => !!ab(i).interfereImmune },
  { title: '定期効果（建築物）', note: 'N 秒ごとに起きる', pick: (i) => !!ab(i).pulse },
  { title: '常在効果', note: '鼓舞・コイン加速・クールタイム短縮', pick: (i) => !!ab(i).rally || !!ab(i).coinBoost || !!ab(i).cooldownCut },
  { title: '呪文', note: '使い切り', pick: (i) => CARDS[i].type === 'spell' },
];

let md = '# 効果の一覧（自動生成: `npx tsx scripts/list-effects.ts`）\n\nカード名の（）はコスト。\n\n| 効果 | 内容 | 枚数 |\n|---|---|---|\n';
for (const g of groups) md += `| ${g.title} | ${g.note} | ${ids.filter(g.pick).length} |\n`;
md += '\n';
for (const g of groups) {
  const list = ids.filter(g.pick);
  md += `## ${g.title}（${list.length}）\n${g.note}\n\n`;
  for (const i of list) md += `- ${name(i)}: ${abilityLines(i).join(' / ')}\n`;
  md += '\n';
}
const none = ids.filter((i) => CARDS[i].type === 'unit' && abilityLines(i).length === 0);
md += `## 能力なし（基礎スタッツ）（${none.length}）\n\n${none.map(name).join('、')}\n`;
writeFileSync('docs/effects.md', md);
console.log(md.split('## ')[0]);
