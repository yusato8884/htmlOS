# htmlOS Nightly（試験版）

安定版（7.x）とは別に、新しい仕組みを試すための版です。バージョンは `0.0.0n` のように末尾に `n` を付けます。
壊れていたり、急に変わったりすることがあります。

公開ページ: https://yusato8884.github.io/htmlOS/nightly/

## 0.0.0n: IWA（Isolated Web App）で hBrowser をプロキシなしにする

外部の CORS プロキシに頼らずに、hBrowser でどのサイトでも表示できるかを試す版です。

- **htmlOS Shell**（`iwa/`）: htmlOS を動かす外枠の Isolated Web App。htmlOS Nightly を Controlled Frame に表示し、
  hBrowser がページを開くと、そのウインドウの位置に別の Controlled Frame を重ねます（埋め込みを拒否するサイトも表示できる）
- **htmlOS Nightly**（`index.html`）: htmlOS Shell の中からだけ起動します（URL に `?iwa-shell=1` があるときだけ）。
  普通のタブで開くと、いつもの htmlOS と同じ保存場所を使ってしまい、いつもの htmlOS を壊すおそれがあるためです。
  htmlOS Shell の中では保存場所（partition）が別なので、いつもの htmlOS のファイルやユーザーとは分かれています

### 入れ方（ChromeOS）

Isolated Web App は、今のところ ChromeOS で、開発者向けのフラグを使ったときだけ自分で入れられます。

1. Chrome で `chrome://flags/#enable-isolated-web-app-dev-mode` を開き、**Enabled** にして再起動する
2. `chrome://web-app-internals` を開き、「Install IWA from Signed Web Bundle」で `iwa/htmlOS-Shell-Nightly-0.0.0n.swbn` を選ぶ
3. ランチャーから **htmlOS Shell Nightly** を起動する

学校などに管理されている Chromebook では、フラグを変えられないことがあります。

### 分かっている制限

- hBrowser のページは htmlOS の上に重ねて表示するので、ほかのウインドウやメニューが一部でも重なっているあいだはページを隠します
- ダウンロードは Chromebook の「ダウンロード」フォルダに保存されます（htmlOS の ~/Downloads ではありません）
- Web Serial・WebUSB・PC のフォルダ（HDD1）は、Controlled Frame の中では使えないかもしれません
- 実際の Chromebook ではまだ試していません

## 作り方

```
python3 nightly/build_nightly.py        # nightly/index.html を作る
cd nightly/iwa && npm install && node build_iwa.mjs   # htmlOS Shell の .swbn を作る
```

`build_iwa.mjs` は署名の鍵 `nightly/iwa/key.pem` を使います（なければ作る）。同じ鍵で署名すると同じアプリとして更新できるので、
鍵はなくさないように別の場所に保管してください。鍵は秘密なのでリポジトリには入れません（`.gitignore`）。
