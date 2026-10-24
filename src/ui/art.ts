import type { CardId } from '@/game/cards';

import fieldUrl from '@/assets/art/arena.webp';
import arena2Url from '@/assets/art/arena-2.webp';
import arena3Url from '@/assets/art/arena-3.webp';
import arena4Url from '@/assets/art/arena-4.webp';
import arena5Url from '@/assets/art/arena-5.webp';
import chestClosedUrl from '@/assets/art/ui/chest-closed.webp';
import coinUrl from '@/assets/art/ui/coin.webp';
import deckBgUrl from '@/assets/art/deck-bg.webp';
import heroFoeUrl from '@/assets/art/ui/hero-foe.webp';
import heroMeUrl from '@/assets/art/ui/hero-me.webp';
import iconArenaUrl from '@/assets/art/ui/icon-arena.webp';
import iconMissionUrl from '@/assets/art/ui/icon-mission.webp';
import iconStatsUrl from '@/assets/art/ui/icon-stats.webp';
import iconTrophyUrl from '@/assets/art/ui/icon-trophy.webp';
import ribbonLoseUrl from '@/assets/art/ui/ribbon-lose.webp';
import ribbonWinUrl from '@/assets/art/ui/ribbon-win.webp';
import starOffUrl from '@/assets/art/ui/star-off.webp';
import starOnUrl from '@/assets/art/ui/star-on.webp';

/** 盤面の地（ChatGPT で作成。赤い敵陣・青い自陣・金の帯。scripts/slice-arena.mjs）。 */
export const FIELD_URL: string = fieldUrl;
/** アリーナごとの盤面の地（床だけ差し替え。scripts/build-arena-floors.mjs）。添字はアリーナの番号。 */
export const ARENA_FLOOR_URLS: string[] = [fieldUrl, arena2Url, arena3Url, arena4Url, arena5Url];
export const COIN_URL: string = coinUrl;
export const CHEST_URL: string = chestClosedUrl;
/** ホームの UI アイコン（ChatGPT で作成。scripts/slice-icons.mjs）。 */
/** 結果画面の星とリボン（ChatGPT で作成。scripts/slice-result.mjs）。 */
export const RESULT_ART = { starOn: starOnUrl, starOff: starOffUrl, ribbonWin: ribbonWinUrl, ribbonLose: ribbonLoseUrl };
export const ICON_URL = { trophy: iconTrophyUrl, mission: iconMissionUrl, stats: iconStatsUrl, arena: iconArenaUrl };
/** デッキ編成画面の背景（軍の作戦室。ChatGPT で作成。scripts/slice-arena.mjs の deck-bg と同じ要領）。 */
export const DECK_BG_URL: string = deckBgUrl;
/** プレイヤーの肖像（ChatGPT で作成。scripts/slice-portraits.mjs で切り出し）。 */
export const HERO_ME_URL: string = heroMeUrl;
export const HERO_FOE_URL: string = heroFoeUrl;

/** カードの絵（ChatGPT で作成。scripts/slice-cards.mjs で切り出し）。枠いっぱいに cover で敷く。
 *  ファイル名がそのままカードの ID（cards/ buildings/ spells/ の下の <id>.webp）。志願兵だけは clerk.webp。
 *  絵がまだ無いカードは、種類ごとの仮の絵で出す。 */
const artFiles = import.meta.glob('../assets/art/{cards,buildings,spells}/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const byName = new Map<string, string>();
for (const [path, url] of Object.entries(artFiles)) byName.set(path.split('/').pop()!.replace(/\.webp$/, ''), url);
const ALIAS: Partial<Record<CardId, string>> = { apprentice: 'clerk' };

export function cardArt(card: CardId, type: 'unit' | 'building' | 'spell'): string {
  const own = byName.get(ALIAS[card] ?? card);
  if (own) return own;
  return byName.get(type === 'building' ? 'wall' : type === 'spell' ? 'quarry' : 'guard')!;
}

const fxFiles = import.meta.glob('../assets/art/{fx,ui}/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** 演出の素材（斬撃・爆発・毒・割り込みなど）を先に読み込む。初めて出る瞬間に絵が遅れて現れないようにする。 */
export function preloadFx(): void {
  for (const url of Object.values(fxFiles)) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }
}
