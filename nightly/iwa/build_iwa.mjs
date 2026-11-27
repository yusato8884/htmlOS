// htmlOS Shell Nightly（Isolated Web App）を署名付きの Web Bundle（.swbn）にまとめる
//   使い方: cd nightly/iwa && npm install && node build_iwa.mjs
//   鍵: key.pem（Ed25519）。なければ作る。同じ鍵で署名すると同じアプリ（同じ Web Bundle ID）として更新できるので、なくさないこと。
//   鍵は秘密なので、リポジトリには入れない（.gitignore）
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import * as wbn from 'wbn';
import * as wbnSign from 'wbn-sign';

const here = path.dirname(new URL(import.meta.url).pathname);
const appDir = path.join(here, 'app');
const keyPath = path.join(here, 'key.pem');
const manifest = JSON.parse(fs.readFileSync(path.join(appDir, '.well-known', 'manifest.webmanifest'), 'utf8'));
const NAME = 'htmlOS-Shell-Nightly-0.0.0n';

if (!fs.existsSync(keyPath)) {
  const { privateKey } = generateKeyPairSync('ed25519');
  fs.writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  console.log('新しい鍵を作りました:', keyPath);
}
const key = wbnSign.parsePemKey(fs.readFileSync(keyPath, 'utf8'));
const id = new wbnSign.WebBundleId(key).serialize();
const base = 'isolated-app://' + id + '/';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const files = [];
(function walk(d) { for (const n of fs.readdirSync(d).sort()) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else files.push(p); } })(appDir);

const builder = new wbn.BundleBuilder();
for (const p of files) {
  const rel = path.relative(appDir, p).split(path.sep).join('/');
  const type = MIME[path.extname(p)];
  if (!type) throw new Error(rel + ': 種類（Content-Type）が分かりません');
  builder.addExchange(base + rel, 200, { 'Content-Type': type }, fs.readFileSync(p));
  if (rel === 'index.html') builder.addExchange(base, 200, { 'Content-Type': type }, fs.readFileSync(p)); // 「/」でも開けるように
}
const bundle = builder.createBundle();
const signed = await wbnSign.SignedWebBundle.fromWebBundle(bundle, [new wbnSign.NodeCryptoSigningStrategy(key)]);
const out = path.join(here, NAME + '.swbn');
fs.writeFileSync(out, signed.getSignedWebBundleBytes());
console.log('作りました:', out, '(' + fs.statSync(out).size + ' バイト、ファイル ' + files.length + ' 個)');
console.log('アプリのバージョン（manifest）:', manifest.version);
console.log('Web Bundle ID:', signed.getWebBundleId());
console.log('IWA のオリジン:', 'isolated-app://' + signed.getWebBundleId() + '/');
