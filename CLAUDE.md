# リアルカードバトル（仮）

共通の進め方は `C:\claude\CLAUDE.md`。ここにはこのアプリ固有のことだけ書く。
ゲームの仕様は `docs/spec.md`。

- 素材と音の仕組みは `C:\claude\city-builders` から持ってきた（絵 `src/assets/art`、効果音 `src/assets/sfx`、
  `src/ui/sound.ts`・`bgm.ts`・`audio-graph.ts`・`sound-plan.ts`）。
- **対戦中は画面全体が盤面**で、共通のヘッダー（戻る・タイトル・設定・?）を置かない。全アプリ共通の決まりの例外（ユーザー指定）。
  ホームは共通 UI のまま。
- 共通 UI（`src/ui/shared/`）は `node C:\claude\shared-ui\sync.mjs` が配る生成物。直接編集しない。
- ブラウザで試すときは URL に `?mute` を付ける（例: `http://localhost:5190/riale-cardbatlle/?mute`）。
- ルールの数値は `src/game/rules.ts`、カードは `src/game/cards.ts` だけに書く。
  変えたら `npm run simulate` で試合の長さと勝率を測り直す。
- 公開: `npm run deploy`（gh-pages ブランチへ）。
