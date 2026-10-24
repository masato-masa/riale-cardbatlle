// 試合後の振り返り。1 試合の記録から、次に活かせる一言を選ぶ（負け・引き分けは直す点、勝ちは良かった点）。

export interface MatchLog {
  won: boolean;
  /** コインが上限で止まっていた時間（ms）。 */
  coinCapMs: number;
  /** 試合の長さ（ms）。 */
  matchMs: number;
  /** 自分の攻撃が、相手のブロッカー・壁に割り込まれた回数。 */
  myAttacksBlocked: number;
  /** 相手の攻撃に割り込んだ回数。 */
  interrupts: number;
  /** 相手の攻撃の溜めが始まったとき、出せるブロッカーが手札にあった回数（割り込みの機会）。 */
  interruptChances: number;
  /** 自分（プレイヤー）が受けたダメージ。 */
  faceTaken: number;
  /** 相手（プレイヤー）に与えたダメージ。 */
  faceDealt: number;
  /** 予約した回数。 */
  reserves: number;
}

export interface Hint {
  id: string;
  text: string;
}

/** 当てはまる一言を、大事な順に最大 2 つ。 */
export function hintsFor(log: MatchLog): Hint[] {
  const out: Hint[] = [];
  const capRate = log.matchMs > 0 ? log.coinCapMs / log.matchMs : 0;
  if (!log.won) {
    if (capRate >= 0.12)
      out.push({ id: 'coins', text: `コインが上限で止まっていた時間が ${Math.round(log.coinCapMs / 1000)} 秒ありました。たまったら早めにカードを出しましょう。` });
    if (log.interruptChances >= 2 && log.interrupts === 0)
      out.push({ id: 'interrupt', text: '相手が攻撃を溜めている間に、手札のブロッカーを出せば割り込んで止められる場面がありました。' });
    if (log.myAttacksBlocked >= 3)
      out.push({ id: 'blocked', text: `自分の攻撃が ${log.myAttacksBlocked} 回割り込まれました。相手のコインと手札に注意し、ブロッカーを先に倒しましょう。` });
    if (log.faceTaken >= 14 && log.faceDealt < log.faceTaken / 2)
      out.push({ id: 'defend', text: 'プレイヤーへのダメージを多く受けました。ブロッカーや壁で守りを固めましょう。' });
    if (log.reserves === 0)
      out.push({ id: 'reserve', text: 'クールタイム中のカードも、相手へドラッグしておくと予約になり、明けた瞬間に攻撃します。' });
    if (out.length === 0) out.push({ id: 'close', text: 'あと一歩でした。相手の攻撃の溜め（線の「！」）を見て、割り込みを狙いましょう。' });
  } else {
    if (log.interrupts >= 2) out.push({ id: 'good-interrupt', text: `割り込みを ${log.interrupts} 回成功させました。読み合いの勝ちです。` });
    if (capRate < 0.05) out.push({ id: 'good-coins', text: 'コインをむだなく使えていました。' });
    if (out.length === 0) out.push({ id: 'good', text: 'いい試合でした。次はもっと強い相手に挑戦してみましょう。' });
  }
  return out.slice(0, 2);
}
