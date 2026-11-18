# htmlOS

ブラウザの中で動く、OS風の環境です。HTMLファイル1枚が「インストールメディア兼ブートローダ」になっていて、OS本体はブラウザの LocalStorage に展開されて起動します。

**▶ 使ってみる: GitHub Pages で公開中**（このリポジトリの Pages の URL を開くと htmlOS i が起動し、「htmlOSを試す」か「インストール」を選べます）

## htmlOS 5.1 Altair の新しいところ

- **ファイルのパーミッション**（UNIX と同じ rwx）: ファイルとディレクトリに所有者・グループ・モードがあり、読む（r）・書く（w）・実行/中に入る（x）を確かめます
  - `ls -l` に `-rw-r--r--  yu  yu` のように表示。`stat` にもモード
  - **chmod** `[-R] 755 / u+x / go-w / a=r / +t`、**chown** `[-R] ユーザー[:グループ]`（root だけ）、**chgrp**、**umask**（既定 022）、**groups**、**usermod -aG / -rG**
  - 既定: `/home/ユーザー` と `/root` は 700、`/tmp` は 1777（スティッキー。ほかの人のファイルは消せない）、`/etc/passwd` は 600
  - 新しく作ったスクリプトは `chmod +x` しないと `./hello.jsh` で実行できません（`run hello.jsh` は読めれば実行できます）。5.0 までに作ったファイルは今までどおり動きます
  - HDD1（PC のフォルダ）でもモードとグループは `.htmlos.json` に覚えておきます
- **root と sudo**: 管理者（sudo グループ）は `sudo コマンド` を**自分のパスワード**で root として実行でき、5 分間はパスワードを聞きません
  - `sudo -i` / `sudo -s`（root のシェル）、`sudo -u ユーザー`、`sudo -l`、`sudo -k`。記録は `hjournal -u sudo`
  - `/etc/sudoers`（なければ `%sudo ALL=(ALL) ALL`）で `NOPASSWD:` や、使えるコマンドの限定ができます
  - サービスの操作（`sudo systemctl stop …`）・ユーザーの追加（`sudo useradd`）・ほかのユーザーのプロセスの kill は root だけになりました
  - HTUi で root 権限が要るとき（hedit で /sys に保存など）も、管理者は自分のパスワードで通れます
- **IPC（プロセス間通信）**（`/sys/ipc.js`、D-Bus にあたる）
  - **メッセージバス**: 名前（`htmlos.Notify` `htmlos.Sound` `htmlos.Init` `htmlos.Journal` `htmlos.Session` `htmlos.Bus`）のメソッドを呼ぶ・トピックに信号を流す
  - **ipc** `list` / `introspect 名前` / `call 名前 メソッド 引数…` / `pub トピック データ` / `listen トピック` / `monitor [トピック]`
  - 流れる信号: `unit.changed`（サービスの状態）・`session.login` `session.logout`・`notify`・`power.shutdown` `power.reboot`・`bus.name`
  - jsh の JavaScript から: `const b = bus(); b.own('my.Hello', { Hi(ctx, n) { return 'やあ ' + n; } }); await b.call('my.Hello', 'Hi', '悠'); b.subscribe('unit.*', d => echo(d.unit))`
  - **名前付きパイプ**: `mkfifo /tmp/p` → `cat /tmp/p` で待ち、ほかのシェルから `echo hi > /tmp/p`
- **Tab 補完**: systemctl・ps・hjournal など、あとから登録されたコマンドと `~/bin` `/bin` のスクリプトも、ターミナルを開いた直後から補完できるようにしました。`sudo` や `|` のあとでもコマンド名を補完します

### 5.1.1

- HDD1 から起動すると「読み込めませんでした: ext is not a function」で起動できなかったのを直しました（5.1.0 で入った不具合）

## htmlOS 5.0 Altair の新しいところ

ブラウザーはキーボード・画面・マウスとストレージを渡すだけの「脊髄」と考え、OS の仕組みを htmlOS の中に持つための土台です。

- **hinit（PID 1）とサービス管理**（`/sys/init.js`、systemd にあたる）
  - unit（サービス・ターゲット）の依存関係（`Requires=` `Wants=`）・起動順（`After=` `Before=`）・自動再起動（`Restart=no|on-failure|always` `RestartSec=`。10 秒に 5 回まで）・有効/無効
  - ターゲット: `basic.target` → `multi-user.target`（CUI）→ `graphical.target`（HTUi）。起動ログに「〜を起動しました」、終了時に「〜を停止しました」が出ます
  - **systemctl**: `list-units [--all]` / `list-unit-files` / `status [unit]` / `start` `stop` `restart` `reload` / `enable` `disable [--now]` / `is-active` `is-enabled` `is-failed` / `list-dependencies` / `cat` / `daemon-reload` / `reset-failed` / `poweroff` `reboot`
  - 自分で作る: `/etc/hinit/名前.service` に書いて `systemctl daemon-reload`（`ExecStart=` は jsh のコマンド。出力はジャーナルへ）

    ```ini
    [Unit]
    Description=あいさつ
    After=multi-user.target
    [Service]
    ExecStart=echo こんにちは
    Restart=on-failure
    [Install]
    WantedBy=multi-user.target
    ```
  - JS からは `OS.init.register({ name, desc, after, requires, wantedBy, restart, start(ctx) })`
- **プロセス管理**（`OS.proc`）: init・カーネル・サービス・ログインセッション・アプリのウインドウ・シェルに PID。`ps` / `kill [-TERM|-KILL|-HUP|-INT] PID` / `kill -l` / `pkill` `killall` / `pidof` / `top`。サービスを KILL すると失敗として扱い、`Restart=on-failure` なら起動し直します
- **ログ**（`OS.journal`、journald にあたる）: **hjournal** `[-n 件数] [-u unit] [-p err] [-k] [-b -1] [-r] [-f] [--since HH:MM]`、`dmesg`。前の起動のログは `/var/log/journal/prev.json`
- **サービスに載せ替え**: 時計（clock.service）・通知（notifyd.service）・効果音（soundd.service）・ネットワークの監視（netmon.service。オンライン/オフラインを通知）・HTUi（htui.service）・ジャーナルの保存（hjournald.service）。止めるとその機能が止まります（例: `systemctl stop clock` で時計が止まる）

## htmlOS 4.2 の新しいところ

- **効果音**: 起動・ログイン・ログオフ・シャットダウン・再起動・Terminal のベル・確認のダイアログ（子ウインドウ）・エラー・通知で音が鳴ります。音のファイルは使わず、Web Audio でその場で合成したオリジナルの音です
  - Settings の「サウンド」で、オン/オフ・音量・試し鳴らし（ユーザーごと）。ログイン前の起動音・ログイン音はシステム全体の設定（管理者）
  - jsh: `sound`（状態）/ `sound on|off` / `sound vol 0〜100` / `sound play 名前` / `sound list`、`bell`。Terminal では BEL 文字（`\x07`）を出したときと、Tab で補完できないときにベルが鳴ります
  - プログラムからは `OS.sound.play('confirm')` など。ブラウザの決まりで、ページを開いてから一度もクリックやキー入力をしていないあいだは鳴りません
- 4.2.1: 効果音に重厚感を足しました（1 オクターブ下の柔らかい支え・少しずらした重ね・短いホールの残響。低音は控えめ）

## htmlOS 4.1 の新しいところ

- **HTUi SDK 3.0.1**: トグルスイッチ（`class="switch"`）のつまみの位置がズレていたのを修正
- **hdm**: パスワードを入力して Enter でログインできないことがあったのを修正（どのテーマでも Enter でログイン）
- **hTic-tac-toe**: 三目並べ。CPU（やさしい・ふつう・つよい）か二人で対戦。マスの数（3×3〜9×9）と、何個並べたら勝ちかを変えられます
- **hReversi**: リバーシ。CPU（やさしい・ふつう・つよい）か二人で対戦。打てる場所の表示・一手戻す

### 4.1.5

- **HDD1 の修正**: 再起動（ページを読み込み直さない再起動）のあと、BIOS が HDD1 を正しく扱えないことがあったのを修正。再起動のたびに、ページを開いたときと同じように HDD1 を読み込み直します（許可が出ていればボタンを押さずに読み込みます）

### 4.1.4

- **再起動しても全画面が外れない**: 再起動・電源を入れる・BIOS の保存して終了で、ページを読み込み直さずに POST からやり直すようにしました（OS が足した画面・イベント・タイマーを片付けてから起動し直します）。キーボードの捕捉もそのままです
- **カーソル**: `#os-root` の外（ページ全体）にも、いまのデスクトップ環境のカーソルを指定

### 4.1.3

- **タッチモードでタッチすると全画面に**（キーボードがつながっていれば、それも捕捉）
- キーボードを捕捉した・解除したときの htmlOS 側の表示をやめました（ブラウザの「Esc 長押しで全画面を終了」の表示はブラウザが出します）

### 4.1.2

- **カーソルのロック（Pointer Lock）と仮想カーソルをやめました**: カーソルは本物のマウスカーソルのまま、形は CSS の `cursor` で指定（テーマごとの SVG）、右クリックはブラウザの `contextmenu` イベントで受けます。タッチ・ペンの操作も邪魔しません。キーボードの捕捉（Keyboard Lock）は今までどおりです

### 4.1.1

- **タッチ操作の修正（ChromeOS など）**: トラックパッドやマウスでクリックしてカーソルがロックされたあと、タッチスクリーンの操作が効かなくなっていたのを修正。タッチ・ペンはロック中もそのまま届き、触るとカーソルのロックが外れます（キーボードの捕捉と全画面はそのまま。次のクリックでまたロック）
- **画面モード「自動」**: 主に使うポインタが指のとき（ChromeOS のタブレットモードなど）はタッチ表示に。タブレットモードへの切り替えや画面の回転にも自動で追従します

## htmlOS 4.0 Vega の新しいところ

- **HTUi SDK 3.0（Venus）**: 描画エンジン（/sys/htui.js）の新しい版
  - ボタン・入力欄・選択欄・チェックボックス・ラジオ・スライダー・進み具合・色・ファイル選択・スクロールバーを、ブラウザーの標準の見た目から独自のデザインに。`<input type="checkbox" class="switch">` でスイッチ
  - **WebView**: hBrowser の表示部分を部品にした `OS.htui.WebView({...})`。web ページ（直接 / CORS プロキシ）・hFS の HTML・HTML の文字列を表示でき、リンク・タイトル・`postMessage` をアプリで受け取れます。hBrowser もこの WebView で動いています
  - **キャプションボタン**: `OS.htui.open({ buttons: [{ icon, label, title, toggle, onclick }] })` や `win.addButton(...)` で、タイトルバーにアプリ独自のボタンを置けます
- **壁紙を 6 種類追加**: ベガ（こと座）・金星・桜・森・プリズム・朝の湖（全部で 12 種類）
- **シェルスクリプト（.jsh）**: 1 行ずつ jsh の行として実行。`$1` `$@` `$#` `$?` `$(コマンド)`、`NAME=値`、`exit N`、行末の `\` でつなぐ、`{ }` でまたがる JavaScript のブロック。`./hello.jsh` や `run hello.jsh`、`~/bin`・`/bin` に置けば名前だけで実行。JS からは `await cmd("ls | wc -l")` で出力を受け取れます
- **HTUi Studio**: アプリの開発環境（IDE）。**アプリケーション・コマンド・デスクトップ環境**の 3 種類をテンプレートから作り、編集・ビルド・その場で実行・インストールまでできます
  - GUI 版: プロジェクトのファイル一覧・コードエディター・プロジェクトの設定・リファレンス（WebView）・コンソール。タイトルバーに 実行 / ビルド / インストール のキャプションボタン
  - CLI 版（4.0.1 から TUI）: Terminal で `hstudio` と打つと、矢印キー・Enter・Esc で操作する画面が開きます（新規作成・プロジェクトを開く・実行・ビルド・インストール・ファイル・設定）。スクリプトからは `hstudio new app|cmd|de 名前` / `list` / `build` / `run` / `install` / `open` も使えます
  - パッケージは `OS.registerCommand(...)`（jsh のコマンド）と `OS.registerSession(...)`（デスクトップ環境）も登録できるようになりました

### 3.1・3.2 で入ったもの

- 3.1: hMark（Markdown エディター）・hMines（マインスイーパー風）・**HDD1**（File System Access API で選んだ PC のフォルダを `/mnt/hdd1` に。インストール先にもできる）・jsh のパイプとテキスト処理の強化（grep -i/-v/-n/-c・sed・xargs・`<`・`&& || ;`）
- 3.2 Sirius: インストーラーと htmlOS i の回復メニューでディスクの上限（GB）を設定、新しい版があると htmlOS i で更新を聞くダイアログ、HTUi SDK 2（Jupiter）の子ウインドウ（確認のダイアログは開いたウインドウの子ウインドウとして出る）

## 特徴

- **htmlBIOS**: POST（自己診断）画面と SETUP 画面（Del / F2）。Security 画面からインストールした htmlOS を消去することもできます。Quiet Boot にすると黒い画面に白い `</>` だけを出し、そのまま OS の起動画面につながります
- **起動画面**: 黒い背景に白い `</>` を線で描くアニメーションとスピナー
- **起動時のキー**: ブートローダーは普段は表示しません。POST 画面でキーを押しておくと起動のしかたを選べます（タッチ操作では画面のボタンを押します）

  | キー | 起動するもの |
  |---|---|
  | 何も押さない | htmlOS（設定した既定の UI） |
  | Alt | htmlOS i（OS がインストールされていても） |
  | Ctrl | htmlOS（jsh） |
  | Shift | セーフモード（インストールしたアプリ・パッケージと `~/.jshrc` を無効化） |
  | Esc | ブートメニュー（テキストモードのインストーラー・再インストールもここ） |

- **htmlOS i**: インストール・アップデート・回復向けの最小構成の htmlOS（i は Installer の頭文字）。メモリ上で、root としてシングルユーザーモードで起動し、最小のウィンドウマネージャ hwm の上で htmlOSセットアップが開きます。閉じようとすると、セットアップを終えてシャットダウンするか確認します。OS が入っていないときは自動で htmlOS i になります
  - **htmlOSセットアップ**: ロゴ・バージョン・ビルド番号と、4つのタイル
    - 「htmlOSを試す」… 追加のアプリをその都度読み込み、インストールせずにメモリ上で試せます（再読み込みで消えます）
    - 「インストール」… ユーザー・コンピューター名・起動モード・デスクトップ環境を選んでインストール（試している間に作ったファイルも引き継げます）
    - 「アップデート」… インストール済みの htmlOS を、このメディアの版に更新（ユーザーのファイルと設定は残します。htmlOS が見つからないときは押せません）
    - 「htmlOSを回復」… システム修復・パスワードのリセット・起動設定の初期化・バックアップの書き出しと復元・アンインストール
      - 起動設定の初期化・バックアップ・復元・アンインストールは、インストール先の管理者（または root）としてサインインしてから行います
      - パスワードのリセットには root のパスワードが必要です。root のパスワードもわからない場合は、BIOS の SETUP（Del / F2）の Security →「Erase htmlOS Storage」で htmlOS を消去してインストールし直せます
  - インストール済みの htmlOS より新しいメディアで起動すると、デスクトップに「アップデートがあります」と通知します
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
- **デスクトップ**: ファイル置き場（~/Desktop）。ホーム・/（ルート）のアイコン（hwc 以外）と、ゴミ箱（HTUi・hWin）が並びます。ダブルクリックで開く、ドラッグでゴミ箱やフォルダへ移動、PC のファイルをドロップして取り込み。タッチモードの HTUi ではアプリのランチャーになります
- **ゴミ箱**: hFile やデスクトップで削除したものは ~/.Trash に入り、「元に戻す」「ゴミ箱を空にする」ができます（jsh の rm はすぐに消します）
- **壁紙**: SVG で描いた 12 種類（ブルーム・波・夕焼けの山・オーロラ・砂丘・グラファイト・ベガ・金星・桜・森・プリズム・朝の湖）。設定からパソコンや hFS の画像も壁紙にできます
- **キーボードの捕捉（Keyboard Lock）**: マウスでクリックすると全画面になり、Alt+Tab・Ctrl+W・Super キーなども htmlOS が受け取ります（Chrome / Edge。Esc 長押しで解除。IME の切り替えキーは捕捉しない。タッチモードではタッチで全画面）。Alt+Tab（Alt+` でも）でウィンドウを切り替え
- **カーソル**: デスクトップ環境ごとに SVG で描いたカーソルを CSS の `cursor` で指定（HTUi 独自・Windows 風・macOS 風・GNOME 風・シンプル）。文字入力・リンク・リサイズ・hPaint などで形が変わります
- **右クリックメニュー**: デスクトップ、ウィンドウのタイトルバー、タスクバー・ドック、文字の入力欄と選んだ文字、hFile のファイルと空いている場所（Shift+右クリックでブラウザのメニュー）
- **タブレット / スマートフォンモード**: 全画面アプリ、画面キーボード対応。HTUi は下部ナビ、ほかの環境はそれぞれの操作方法（ジェスチャーなど）
- **通知**: `OS.notify(...)` や jsh の `notify` で通知を出せます（ダウンロード完了などもここに出ます）
- **マルチユーザー**: 一般ユーザー・管理者・root（`su` で入るスーパーユーザー）
- **パッケージ**: `OS.registerApp(...)`（アプリ）・`OS.registerCommand(...)`（jsh のコマンド）・`OS.registerSession(...)`（デスクトップ環境）を呼ぶ .js 1個がパッケージになります。hStore か `pkg install`、HTUi Studio で追加

## 付属アプリ

| アプリ | 内容 |
|---|---|
| Terminal | jsh のコンソール |
| hedit | テキストエディター |
| hMark | Markdown エディター（コードとプレビュー） |
| HTUi Studio | アプリ・コマンド・デスクトップ環境を作る開発環境（GUI 版と CLI 版 `hstudio`） |
| hBrowser | webブラウザー（CORSプロキシ経由の表示モードあり） |
| hPlayer | 画像・音声・動画プレーヤー |
| hFile | ファイルブラウザー |
| Settings | ユーザー管理・起動・外観・ネットワーク・システム（htmlOS i・セーフモードで再起動） |
| hTask | タスクマネージャ |
| hCalc | 電卓（16進・2進・ビット演算） |
| hMines | マインスイーパー風のゲーム |
| hTic-tac-toe | 三目並べ（CPU・二人、マスの数を変えられる） |
| hReversi | リバーシ（CPU・二人） |
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

版・コードネーム・ビルド番号は `build.py` の `VERSION`・`CODENAME`・`BUILD` に書きます（リリースごとにビルド番号を 1 つ増やします）。

- `src/boot.html` … BIOS・ブートローダ・htmlOS i の起動・テキストモードのインストーラ
- `src/sys/` … OS本体（インストール時に LocalStorage の `/sys` に展開されます）
- `src/sys/apps/` … 付属アプリ

## ライセンス

[MIT License](LICENSE)

4.1.0 の公開時に [SCANOSS](https://www.scanoss.com/)（scanoss-py 1.54.3、`--all-extensions`）で全ファイル（31 個）をスキャンし、既存のオープンソースコードとの一致がないことを確認しています。
