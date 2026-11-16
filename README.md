# htmlOS

ブラウザの中で動く、OS風の環境です。HTMLファイル1枚が「インストールメディア兼ブートローダ」になっていて、OS本体はブラウザの LocalStorage に展開されて起動します。

**▶ 使ってみる: GitHub Pages で公開中**（このリポジトリの Pages の URL を開くとインストーラが起動します）

## 特徴

- **htmlBIOS**: POST（自己診断）画面と SETUP 画面（Del / F2）。Quiet Boot などの設定つき
- **ブートローダ**: GUI / CUI 起動、システム修復、再インストール
- **jsh（CUI）**: JavaScript ベースのシェル。`ls -l /sys` のようなシェル風の書き方も、`ls("/sys").length` のような JS も使えます
- **HTUi（GUI）**: ウィンドウの移動・リサイズ・スナップ、アニメーション。jsh から `htui start` / `htui stop` で起動・終了
- **hdm（HtmlDisplayManager）**: ログイン画面。ユーザーとデスクトップ環境を選んでログインし、最後に使った環境を覚えます
- **デスクトップ環境を選べる**:
  - HTUi … 上にパネル、左にアイコン（標準）
  - hWin … Windows 風。下にタスクバーとスタートメニュー
  - hShell … GNOME 風。トップバーと「アクティビティ」画面・ドック
  - hwc … Labwc 風。パネルなしのウィンドウマネージャだけ（右クリックでメニュー）
- **タブレット / スマートフォンモード**: 全画面アプリ、下部ナビ、画面キーボード対応
- **マルチユーザー**: 一般ユーザー・管理者・root（`su` で入るスーパーユーザー）
- **パッケージ**: `OS.registerApp(...)` を呼ぶ .js 1個がアプリになります。hStore か `pkg install` で追加

## 付属アプリ

| アプリ | 内容 |
|---|---|
| Terminal | jsh のコンソール |
| hedit | テキストエディター |
| hBrowser | webブラウザー（CORSプロキシ経由の表示モードあり） |
| hPlayer | 画像・音声・動画プレーヤー |
| hFile | ファイルブラウザー |
| Settings | ユーザー管理・起動・外観・ネットワーク・システム |
| hTask | タスクマネージャ |
| hCalc | 電卓（16進・2進・ビット演算） |
| hPaint | お絵かき（PNG保存） |
| hStore | パッケージマネージャ |
| hBackup | バックアップと復元 |
| hSerial | シリアルモニター（Web Serial） |

## 注意

- データはブラウザの LocalStorage（約5MB）に保存されます。ブラウザのデータを消すと htmlOS の中身も消えるので、大事なものは hBackup で書き出してください。
- パスワードはハッシュ化して保存していますが、ブラウザの開発者ツールからは LocalStorage を直接読めます。本格的なセキュリティはありません。
- hBrowser のプロキシモードは外部の無料 CORS プロキシを使います。止まっていることがあります（Settings → ネットワーク で変更可）。
- hSerial は Chrome / Edge など Web Serial に対応したブラウザでのみ動きます。

## ビルド

`src/` が元のソースです。次のコマンドで `index.html` を作り直します（Python 3）。

```
python3 build.py
```

- `src/boot.html` … BIOS・ブートローダ・インストーラ
- `src/sys/` … OS本体（インストール時に LocalStorage の `/sys` に展開されます）
- `src/sys/apps/` … 付属アプリ

## ライセンス

[MIT License](LICENSE)

公開前に [SCANOSS](https://www.scanoss.com/)（scanoss-py 1.54.3）で全ファイルをスキャンし、既存のオープンソースコードとの一致がないことを確認しています。
