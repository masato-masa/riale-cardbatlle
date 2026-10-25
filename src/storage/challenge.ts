// きょうのチャレンジ。日付で決まる相手 1 人に「つよい」で挑み、その日初めて勝つと宝箱ポイント（宝箱 1 つぶん、collection.ts の CHEST_GAIN.challenge）。
// クラロワの日替わりのチャレンジと同じく、毎日開く理由にする。煽らないよう、取り逃しの罰も期限の強調もしない。

import { RIVAL_DECKS } from '@/game/cards';

import { dateKey } from './daily';

const KEY = 'riale-cardbatlle:challenge';

/** その日の相手デッキの名前（日付から決まる）。 */
export function challengeFor(day = dateKey()): string {
  let h = 2166136261;
  for (const ch of `challenge:${day}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return RIVAL_DECKS[h % RIVAL_DECKS.length]!.name;
}

/** その日のチャレンジに、もう勝ったか。 */
export function isChallengeCleared(day = dateKey()): boolean {
  try {
    return localStorage.getItem(KEY) === day;
  } catch {
    return false;
  }
}

/** 勝ちを記録する。その日初めてなら true（ごほうびを渡す）。 */
export function clearChallenge(day = dateKey()): boolean {
  if (isChallengeCleared(day)) return false;
  try {
    localStorage.setItem(KEY, day);
  } catch {
    // 保存できなくても、この場のごほうびは渡す
  }
  return true;
}
