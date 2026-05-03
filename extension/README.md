# Pomit Guard — Chrome拡張

Braveのサボりサイトをポモドーロ作業中にブロックする拡張機能。

## インストール手順（Brave / Chrome）

### 1. リポジトリをクローン or ZIPダウンロード

```bash
git clone https://github.com/y-osaka0123/Pomit.git
```

### 2. Brave の拡張機能ページを開く

```
brave://extensions/
# または
chrome://extensions/
```

### 3. デベロッパーモードを ON

画面右上の「デベロッパーモード」トグルをオンにする。

### 4. 「パッケージ化されていない拡張機能を読み込む」

`Pomit/extension/` フォルダを選択する。

### 5. 完了

ブラウザのツールバーに Pomit Guard アイコンが表示される。

---

## 使い方

1. **Pomit Guard アイコン**をクリックしてポップアップを開く
2. 作業時間・休憩時間を設定（デフォルト: 25分 / 5分）
3. **「🍅 作業開始」**ボタンを押す
4. 作業中にサボりサイト（YouTube / X / Instagram 等）を開くと警告オーバーレイが表示される
5. 休憩中はサボりサイトへのアクセスが解禁される
6. ポモドーロが終了したら **Pomit（GitHub Pages）** で進捗を記録してコミット

---

## ブロック対象サイト

```
YouTube / X（Twitter）/ Instagram / Netflix
ニコニコ動画 / TikTok / Reddit / Pixiv
各種漫画サイト（mangadex / rawkuma 等）
```

カスタマイズしたい場合は `manifest.json` の `host_permissions` と
`content_scripts.matches` に追加する。

---

## ブロックモード

| モード | 動作 |
|--------|------|
| 警告   | オーバーレイ表示（「無視して続ける」で10秒後に再表示） |
| 強制   | オーバーレイ表示（「無視して続ける」ボタンなし）※未実装 |

---

## ファイル構成

```
extension/
├── manifest.json   # 拡張設定（manifest v3）
├── background.js   # Service Worker（状態管理・アラーム）
├── content.js      # サボり検知・オーバーレイ表示
├── content.css     # bodyスクロール制御
├── popup.html      # ポップアップUI
├── popup.js        # ポップアップロジック
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```
