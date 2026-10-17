import type { CardId } from '@/game/cards';

import fieldUrl from '@/assets/art/field.webp';
import coinUrl from '@/assets/art/ui/coin.webp';
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

/** 盤面の地（city-builders の絵）。 */
export const FIELD_URL: string = fieldUrl;
export const COIN_URL: string = coinUrl;

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
};
