# htmlOS

ブラウザの中で動く、OS風の環境です。HTMLファイル1枚が「インストールメディア兼ブートローダ」になっていて、OS本体はブラウザの LocalStorage に展開されて起動します。

**▶ 使ってみる: GitHub Pages で公開中**（このリポジトリの Pages の URL を開くと、Live モード（インストールせずに試す）とインストーラを選べます）

## 特徴

- **htmlBIOS**: POST（自己診断）画面と SETUP 画面（Del / F2）。Quiet Boot にすると黒い画面に白い `</>` だけを出し、そのまま OS の起動画面につながります
- **起動画面**: 黒い背景に白い `</>` を線で描くアニメーションとスピナー
- **ブートローダ**: GUI / CUI 起動、Live モード、システム修復、再インストール
- **Live モードと GUI インストーラー**: インストールせずにメモリ上で試せます（再読み込みで消えます）。Live の中の「htmlOS をインストール」から、ユーザー・コンピューター名・起動モード・デスクトップ環境を選んでインストールでき、Live で作ったファイルも引き継げます。テキストモードのインストーラーも残しています
- **jsh（CUI）**: JavaScript ベースのシェル。`ls -l /sys` のようなシェル風の書き方も、`ls("/sys").length` のような JS も使えます。パイプ（`ls /sys | grep js | wc -l`）、`$変数`、エイリアス、`~/.jshrc` に対応
  - テキスト処理: head tail wc sort uniq cut tr nl rev tee diff grep
  - ファイル操作: find tree du basename dirname ln（シンボリックリンク）readlink file
  - システム情報・シェル: free uptime hostname id env export unset alias unalias which type man top
- **HTUi（GUI）**: ウィンドウの移動・リサイズ・スナップ、アニメーション。jsh から `htui start` / `htui stop` で起動・終了
- **hdm（HtmlDisplayManager）**: ログイン画面。ユーザーとデスクトップ環境を選んでログインし、最後に使った環境を覚えます。選んだ環境に合わせて見た目が変わります（HTUi 独自 / GDM 風 / Windows 11・8.1・Phone 風 / macOS 風・iOS 風 / シンプル）
- **デスクトップ環境を選べる**:
  - HTUi … 上にパネル、左にアイコン（標準）
  - hWin … Windows 風。マウスではタスクバーとスタートメニュー。タブレットでは Windows 8.1 風（スタート画面のタイル、「デスクトップ」アプリ、チャーム、画面の端からのスワイプ）、スマートフォンでは Windows Phone 8.1 風（ステータスバーとアクションセンター、戻る・スタート・検索のナビゲーションバー、タスク切り替え）
  - hShell … GNOME 風。トップバー、「アクティビティ」画面・ドック、日時を押すとカレンダーと通知センター
  - hwc … Labwc 風。パネルなしのウィンドウマネージャだけ（右クリックでメニュー）
  - hAqua … macOS 風。メニューバー、拡大するドック、信号機ボタンのウインドウ、Launchpad（F4）・Mission Control（F3）・Spotlight（Alt+Space）・コントロールセンター・通知センター。タブレットでは iPadOS 風、スマートフォンでは iOS 風（ホーム画面とドック、ホームバーのスワイプでホーム・アプリスイッチャー・アプリ切り替え、上端からコントロールセンター・通知センター）
- **壁紙**: SVG で描いた 6 種類（ブルーム・波・夕焼けの山・オーロラ・砂丘・グラファイト）。設定からパソコンや hFS の画像も壁紙にできます
- **キーボードとカーソルの捕捉（Keyboard Lock / Pointer Lock）**: マウスでクリックすると全画面になり、Alt+Tab・Ctrl+W・Super キーなども htmlOS が受け取ります。カーソルもロックされ、htmlOS が描いた仮想カーソルで操作します（ホバーの見た目・ホイール・選択欄・スライダー・文字のドラッグ選択も再現。Chrome / Edge。Esc 長押しで解除。IME の切り替えキーは捕捉しない）。別のサイトを表示している hBrowser のページの上でクリックすると、そのページを操作できるようにロックを外します。Alt+Tab（Alt+` でも）でウィンドウを切り替え
- **カーソル**: デスクトップ環境ごとに SVG で描いたカーソル（HTUi 独自・Windows 風・macOS 風・GNOME 風・シンプル）。文字入力・リンク・リサイズ・hPaint などで形が変わります
- **右クリックメニュー**: デスクトップ、ウィンドウのタイトルバー、タスクバー・ドック、文字の入力欄と選んだ文字、hFile のファイルと空いている場所（Shift+右クリックでブラウザのメニュー）
- **タブレット / スマートフォンモード**: 全画面アプリ、画面キーボード対応。HTUi は下部ナビ、ほかの環境はそれぞれの操作方法（ジェスチャーなど）
- **通知**: `OS.notify(...)` や jsh の `notify` で通知を出せます（ダウンロード完了などもここに出ます）
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
