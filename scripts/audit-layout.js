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
    ]) {
      await open();
      await page.waitForTimeout(700);
      const n = await page.evaluate(() => {
        const s = document.querySelector('.sheet')?.getBoundingClientRect();
        if (!s) return -1;
        return [...document.querySelectorAll('.sheet > *')].filter((c) => c.getBoundingClientRect().bottom > s.bottom + 1).length;
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
    const fmt = (m) => (m.tall || m.wide || m.over ? `NG(高さ${m.tall ? '×' : '○'} 幅${m.wide ? '×' : '○'} はみ出し${m.over})` : 'OK');
    // デッキ画面は縦にスクロールする画面なので、高さは見ない
    out.push(`${w}×${h}: ホーム ${fmt(home)} / ホームのシート ${sheetBad.length ? `NG(${sheetBad.join(',')})` : 'OK'} / デッキ ${fmt({ ...deck, tall: false })} / 説明シート ${sheetOver === 0 ? 'OK' : `NG(${sheetOver})`} / 対戦 ${fmt(battle)}`);
  }
  return out.join('\n');
}
