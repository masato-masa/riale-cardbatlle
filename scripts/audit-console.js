// コンソールの点検: ホーム → デッキ → 対戦を 1 試合（8 倍速、自分も手札を出す）→ 結果 まで通し、
// エラー・警告・ページの例外・読み込みの失敗を集める。空なら OK。
// 使い方（dev サーバーを起動してから）:
//   playwright-cli open --mobile
//   playwright-cli run-code --filename=scripts/audit-console.js
//   playwright-cli close
// 公開版を見るときは BASE を書き換える。
async (page) => {
  const BASE = 'http://localhost:5190/riale-cardbatlle/?mute';
  const errs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errs.push(`${m.type()}: ${m.text().slice(0, 160)}`);
  });
  page.on('pageerror', (e) => errs.push(`pageerror: ${String(e).slice(0, 160)}`));
  page.on('requestfailed', (r) => errs.push(`failed: ${r.url().slice(-60)}`));
  await page.goto(BASE);
  await page.evaluate(() => {
    localStorage.setItem('riale-cardbatlle:tutorial', '1');
    localStorage.setItem('riale-cardbatlle:tips', JSON.stringify(['interrupt', 'overwrite', 'reserve']));
  });
  await page.reload();
  await page.waitForTimeout(1500);
  await page.getByText('デッキ', { exact: true }).last().click({ force: true });
  await page.waitForTimeout(1200);
  await page.goto(BASE + '&speed=8');
  await page.waitForTimeout(1000);
  await page.getByText('バトル！', { exact: true }).click({ force: true });
  const mid = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  for (let i = 0; i < 80; i++) {
    if (await page.locator('.result').count()) break;
    const c = await page.locator('.hand-card.is-affordable:not(:has(.is-spell))').first().boundingBox({ timeout: 200 }).catch(() => null);
    const s = await page.locator('.field-me .slot').first().boundingBox({ timeout: 200 }).catch(() => null);
    if (c && s) {
      await page.mouse.move(mid(c).x, mid(c).y);
      await page.mouse.down();
      await page.mouse.move(mid(s).x, mid(s).y, { steps: 4 });
      await page.mouse.up();
    }
    const pick = page.locator('[data-pickable]').first();
    if (await pick.count()) await pick.click({ force: true, timeout: 300 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(6000);
  const reached = (await page.locator('.result').count()) > 0;
  return { 結果まで: reached ? 'OK' : 'NG', エラー: [...new Set(errs)] };
}
