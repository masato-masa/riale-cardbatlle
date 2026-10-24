// 画面の大きさごとのはみ出しの点検（ホーム・デッキ・対戦）。中身が画面より高い／広い、要素が右にはみ出す、を数える。
// 使い方（dev サーバーを起動してから）:
//   playwright-cli open
//   playwright-cli run-code --filename=scripts/audit-layout.js
//   playwright-cli close
// URL を変えるときは BASE を書き換える（公開版でも可）。
async (page) => {
  const BASE = 'http://localhost:5190/riale-cardbatlle/?mute';
  const SIZES = [
    [320, 568],
    [375, 667],
    [375, 812],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1280, 800],
  ];
  const measure = () =>
    page.evaluate(() => {
      const iw = innerWidth;
      const ih = innerHeight;
      const root = document.querySelector('#root > *');
      const over = [...document.querySelectorAll('#root *')].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.right > iw + 1 && getComputedStyle(e).position !== 'fixed';
      }).length;
      return { tall: (root?.scrollHeight ?? 0) > ih + 1, wide: document.documentElement.scrollWidth > iw + 1, over };
    });
  const out = [];
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(BASE);
    await page.evaluate(() => {
      localStorage.setItem('riale-cardbatlle:tutorial', '1');
      localStorage.setItem('riale-cardbatlle:tips', JSON.stringify(['interrupt', 'overwrite', 'reserve']));
      // 戦績のシートが中身を出すよう、対戦の記録を入れておく
      const rivals = ['毒', '巨人', '連撃', '割り込み'];
      localStorage.setItem('riale-cardbatlle:history', JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ result: i % 3 ? 'win' : 'lose', level: 'normal', rival: rivals[i % 4], played: { guard: 2, knight: 1, herald: 3 }, sec: 150 }))));
    });
    await page.reload();
    await page.waitForTimeout(1000);
    const home = await measure();
    // ホームのシート（トロフィーロード・チャレンジ・設定）: 中身がシートの枠の外に出ていないか
    const sheetBad = [];
    for (const [label, open] of [
      ['ロード', () => page.locator('button.ts-arena-name').click({ force: true, timeout: 5000 })],
      ['チャレンジ', () => page.locator('.ts-chal').click({ force: true, timeout: 5000 })],
      ['設定', () => page.getByText('設定', { exact: true }).last().click({ force: true, timeout: 5000 })],
      ['ミッション', () => page.locator('.ts-daily').first().click({ force: true, timeout: 5000 })],
      ['戦績', () => page.getByText('戦績', { exact: true }).first().click({ force: true, timeout: 5000 })],
    ]) {
      await open();
      await page.waitForTimeout(700);
      const n = await page.evaluate(() => {
        const s = document.querySelector('.sheet')?.getBoundingClientRect();
        if (!s) return -1;
        const below = [...document.querySelectorAll('.sheet > *')].filter((c) => c.getBoundingClientRect().bottom > s.bottom + 1).length;
        // 横にはみ出す要素と、シートより大きく広がった要素（入れ物の無いカードの面など）
        const wide = [...document.querySelectorAll('.sheet *')].filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && (r.right > s.right + 1 || r.width > s.width + 1);
        }).length;
        return below + wide;
      });
      if (n !== 0) sheetBad.push(`${label}${n}`);
      await page.keyboard.press('Escape');
      await page.mouse.click(5, 5);
      await page.waitForTimeout(500);
    }
    await page.getByText('デッキ', { exact: true }).last().click({ force: true, timeout: 5000 });
    await page.waitForTimeout(1000);
    const deck = await measure();
    // デッキの 1 枚目の説明のシート: 中身（ボタン）がシートの枠の外に出ていないか
    await page.locator('.deck-box .deck-card').first().click({ force: true, timeout: 5000 });
    await page.waitForTimeout(700);
    const sheetOver = await page.evaluate(() => {
      const s = document.querySelector('.sheet')?.getBoundingClientRect();
      if (!s) return -1;
      return [...document.querySelectorAll('.sheet > *')].filter((c) => c.getBoundingClientRect().bottom > s.bottom + 1).length;
    });
    await page.goto(BASE);
    await page.waitForTimeout(1000);
    await page.getByText('バトル！', { exact: true }).click({ force: true, timeout: 5000 });
    await page.waitForTimeout(4000);
    const battle = await measure();
    // 対戦中のシート（一時停止・あそびかた）
    const inBad = [];
    const over = () =>
      page.evaluate(() => {
        const s = document.querySelector('.sheet')?.getBoundingClientRect();
        if (!s) return -1;
        return [...document.querySelectorAll('.sheet > *')].filter((c) => c.getBoundingClientRect().bottom > s.bottom + 1).length;
      });
    await page.locator('[aria-label="メニュー"]').click({ force: true, timeout: 5000 });
    await page.waitForTimeout(600);
    if ((await over()) !== 0) inBad.push('一時停止');
    await page.getByText('あそびかた', { exact: true }).click({ force: true, timeout: 5000 });
    await page.waitForTimeout(600);
    if ((await over()) !== 0) inBad.push('あそびかた');
    // 結果画面: もう一度・ホームへのボタンが、スクロールせずに画面内に見えるか
    await page.goto(BASE + '&result=win');
    await page.waitForTimeout(900);
    await page.getByText('バトル！', { exact: true }).click({ force: true, timeout: 5000 });
    await page.waitForTimeout(6000);
    await page.mouse.click(w / 2, 200);
    await page.waitForTimeout(900);
    const resultOk = await page.evaluate(() => (document.querySelector('.result-buttons')?.getBoundingClientRect().bottom ?? 1e9) <= innerHeight + 1);
    const fmt = (m) => (m.tall || m.wide || m.over ? `NG(高さ${m.tall ? '×' : '○'} 幅${m.wide ? '×' : '○'} はみ出し${m.over})` : 'OK');
    // デッキ画面は縦にスクロールする画面なので、高さは見ない
    out.push(`${w}×${h}: ホーム ${fmt(home)} / ホームのシート ${sheetBad.length ? `NG(${sheetBad.join(',')})` : 'OK'} / デッキ ${fmt({ ...deck, tall: false })} / 説明シート ${sheetOver === 0 ? 'OK' : `NG(${sheetOver})`} / 対戦 ${fmt(battle)} / 対戦のシート ${inBad.length ? `NG(${inBad.join(',')})` : 'OK'} / 結果のボタン ${resultOk ? 'OK' : 'NG'}`);
  }
  return out.join('\n');
}
