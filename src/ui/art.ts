import type { CardId } from '@/game/cards';

import wallUrl from '@/assets/art/buildings/wall.webp';
import exchangeUrl from '@/assets/art/buildings/exchange.webp';
import tradingHouseUrl from '@/assets/art/buildings/tradingHouse.webp';
import factoryUrl from '@/assets/art/buildings/factory.webp';
import cathedralUrl from '@/assets/art/buildings/cathedral.webp';
import fortressUrl from '@/assets/art/buildings/fortress.webp';
import quarryUrl from '@/assets/art/buildings/quarry.webp';
import mineUrl from '@/assets/art/buildings/mine.webp';
import roadUrl from '@/assets/art/buildings/road.webp';
import fieldUrl from '@/assets/art/arena.webp';
import coinUrl from '@/assets/art/ui/coin.webp';
import heroFoeUrl from '@/assets/art/ui/hero-foe.webp';
import heroMeUrl from '@/assets/art/ui/hero-me.webp';
import bankerUrl from '@/assets/art/cards/banker.webp';
import clerkUrl from '@/assets/art/cards/clerk.webp';
import doubleUrl from '@/assets/art/cards/double.webp';
import festivalUrl from '@/assets/art/cards/festival.webp';
import informerUrl from '@/assets/art/cards/informer.webp';
import usurerUrl from '@/assets/art/cards/usurer.webp';
import architectUrl from '@/assets/art/cards/architect.webp';
import blockaderUrl from '@/assets/art/cards/blockader.webp';
import bossUrl from '@/assets/art/cards/boss.webp';
import craftsmanUrl from '@/assets/art/cards/craftsman.webp';
import guardUrl from '@/assets/art/cards/guard.webp';
import heraldUrl from '@/assets/art/cards/herald.webp';
import inspectorUrl from '@/assets/art/cards/inspector.webp';
import minerUrl from '@/assets/art/cards/miner.webp';
import spyUrl from '@/assets/art/cards/spy.webp';
import taxmanUrl from '@/assets/art/cards/taxman.webp';

/** 盤面の地（ChatGPT で作成。赤い敵陣・青い自陣・金の帯。scripts/slice-arena.mjs）。 */
export const FIELD_URL: string = fieldUrl;
export const COIN_URL: string = coinUrl;
/** プレイヤーの肖像（ChatGPT で作成。scripts/slice-portraits.mjs で切り出し）。 */
export const HERO_ME_URL: string = heroMeUrl;
export const HERO_FOE_URL: string = heroFoeUrl;

/** カードの絵（city-builders の人物）。枠いっぱいに cover で敷く。 */
export const CARD_ART: Record<CardId, string> = {
  herald: heraldUrl,
  miner: minerUrl,
  spy: spyUrl,
  guard: guardUrl,
  craftsman: craftsmanUrl,
  taxman: taxmanUrl,
  blockader: blockaderUrl,
  inspector: inspectorUrl,
  architect: architectUrl,
  boss: bossUrl,
  banker: bankerUrl,
  double: doubleUrl,
  informer: informerUrl,
  usurer: usurerUrl,
  // 見習い（能力で出てくるカード）は番頭の絵
  apprentice: clerkUrl,
  wall: wallUrl,
  exchange: exchangeUrl,
  tradingHouse: tradingHouseUrl,
  factory: factoryUrl,
  cathedral: cathedralUrl,
  fortress: fortressUrl,
  // 呪文はまだ専用の絵が無いので、近い建物の絵を仮に使う（落石＝石切場、地鳴り＝鉱山、通行止め＝街道）
  quarry: quarryUrl,
  quake: mineUrl,
  roadblock: roadUrl,
  festival: festivalUrl,
};
