# リアルカードバトル（仮）

共通の進め方は `C:\claude\CLAUDE.md`。ここにはこのアプリ固有のことだけ書く。
ゲームの仕様は `Obsidian:Projects/riale-cardbatlle/spec.md`。

- 絵は `src/assets/art`（ChatGPT 製。`scripts/slice-*.mjs` で切り出し）。
- **音は録音のみ。コードで合成した音は使わない**（ユーザー指定）。効果音=ElevenLabs（`audio-src/<名前>-<番号>.wav` →
  `node scripts/build-sfx.mjs` → `src/assets/sfx/`、音量は役割ごとの目標に自動でそろえる）、BGM=Suno（`audio-src/bgm-home.mp3`
  `bgm-battle.mp3` → `node scripts/build-bgm.mjs`）。入口は `src/ui/sound.ts`・`samples.ts`・`bgm.ts`、配線と残響は `audio-graph.ts`。
  候補の聴き比べ・選択は `?sounds`（設定の一番下の「テスト用」）。BGM は `<audio>` で先読みして始まりを速くしてある。
- **対戦中は画面全体が盤面**で、共通のヘッダー（戻る・タイトル・設定・?）を置かない。全アプリ共通の決まりの例外（ユーザー指定）。
  **ホームも共通 UI の対象外**（ユーザー指定: 共通 UI はパズルゲーム向けで、このゲームは違う）。クラロワ等を参考に作り直してよい。
- ゲーム性（`src/game/`）はオリジナルのまま。**画面 UI と操作性はクラロワ／ドラクエライバルズを真似る**。
- 画面改善は聞かずに自走して回す（検査→`Obsidian:Projects/riale-cardbatlle/backlog.md`→実装→検査）。検査基準はクラロワ／ライバルズと同じに見えるか。
- 素材は ChatGPT で作ってよい（`art-src/` に一枚絵、`scripts/slice-*.mjs` で `src/assets/art/` へ）。
- 共通 UI（`src/ui/shared/`）は `node C:\claude\shared-ui\sync.mjs` が配る生成物。直接編集しない。
- ブラウザで試すときは URL に `?mute` を付ける（例: `http://localhost:5190/riale-cardbatlle/?mute`）。
- ルールの数値は `src/game/rules.ts`、カードは `src/game/cards.ts` だけに書く。
  変えたら `npm run simulate` で試合の長さと勝率を測り直す。
- 公開: `npm run deploy`（gh-pages ブランチへ）。
- 開発サーバー（Vite）は、起動後に追加した素材を拾えず 404 になることがある。素材を足したら dev サーバーを再起動する（本番ビルドは問題なし）。
- 確認用の URL: `?mute`（音なし）、`?unlockall`（全カード解放）、`?sounds`（サウンドテスト）、`?chest`（宝箱の開封演出）、`?result=win|lose|draw`（試合なしで結果画面）、`?speed=N`（時間 N 倍速）。
- 常設ツール: `npm run simulate`（CPU 同士の勝率・試合時間）、`npm run audit`（全カードの勝率。偏りの調整に使う）、`npm run fuzz`（ランダムデッキ 300 試合で例外・異常値を検出）、`npx tsx scripts/audit-swap.ts`（初期デッキの 1 枚を差し替えて hard で測る。全カード監査で誤差に埋もれる差が見える）、`npx tsx scripts/audit-decks.ts`（相手デッキごとの勝率、hard）、`npx tsx scripts/audit-modes.ts [試合数] [案] --decks`（ルールの案 1/2/3 ごとの試合時間・時間切れ・相手デッキの勝率。案ごとのカードの数値は `src/game/balance.ts`、全カード監査は `MODE=2 npm run audit`）、`playwright-cli run-code --filename=scripts/audit-layout.js`（7 つの画面の大きさでホーム・デッキ・対戦のはみ出しを点検。dev サーバーを起動して `playwright-cli open` のあとに）、`scripts/audit-console.js`（同じ使い方。ホーム→デッキ→対戦→結果を通してコンソールのエラーを集める）。
  素材の取り込みは `scripts/slice-cards.mjs`（カード・建築・呪文）、`slice-effects.mjs`（演出）、`slice-pips.mjs`（数字の台座）、`slice-chest.mjs`（宝箱）。
- 成長（宝箱でカード解放）は `src/storage/collection.ts`、初回案内は `src/ui/Tutorial.tsx`。課題の一覧は `Obsidian:Projects/riale-cardbatlle/issues.md`。
- playwright で確認するときは、待ちに必ず timeout を付ける（付けないと固まる）。`clock.install` を使ったら `playwright-cli close` で閉じる。
