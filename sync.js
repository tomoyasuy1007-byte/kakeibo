// Google ログインで、記録をネット上（Firebase）に保存して端末間で同期する。
// ログインしていないときは、これまでどおりこの端末の中だけに保存する。
import { firebaseConfig, APP_URL } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, writeBatch
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const K = window.kakeibo;
const bar = document.getElementById("syncBar");
const text = document.getElementById("syncText");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const setText = msg => { text.textContent = msg; };

// ログインは APP_URL のドメインでだけ使える（Google に登録された戻り先と同じにするため）
const appHost = new URL(APP_URL).hostname;
const onAppHost = location.hostname === appHost;
const onLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
if (location.hostname.endsWith(".web.app")) {
  // 同じアプリの別アドレス。正式なアドレスへ移動する
  location.replace(APP_URL);
  throw new Error("redirect");
}
if (!onAppHost && !onLocal) {
  // 以前のアドレス（GitHub Pages）で開いたときは、新しいアドレスへ案内する
  bar.classList.add("moved");
  setText("家計簿は新しいアドレスに引っ越しました。同期はそちらで使えます。");
  loginBtn.textContent = "新しいアドレスを開く";
  loginBtn.onclick = () => { location.href = APP_URL; };
  loginBtn.hidden = false;
  throw new Error("old host");  // ここで同期の準備をやめる
}

// アプリとログインのページが同じドメインなので、iPhone のホーム画面アプリでも確実に動く
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

let uid = null, email = "", unsubs = [], synced = null, wasSignedIn = false;
let cloud = { entries: null, fixed: null, budgets: null };

const snapshotOf = db => ({
  entries: new Map(db.entries.map(e => [e.id, JSON.stringify(e)])),
  fixed: new Map(db.fixed.map(f => [f.id, JSON.stringify(f)])),
  budgets: JSON.stringify(db.budgets),
});

// 画面で変更があるたびに呼ばれ、前回から変わった分だけネットに送る
function push() {
  if (!uid || !synced) return;
  const cur = snapshotOf(K.db);
  const ops = [];
  for (const kind of ["entries", "fixed"]) {
    for (const [id, j] of cur[kind]) if (synced[kind].get(id) !== j) ops.push(b => b.set(doc(fs, "users", uid, kind, id), JSON.parse(j)));
    for (const id of synced[kind].keys()) if (!cur[kind].has(id)) ops.push(b => b.delete(doc(fs, "users", uid, kind, id)));
  }
  if (cur.budgets !== synced.budgets) ops.push(b => b.set(doc(fs, "users", uid, "meta", "settings"), { budgets: K.db.budgets }));
  synced = cur;
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(fs);
    ops.slice(i, i + 400).forEach(op => op(batch));
    batch.commit().catch(e => setText("ネットへの保存に失敗しました：" + e.message));
  }
}
window.kakeiboSync = { push };

function applyCloud(meta) {
  if (!cloud.entries || !cloud.fixed || !cloud.budgets) return;
  const fromCloud = {
    entries: [...cloud.entries.values()],
    fixed: [...cloud.fixed.values()],
    budgets: { ...cloud.budgets },
  };
  const mergedKey = "kakeibo-merged-" + uid;
  let mergedNow = false;
  if (!localStorage.getItem(mergedKey)) {
    // この端末で初めてログインしたとき：端末の中だけにあった記録もネットに足す
    const local = K.db;
    fromCloud.entries.push(...local.entries.filter(e => !cloud.entries.has(e.id)));
    fromCloud.fixed.push(...local.fixed.filter(f => !cloud.fixed.has(f.id)));
    fromCloud.budgets = { ...local.budgets, ...cloud.budgets };
    synced = snapshotOf({ entries: [...cloud.entries.values()], fixed: [...cloud.fixed.values()], budgets: cloud.budgets });
    try { localStorage.setItem(mergedKey, "1"); } catch {}
    mergedNow = true;
  }
  K.db = fromCloud;
  if (!mergedNow) synced = snapshotOf(K.db);
  K.save();   // 端末にも控えを残す（初回は足した分がここでネットに送られる）
  K.render();
  setText(meta.hasPendingWrites ? "保存中…" : meta.fromCache ? "オフライン中（つながったら同期します）" : `${email} で同期中`);
}

onAuthStateChanged(auth, user => {
  unsubs.forEach(u => u());
  unsubs = [];
  cloud = { entries: null, fixed: null, budgets: null };
  synced = null;
  if (!user) {
    uid = null;
    if (wasSignedIn) {
      // ログアウトしたら、この端末の控えは消す（記録はネット上に残る）
      K.db = { entries: [], fixed: [], budgets: {} };
      try { localStorage.removeItem("kakeibo-v1"); } catch {}
      K.render();
    }
    wasSignedIn = false;
    setText("この端末の中だけに保存中");
    loginBtn.hidden = false;
    logoutBtn.hidden = true;
    return;
  }
  uid = user.uid;
  email = user.email || "";
  wasSignedIn = true;
  loginBtn.hidden = true;
  logoutBtn.hidden = false;
  setText("同期の準備中…");
  const onErr = e => setText("同期できませんでした：" + e.message);
  const opts = { includeMetadataChanges: true };
  unsubs.push(onSnapshot(collection(fs, "users", uid, "entries"), opts, s => {
    cloud.entries = new Map(s.docs.map(d => [d.id, d.data()])); applyCloud(s.metadata);
  }, onErr));
  unsubs.push(onSnapshot(collection(fs, "users", uid, "fixed"), opts, s => {
    cloud.fixed = new Map(s.docs.map(d => [d.id, d.data()])); applyCloud(s.metadata);
  }, onErr));
  unsubs.push(onSnapshot(doc(fs, "users", uid, "meta", "settings"), opts, s => {
    cloud.budgets = s.data()?.budgets || {}; applyCloud(s.metadata);
  }, onErr));
});

getRedirectResult(auth).catch(e => setText("ログインできませんでした：" + e.message));

loginBtn.onclick = async () => {
  const provider = new GoogleAuthProvider();
  const standalone = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  try {
    if (standalone) await signInWithRedirect(auth, provider);
    else await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === "auth/popup-blocked") return signInWithRedirect(auth, provider);
    if (!/popup-closed|cancelled-popup/.test(e.code || "")) setText("ログインできませんでした：" + e.message);
  }
};

logoutBtn.onclick = async () => {
  if (!confirm("ログアウトしますか？この端末の表示は空になります（記録はネット上に残ります）。")) return;
  await signOut(auth);
};
