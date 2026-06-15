# pomit 🍅

> **Pomodoro × Commit** — 自己学習の進捗を、ポモドーロと一緒にGitHubへ刻む。

## フェーズ1: GitHub Pages 疎通確認

現在は **GitHub API の接続確認 + commit/push テスト** のみ実装。

---

## セットアップ手順

### 1. このリポジトリをクローン or ファイルをコピー

```bash
git clone https://github.com/y-osaka0123/pomit.git
cd pomit
```

https://y-osaka0123.github.io/pomit/

## 🚀 Try pomit

👉 **[pomit を開く](https://y-osaka0123.github.io/pomit/)** （Ctrl + クリック または 中クリックで新しいタブで開けます）

🌐 [pomit](https://y-osaka0123.github.io/pomit/) ↗

### 3. Personal Access Token を発行

1. GitHub → `Settings` → `Developer settings` → `Personal access tokens` → `Tokens (classic)`
2. `Generate new token (classic)`
3. スコープ: **`repo`** にチェック（Privateリポジトリも操作するため）
4. トークンをコピー（再表示不可）

### 4. 疎通確認

1. GitHub Pagesの URL を開く
2. トークン・Owner名（`y-osaka0123`）・リポジトリ名（`pomit`）を入力
3. `保存` → `接続確認` → `テストコミット実行`
4. `pomit-test/connection-check.md` が作成されれば成功 ✅

---

## ファイル構成

```
pomit/
└── docs/                  # GitHub Pages ルート
    ├── index.html         # UI
    ├── app.js             # GitHub API ロジック
    └── .nojekyll          # Jekyllビルド無効化
```
