// ============================================================
// src/db.js — 資料層（Firebase Firestore，純 Spark 免費層）
// ------------------------------------------------------------
// 設計目標：
//   1) 永久儲存：資料寫入 Firestore，部署後跨裝置/跨學員真實共享。
//   2) 大附件：直接在前端把檔案讀成 base64 data URL，內嵌進 Firestore 文件
//      （文件只存 metadata + base64）。這樣「完全不需要 Cloud Storage」，
//      維持在 Firebase Spark 免費層（免計費、免綁定信用卡、絕不產生費用）。
//   3) Firestore 單文件上限 1MB，故附件總量需在 client 端保守限制
//      （見 src/App.jsx 的 MAX_FILE_BYTES / MAX_TOTAL_BYTES）。
//   4) 降級：若 .env 未填入 Firebase 設定，自動退回 localStorage，應用不會壞。
//
// 注意：本專案刻意不使用 Cloud Storage for Firebase。
//   Spark 方案自 2024-09 起已不再提供任何 Cloud Storage 存取（含預設桶），
//   呼叫會回傳 402/403；Cloud Storage 僅 Blaze（需計費帳戶）可用。
//   為遵守「只用免費層、不產生費用」，附件一律內嵌於 Firestore。
// ============================================================

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore, collection, onSnapshot, doc, setDoc, getDoc, deleteDoc, serverTimestamp
} from 'firebase/firestore';

// 從 Vite 環境變數讀取 Firebase 設定（來自 .env，建置時注入）
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID
};

// 應用程式識別碼：用於 Firestore 路徑隔離
export const APP_ID = import.meta.env.VITE_FB_APP_ID_SLUG || 'esggo-learning-center';

// 設定是否完整（缺欄位或用範例值則視為未配置 → 降級 localStorage）
const configComplete = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.appId &&
  String(firebaseConfig.apiKey).indexOf('xxxx') === -1
);

let app = null, auth = null, db = null, useFirebase = false;
if (configComplete) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    useFirebase = true;
  } catch (e) {
    console.warn('Firebase init failed, falling back to local storage', e);
    useFirebase = false;
  }
}

const LOCAL_KEY = `berkeley_submissions_${APP_ID}`;

export const loadLocal = () => {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
};
export const saveLocal = (items) => {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(items)); } catch { /* quota */ }
};

// localStorage 模式下的即時更新通知（同一頁內新增/刪除後重新刷新列表）
let localListeners = new Set();
const notifyLocal = () => {
  const d = loadLocal().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  localListeners.forEach(cb => cb(d));
};

// 登入：Firebase 用匿名登入；降級模式給一個穩定的本機 user id
export const initAuth = (cb) => {
  if (!useFirebase || !auth) {
    cb({ uid: `local-user-${APP_ID}`, isLocal: true });
    return () => {};
  }
  const unsub = onAuthStateChanged(auth, async (u) => {
    if (u) {
      cb(u);
    } else {
      try { await signInAnonymously(auth); }
      catch (e) { console.error('Auth error', e); }
    }
  });
  return unsub;
};

// 上傳 File[] -> attachment metadata[]（base64 內嵌，不依賴 Cloud Storage）
// 兩種模式行為一致：在前端把檔案讀成 data URL，直接存進 Firestore 文件。
export const uploadFiles = async (files, userId, docId) => {
  const list = Array.isArray(files) ? files : [];
  if (list.length === 0) return [];

  return Promise.all(list.map(f => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ name: f.name, type: f.type, size: f.size, url: r.result });
    r.onerror = rej;
    r.readAsDataURL(f);
  })));
};

// 新增一筆提交（client 產生 id，方便先上傳附件再寫入文件）
export const addSubmission = async (submission, attachments, id) => {
  const docId = id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  const payload = {
    userId: submission.userId,
    type: submission.type,
    data: { ...(submission.data || {}), attachments: attachments || [] },
    createdAt: serverTimestamp()
  };

  if (useFirebase && db) {
    await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'submissions', docId), payload);
  } else {
    const item = { id: docId, ...payload, createdAt: new Date().toISOString() };
    const all = loadLocal();
    all.push(item);
    saveLocal(all);
    notifyLocal();
  }
  return docId;
};

// 訂閱提交列表（Firestore 即時；localStorage 模式為一次性 + 事件通知）
export const subscribeSubmissions = (userId, onData) => {
  if (useFirebase && db) {
    const refCol = collection(db, 'artifacts', APP_ID, 'public', 'data', 'submissions');
    const unsub = onSnapshot(refCol, (snapshot) => {
      const data = snapshot.docs.map(d => {
        const x = d.data();
        let createdAt = x.createdAt;
        if (createdAt && typeof createdAt.toDate === 'function') createdAt = createdAt.toDate().toISOString();
        return { id: d.id, userId: x.userId, type: x.type, data: x.data, createdAt };
      });
      data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      onData(data);
    }, (err) => console.error('Snapshot error:', err));
    return unsub;
  }
  const cb = (d) => onData(d);
  localListeners.add(cb);
  cb(loadLocal().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  return () => localListeners.delete(cb);
};

// 刪除一筆（附件為 base64 內嵌，隨文件一併刪除，無需清理 Cloud Storage）
export const deleteSubmission = async (id) => {
  if (useFirebase && db) {
    await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'submissions', id));
  } else {
    const all = loadLocal().filter(x => x.id !== id);
    saveLocal(all);
    notifyLocal();
  }
};

export { useFirebase, auth, db };
