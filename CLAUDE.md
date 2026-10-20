# リアルカードバトル（仮）

共通の進め方は `C:\claude\CLAUDE.md`。ここにはこのアプリ固有のことだけ書く。
ゲームの仕様は `docs/spec.md`。

- 絵は `src/assets/art`（ChatGPT 製。`scripts/slice-*.mjs` で切り出し）。
- **音は録音のみ。コードで合成した音は使わない**（ユーザー指定）。効果音=ElevenLabs（`audio-src/<名前>-<番号>.wav` →
  `node scripts/build-sfx.mjs` → `src/assets/sfx/`、音量は役割ごとの目標に自動でそろえる）、BGM=Suno（`audio-src/bgm-home.mp3`
  `bgm-battle.mp3` → `node scripts/build-bgm.mjs`）。入口は `src/ui/sound.ts`・`samples.ts`・`bgm.ts`、配線と残響は `audio-graph.ts`。
  候補の聴き比べ・選択は `?sounds`（ホームの「テスト用」）。BGM は `<audio>` で先読みして始まりを速くしてある。
- **対戦中は画面全体が盤面**で、共通のヘッダー（戻る・タイトル・設定・?）を置かない。全アプリ共通の決まりの例外（ユーザー指定）。
  **ホームも共通 UI の対象外**（ユーザー指定: 共通 UI はパズルゲーム向けで、このゲームは違う）。クラロワ等を参考に作り直してよい。
- ゲーム性（`src/game/`）はオリジナルのまま。**画面 UI と操作性はクラロワ／ドラクエライバルズを真似る**。
- 画面改善は聞かずに自走して回す（検査→`docs/backlog.md`→実装→検査）。検査基準はクラロワ／ライバルズと同じに見えるか。
- 素材は ChatGPT で作ってよい（`art-src/` に一枚絵、`scripts/slice-*.mjs` で `src/assets/art/` へ）。
- 共通 UI（`src/ui/shared/`）は `node C:\claude\shared-ui\sync.mjs` が配る生成物。直接編集しない。
- ブラウザで試すときは URL に `?mute` を付ける（例: `http://localhost:5190/riale-cardbatlle/?mute`）。
- ルールの数値は `src/game/rules.ts`、カードは `src/game/cards.ts` だけに書く。
  変えたら `npm run simulate` で試合の長さと勝率を測り直す。
- 公開: `npm run deploy`（gh-pages ブランチへ）。
- 開発サーバー（Vite）は、起動後に追加した素材を拾えず 404 になることがある。素材を足したら dev サーバーを再起動する（本番ビルドは問題なし）。
