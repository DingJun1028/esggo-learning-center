import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, Upload, PlayCircle, CalendarCheck, MessageCircleQuestion, Smile, Database, ShieldCheck, ArrowLeft, Send, ChevronDown, ChevronUp, FileText, Globe, Search, Download, Trash2, Filter, X } from 'lucide-react';
import {
  useFirebase, initAuth, subscribeSubmissions, addSubmission, deleteSubmission,
  uploadFiles, loadLocal, APP_ID
} from './db';

// --- 管理員密碼（輕量保護，見 docs/FIREBASE_SETUP.md 說明）---
const ADMIN_PASS = import.meta.env.VITE_ADMIN_PASS || '';
// 附件內嵌進 Firestore（不使用 Cloud Storage，維持 Spark 免費層）。
// Firestore 單文件上限 1MB，base64 會膨脹約 1/3，故總量保守限制 700KB，
// 單檔上限 5MB（防止一次丟進過大檔案卻在寫入時才炸）。
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 700 * 1024;

// 附件渲染：Firebase 模式用 url（下載網址），localStorage 降級用 data（base64）
const renderFiles = (files) => (
  <div className="flex flex-col gap-2">
    {files.map((f, i) => {
      const href = f.url || f.data;
      return (
        <a key={i} href={href} download={f.name} target="_blank" rel="noreferrer"
           className="flex items-center gap-2 text-[#003262] hover:underline text-xs bg-slate-50 border border-slate-200 rounded p-2">
          <FileText size={14} className="shrink-0" />
          <span className="truncate font-medium">{f.name}</span>
          <span className="text-slate-400 ml-auto whitespace-nowrap">{f.size ? `${(f.size / 1024).toFixed(0)} KB ↓` : '↓'}</span>
        </a>
      );
    })}
  </div>
);

// 類型化明細：根據 type 顯示有意義的欄位（而非裸 JSON）
const DetailPanel = ({ item }) => {
  const d = item.data || {};
  const atts = d.attachments || [];
  const Field = ({ label, value }) =>
    value ? (
      <div className="mb-2">
        <div className="text-xs font-bold text-slate-400 mb-0.5">{label}</div>
        <div className="text-sm text-slate-700 whitespace-pre-wrap break-words">{value}</div>
      </div>
    ) : null;

  return (
    <div className="text-sm">
      {item.type === 'upload' && (
        <>
          <Field label="作業備註" value={d.desc} />
          {atts.length > 0 && (<><div className="text-xs font-bold text-slate-400 mb-0.5">附件</div>{renderFiles(atts)}</>)}
          {atts.length === 0 && <div className="text-xs text-slate-400">（無附件）</div>}
        </>
      )}
      {item.type === 'booking' && (
        <>
          <Field label="預約日期" value={d.date} />
          <Field label="預約時段" value={d.time} />
          <Field label="諮詢主題" value={d.topic} />
        </>
      )}
      {item.type === 'question' && (
        <>
          <Field label="組織與角色" value={d.role} />
          <Field label="主要挑戰摘要" value={d.challenge} />
          <Field label="最想請教師資的問題" value={d.mainQuestion} />
          {atts.length > 0 && (<><div className="text-xs font-bold text-slate-400 mb-0.5">補充檔案</div>{renderFiles(atts)}</>)}
        </>
      )}
      {item.type === 'survey' && (
        <>
          <Field label="課程週次" value={d.meta?.week} />
          <Field label="上課日期" value={d.meta?.date} />
          <Field label="本週主題" value={d.meta?.theme} />
          <Field label="講師姓名" value={d.meta?.lecturer} />
          <Field label="學員姓名" value={d.meta?.name} />
          <Field label="所屬組織" value={d.meta?.org} />
          <div className="text-xs font-bold text-slate-400 mb-1">評分（1–5）</div>
          {d.ratings && Object.keys(d.ratings).length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(d.ratings).map(([q, v]) => (
                <span key={q} className="text-xs bg-[#FDB515]/15 text-[#b47b00] px-2 py-1 rounded font-mono">Q:{q.slice(-1)} = {v}</span>
              ))}
            </div>
          ) : <div className="text-xs text-slate-400 mb-2">（無評分）</div>}
          <Field label="回饋 1" value={d.open?.open_1} />
          <Field label="回饋 2" value={d.open?.open_2} />
          <Field label="回饋 3" value={d.open?.open_3} />
          {atts.length > 0 && (<><div className="text-xs font-bold text-slate-400 mb-0.5">補充檔案</div>{renderFiles(atts)}</>)}
        </>
      )}
    </div>
  );
};

// 共用的真實檔案上傳元件：暫存原始 File 物件，送出時轉成 base64 內嵌 Firestore
const AttachmentUploader = ({ value = [], onChange }) => {
  const [error, setError] = useState('');
  const handleFiles = (fileList) => {
    const files = Array.from(fileList);
    const tooBig = files.some(f => f.size > MAX_FILE_BYTES);
    if (tooBig) { setError('單檔超過 5MB，請改用較小的檔案。'); return; }
    const total = (value || []).reduce((s, f) => s + (f.size || 0), 0) + files.reduce((s, f) => s + (f.size || 0), 0);
    if (total > MAX_TOTAL_BYTES) { setError('附件總量超過 700KB（受 Firestore 單文件 1MB 限制），請減少或壓縮檔案。'); return; }
    setError('');
    onChange([...(value || []), ...files]);
  };
  return (
    <div>
      <input type="file" multiple onChange={(e) => handleFiles(e.target.files)}
        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-100 file:text-[#003262] file:font-semibold hover:file:bg-slate-200" />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {value && value.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          {value.map((f, i) => (
            <li key={i} className="flex items-center gap-2">
              <FileText size={14} />
              <span className="truncate">{f.name}</span>
              <span className="text-slate-400">({(f.size / 1024).toFixed(0)} KB)</span>
              <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="ml-auto text-slate-400 hover:text-red-500">✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const translations = {
  'zh-TW': {
    heroTitle: '2026 柏克萊國際人才培育課程 學習中心',
    f1: '學員資源區', f2: '作業上傳', f3: '課程回放', f4: '諮詢預約', f5: '提問提交', f6: '滿意調查',
    records: '用戶資源庫', admin: '管理後台', myRecords: '我的紀錄',
    roleStudent: '🧑‍🎓 學員視角', roleAdmin: '🛡️ 管理員視角',
    back: '返回首頁', submit: '送出提交', saving: '儲存中...', success: '提交成功！',
    footer: '2026 Berkeley ESG Strategy & Innovation Program',
    adminLoginTitle: '管理員登入', adminPassLabel: '管理員密碼', adminConfirm: '進入', adminCancel: '取消',
    list: {
      search: '搜尋（學員ID / 內容關鍵字）', all: '全部類型', type: '類型', from: '起', to: '迄',
      filters: '篩選', reset: '重設', export: '匯出 CSV', delete: '刪除', collapse: '收合', expand: '展開',
      noResults: '沒有符合條件的紀錄', count: '共 {n} 筆', confirmDelete: '確定要刪除這筆紀錄嗎？',
      storageMode: 'Firestore 雲端永久儲存', localMode: '本機暫存模式（未連接 Firebase）'
    },
    forms: {
      upload: { title: '作業上傳', file: '選擇檔案', desc: '作業備註說明 (選填)' },
      booking: { title: '諮詢預約', date: '預約日期', time: '預約時段', topic: '諮詢主題' }
    },
    table: { type: '類型', date: '提交時間', details: '內容細節', user: '用戶ID' },
    types: { upload: '作業', booking: '預約', question: '提問', survey: '問卷' }
  },
  'zh-CN': {
    heroTitle: '2026 柏克莱国际人才培育课程 学习中心',
    f1: '学员资源区', f2: '作业上传', f3: '课程回放', f4: '咨询预约', f5: '提问提交', f6: '满意调查',
    records: '用户资源库', admin: '管理后台', myRecords: '我的纪录',
    roleStudent: '🧑‍🎓 学员视角', roleAdmin: '🛡️ 管理员视角',
    back: '返回首页', submit: '提交', saving: '保存中...', success: '提交成功！',
    footer: '2026 Berkeley ESG Strategy & Innovation Program',
    adminLoginTitle: '管理员登录', adminPassLabel: '管理员密码', adminConfirm: '进入', adminCancel: '取消',
    list: {
      search: '搜索（学员ID / 内容关键字）', all: '全部类型', type: '类型', from: '起', to: '迄',
      filters: '筛选', reset: '重设', export: '导出 CSV', delete: '删除', collapse: '收合', expand: '展开',
      noResults: '没有符合条件的纪录', count: '共 {n} 笔', confirmDelete: '确定要删除这笔纪录吗？',
      storageMode: 'Firestore 云端永久存储', localMode: '本机暂存模式（未连接 Firebase）'
    },
    forms: {
      upload: { title: '作业上传', file: '选择文件', desc: '备注说明 (选填)' },
      booking: { title: '咨询预约', date: '预约日期', time: '预约时段', topic: '咨询主题' }
    },
    table: { type: '类型', date: '提交时间', details: '内容细节', user: '用户ID' },
    types: { upload: '作业', booking: '预约', question: '提问', survey: '问卷' }
  },
  'en': {
    heroTitle: '2026 Berkeley International Talent Training Center',
    f1: 'Student Resources', f2: 'Assignment Upload', f3: 'Course Replay', f4: 'Consulting Booking', f5: 'Submit Question', f6: 'Satisfaction Survey',
    records: 'User Resources', admin: 'Admin Dashboard', myRecords: 'My Records',
    roleStudent: '🧑‍🎓 Student View', roleAdmin: '🛡️ Admin View',
    back: 'Back to Home', submit: 'Submit', saving: 'Saving...', success: 'Submitted successfully!',
    footer: '2026 Berkeley ESG Strategy & Innovation Program',
    adminLoginTitle: 'Admin Login', adminPassLabel: 'Admin Password', adminConfirm: 'Enter', adminCancel: 'Cancel',
    list: {
      search: 'Search (user ID / keyword)', all: 'All Types', type: 'Type', from: 'From', to: 'To',
      filters: 'Filters', reset: 'Reset', export: 'Export CSV', delete: 'Delete', collapse: 'Collapse', expand: 'Expand',
      noResults: 'No records match', count: 'Total {n}', confirmDelete: 'Delete this record?',
      storageMode: 'Firestore cloud storage', localMode: 'Local fallback (Firebase not connected)'
    },
    forms: {
      upload: { title: 'Assignment Upload', file: 'Select file(s)', desc: 'Description (optional)' },
      booking: { title: 'Consulting Booking', date: 'Date', time: 'Time Slot', topic: 'Topic' }
    },
    table: { type: 'Type', date: 'Date', details: 'Details', user: 'User ID' },
    types: { upload: 'Assignment', booking: 'Booking', question: 'Question', survey: 'Survey' }
  }
};

// 滿意度調查表結構
const surveySchema = [
  { id: "sec1", title: "一、課程內容與學習價值", questions: [
    { id: "q1_1", text: "本週課程主題與內容安排清楚，容易掌握學習重點。" },
    { id: "q1_2", text: "本週課程幫助我深化對 ESG 策略、創新或實務議題的理解。" },
    { id: "q1_3", text: "本週所學對我的工作、組織或專案具有實際應用價值。" }
  ]},
  { id: "sec2", title: "二、講師教學品質", questions: [
    { id: "q2_1", text: "講師對本週主題具有充分的專業知識與實務經驗。" },
    { id: "q2_2", text: "講師能清楚說明重要概念、框架與案例。" },
    { id: "q2_3", text: "講師能有效引導學員思考，並回應學員問題。" },
    { id: "q2_4", text: "講師提供的觀點或工具有助於我形成下一步行動方向。" }
  ]},
  { id: "sec3", title: "三、教材與學習支持", questions: [
    { id: "q3_1", text: "講義、課前學習包或延伸資料有助於我理解本週內容。" },
    { id: "q3_2", text: "課程中的案例、討論或練習有助於將概念轉化為實務。" }
  ]},
  { id: "sec4", title: "四、行政團隊與課務支持", questions: [
    { id: "q4_1", text: "行政團隊能清楚並及時提供課程時間、連結、教材與重要通知。" },
    { id: "q4_2", text: "Zoom、錄影、AI 同傳或其他線上學習工具整體運作順暢。" },
    { id: "q4_3", text: "行政團隊能適時回應本週課程相關問題與需求。" }
  ]}
];

// 模擬提問卡資料庫
const mockCases = [
  { id: 1, title: "模擬提問卡 01：承岳精密工業股份有限公司", desc: "國際供應鏈壓力下的傳統中小製造業",
    content: `<div class="space-y-4"><h4 class="font-bold text-[#003262] border-b pb-2">Part 1｜基本資料</h4><ul class="list-disc pl-5 text-sm text-slate-700"><li><strong>角色：</strong>林怡君 (總經理室專案經理／兼任 ESG 專案窗口)</li><li><strong>產業：</strong>精密金屬零組件、工業設備與電子零組件供應鏈</li><li><strong>狀態：</strong>公司目前的 ESG 工作主要由客戶問卷與碳資料要求所驅動，尚未從一次性回應轉成可持續管理的制度。</li></ul><h4 class="font-bold text-[#003262] border-b pb-2 mt-4">Part 4｜最想請教師資的問題</h4><p class="text-sm bg-slate-50 p-3 rounded border border-slate-200">我們正陸續收到國際客戶對碳排、供應商行為準則、環境與人權資料的要求，但目前資料分散於各部門、責任不清，內部也多將 ESG 視為額外行政工作。<br/><br/>我們應如何在 90 天內建立一套最低可行的 ESG 管理底盤，既能回應目前客戶要求，又能逐步建立後續治理、資料與轉型能力？</p><h4 class="font-bold text-[#003262] border-b pb-2 mt-4">Part 6｜期待產出</h4><ul class="list-disc pl-5 text-sm text-slate-700"><li>90 天內應完成的 ESG 優先工作清單</li><li>跨部門 owner 與責任分工建議</li><li>第一版 ESG 資料與證據清單</li></ul><div class="bg-[#FDB515]/10 p-3 rounded mt-4 text-sm text-[#003262]"><strong>💡 為什麼這是好問題？</strong><br/>它具備了「組織情境、外部壓力、已知缺口、決策問題與期待產出」。把模糊的「客戶要求很多」轉成了可在 90 天內推進的具體管理底盤設計問題。</div></div>` },
  { id: 2, title: "模擬提問卡 02：綠識科技股份有限公司", desc: "技術強但 ESG 基礎與市場驗證不成熟的 AI 新創",
    content: `<div class="space-y-4"><h4 class="font-bold text-[#003262] border-b pb-2">Part 1｜基本資料</h4><ul class="list-disc pl-5 text-sm text-slate-700"><li><strong>角色：</strong>陳柏睿 (共同創辦人暨產品長)</li><li><strong>產業：</strong>AI-enabled ESG SaaS、企業永續資料與決策分析</li><li><strong>狀態：</strong>具有很強的開發能力，但功能範圍過廣，尚未找到最具支付意願的優先市場，也尚未建立足以取得大型企業信任的 Responsible AI 治理。</li></ul><h4 class="font-bold text-[#003262] border-b pb-2 mt-4">Part 4｜最想請教師資的問題</h4><p class="text-sm bg-slate-50 p-3 rounded border border-slate-200">我們已開發多個 AI-enabled ESG 模組，但尚未確認哪一個 use case 同時具有最強客戶痛點、支付意願與規模化潛力。<br/><br/>我們應如何選出第一個核心市場，設計 90 天驗證計畫，並建立企業客戶所需的 Responsible AI、資料治理與證據機制？</p><h4 class="font-bold text-[#003262] border-b pb-2 mt-4">Part 6｜期待產出</h4><ul class="list-disc pl-5 text-sm text-slate-700"><li>第一個核心客群與優先 use case 的選擇原則</li><li>90 天 Product-Market Fit 驗證計畫</li><li>Responsible AI 最低可行治理架構</li></ul><div class="bg-[#FDB515]/10 p-3 rounded mt-4 text-sm text-[#003262]"><strong>💡 為什麼這是好問題？</strong><br/>它展現了企業的 ESG 解方能力走在自身 ESG 管理能力之前的典型困境，要求 Mentor 協助從「功能」收斂到「問題」，從「快速開發」收斂到「可信治理」。</div></div>` },
  { id: 3, title: "模擬提問卡 03：仁域國際人道基金會", desc: "使命成熟但 ESG 治理與 Impact Evidence 未系統化的大型 NPO",
    content: `<div class="space-y-4"><h4 class="font-bold text-[#003262] border-b pb-2">Part 1｜基本資料</h4><ul class="list-disc pl-5 text-sm text-slate-700"><li><strong>角色：</strong>張雅雯 (副執行長暨策略與影響力主管)</li><li><strong>產業：</strong>國際人道救援、醫療、教育與社區發展</li><li><strong>狀態：</strong>擁有大量人道服務成果，但影響力資料分散，尚未形成整合治理、環境責任與長期組織韌性的共同架構。</li></ul><h4 class="font-bold text-[#003262] border-b pb-2 mt-4">Part 4｜最想請教師資的問題</h4><p class="text-sm bg-slate-50 p-3 rounded border border-slate-200">我們具有明確使命與大量人道服務成果，但影響力資料分散，且內部擔心 ESG 過度企業化。<br/><br/>我們應如何建立整合使命、治理、環境責任、利害關係人信任與長期成果證據的 NPO ESG 策略，並以不增加第一線過度負擔的方式逐步落地？</p><h4 class="font-bold text-[#003262] border-b pb-2 mt-4">Part 6｜期待產出</h4><ul class="list-disc pl-5 text-sm text-slate-700"><li>適合大型 NPO 的 ESG 與 Impact Strategy 架構</li><li>可用於不同事業的共同核心指標與彈性指標設計</li><li>Evidence Chain 與資料治理的基本架構</li></ul><div class="bg-[#FDB515]/10 p-3 rounded mt-4 text-sm text-[#003262]"><strong>💡 為什麼這是好問題？</strong><br/>點出了 NPO 的核心張力：專業管理與人文使命之間的平衡。要求 Mentor 協助讓「善意有治理、行動有證據、影響有學習」。</div></div>` },
  { id: 4, title: "模擬提問卡 04：寰宇智造科技集團", desc: "ESG 1.0 成熟，但缺乏策略投資組合與創價路徑的大型企業",
    content: `<div class="space-y-4"><h4 class="font-bold text-[#003262] border-b pb-2">Part 1｜基本資料</h4><ul class="list-disc pl-5 text-sm text-slate-700"><li><strong>角色：</strong>王思涵 (全球永續策略處處長)</li><li><strong>產業：</strong>電子產品製造、工業自動化與全球供應鏈</li><li><strong>狀態：</strong>已建立成熟的合規底盤，但百項 ESG 專案分散，尚未形成明確的策略投資組合與 ESG 2.0 創價路徑。</li></ul><h4 class="font-bold text-[#003262] border-b pb-2 mt-4">Part 4｜最想請教師資的問題</h4><p class="text-sm bg-slate-50 p-3 rounded border border-slate-200">我們已有成熟 ESG 制度及超過 120 項專案，但缺乏區分合規、效率、韌性與成長型創新的共同方法。<br/><br/>我們應如何建立 ESG 投資組合與決策治理，選出三至五項企業級優先事項，並決定哪些專案應擴大、整合、重新設計或停止？</p><h4 class="font-bold text-[#003262] border-b pb-2 mt-4">Part 6｜期待產出</h4><ul class="list-disc pl-5 text-sm text-slate-700"><li>ESG 專案投資組合的分類方法</li><li>集團層級 strategic priority 的選擇標準</li><li>Scale、Integrate、Redesign、Stop 的決策規則</li></ul><div class="bg-[#FDB515]/10 p-3 rounded mt-4 text-sm text-[#003262]"><strong>💡 為什麼這是好問題？</strong><br/>展現了大型企業「做得多，但選得不準」的痛點。要求建立 Portfolio Governance，將 ESG 從「成本專案」轉化為「策略投資」。</div></div>` }
];

// 課程回放影片清單（自動化或備用，邏輯不變）
const REPLAY_SYNC = {
  ENABLED: true,
  WEB_APP_URL: '',
  CACHE_TTL_MS: 5 * 60 * 1000
};
let __replayCache = null;
const DEFAULT_REPLAY_VIDEOS = [
  { id: 'REPLACE_WITH_DRIVE_FILE_ID_1', week: '第 1 週', title: '課程主題一（範例）', date: '2026-01-10' },
  { id: 'REPLACE_WITH_DRIVE_FILE_ID_2', week: '第 2 週', title: '課程主題二（範例）', date: '2026-01-17' }
];

const fetchReplayVideos = (onData) => {
  if (!REPLAY_SYNC.ENABLED || !REPLAY_SYNC.WEB_APP_URL) { onData(DEFAULT_REPLAY_VIDEOS); return () => {}; }
  const now = Date.now();
  if (__replayCache && now - __replayCache.ts < REPLAY_SYNC.CACHE_TTL_MS) { onData(__replayCache.data); return () => {}; }
  const cbName = 'onReplayData_' + Math.random().toString(36).slice(2);
  const script = document.createElement('script');
  let settled = false;
  const cleanup = () => { try { delete window[cbName]; } catch {} if (script.parentNode) script.parentNode.removeChild(script); };
  window[cbName] = (payload) => {
    if (settled) return; settled = true;
    const list = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.videos) ? payload.videos : []);
    const data = list.length ? list : DEFAULT_REPLAY_VIDEOS;
    __replayCache = { ts: Date.now(), data };
    onData(data);
    cleanup();
  };
  script.onerror = () => { if (settled) return; settled = true; onData(DEFAULT_REPLAY_VIDEOS); cleanup(); };
  const sep = REPLAY_SYNC.WEB_APP_URL.includes('?') ? '&' : '?';
  script.src = `${REPLAY_SYNC.WEB_APP_URL}${sep}callback=${cbName}`;
  document.body.appendChild(script);
  const timer = setTimeout(() => { if (settled) return; settled = true; onData(DEFAULT_REPLAY_VIDEOS); cleanup(); }, 8000);
  return () => { clearTimeout(timer); cleanup(); };
};

const ReplayView = ({ t }) => {
  const [videos, setVideos] = useState(null);
  const cleanupRef = useRef(null);
  useEffect(() => { cleanupRef.current = fetchReplayVideos(setVideos); return () => { if (cleanupRef.current) cleanupRef.current(); }; }, []);
  const hasVideos = Array.isArray(videos) && videos.length > 0;
  return (
    <div className="max-w-4xl mx-auto" onContextMenu={(e) => e.preventDefault()}>
      <h2 className="text-xl sm:text-2xl font-bold text-[#003262] mb-4 sm:mb-6 flex items-center gap-3"><PlayCircle className="text-[#FDB515]" /> {t.f3}</h2>
      {videos === null ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-10 text-center text-slate-400">正在載入課程回放…</div>
      ) : !hasVideos ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-10 text-center text-slate-500">尚無可觀看影片</div>
      ) : (
        <div className="flex flex-col gap-6">
          {videos.map((v) => {
            const isPlaceholder = !v.id || v.id.startsWith('REPLACE_');
            return (
              <section key={v.id || v.title} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden select-none">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold text-[#b47b00] bg-[#FDB515]/20 px-2 py-0.5 rounded">{v.week}</span>
                      <span className="text-xs text-slate-400">上傳於 {v.date}</span>
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-[#003262] truncate">{v.title}</h3>
                  </div>
                </div>
                <div className="relative bg-black">
                  {isPlaceholder ? (
                    <div className="aspect-video flex items-center justify-center text-slate-400 text-sm px-4 text-center">影片待上傳（請管理員在 Drive 資料夾上傳影片，系統會自動抓出 ID）</div>
                  ) : (
                    <iframe src={`https://drive.google.com/file/d/${v.id}/preview`} className="w-full aspect-video" allow="autoplay" title={v.title} />
                  )}
                  <div className="absolute bottom-2 right-3 text-white/60 text-xs pointer-events-none select-none">ESG 學習中心 · 僅供線上觀看</div>
                </div>
              </section>
            );
          })}
        </div>
      )}
      <p className="mt-6 text-xs text-slate-400 leading-relaxed">本課程影片僅供 enrolled 學員線上觀看，請勿錄影、翻拍或外流。</p>
    </div>
  );
};

// 匯出 CSV：把明細抽成欄位，附件以「名稱(網址)」呈現
const toCsvCell = (s) => `"${(String(s == null ? '' : s).replace(/"/g, '""')).replace(/[\n\r]+/g, ' ')}"`;
const flattenDetail = (item) => {
  const d = item.data || {};
  if (item.type === 'upload') return { note: d.desc, files: (d.attachments||[]).map(a => `${a.name}${a.url ? `(${a.url})` : ''}`).join('; ') };
  if (item.type === 'booking') return { date: d.date, time: d.time, topic: d.topic };
  if (item.type === 'question') return { role: d.role, challenge: d.challenge, question: d.mainQuestion, files: (d.attachments||[]).map(a => `${a.name}${a.url ? `(${a.url})` : ''}`).join('; ') };
  if (item.type === 'survey') {
    const ratings = d.ratings ? Object.entries(d.ratings).map(([q,v]) => `${q}=${v}`).join(' ') : '';
    return { week: d.meta?.week, date: d.meta?.date, theme: d.meta?.theme, lecturer: d.meta?.lecturer, name: d.meta?.name, org: d.meta?.org, ratings, open1: d.open?.open_1, open2: d.open?.open_2, open3: d.open?.open_3, files: (d.attachments||[]).map(a => `${a.name}${a.url ? `(${a.url})` : ''}`).join('; ') };
  }
  return {};
};
const exportCsv = (items, t, lang) => {
  const flatCols = ['note','date','time','topic','role','challenge','question','week','theme','lecturer','name','org','ratings','open1','open2','open3','files'];
  const headers = ['id', 'type', 'userId', 'createdAt', ...flatCols];
  const rows = items.map(it => {
    const f = flattenDetail(it);
    return [it.id, t.types[it.type] || it.type, it.userId, it.createdAt, ...flatCols.map(c => f[c] || '')];
  });
  const csv = [headers, ...rows].map(r => r.map(toCsvCell).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `submissions_${lang}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// 管理後台 / 我的紀錄：篩選 + 收合展開 + 類型化明細 + 匯出 + 刪除
const RecordsView = ({ data, isAdmin, t, lang }) => {
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [openId, setOpenId] = useState(null);

  const filtered = data.filter(it => {
    if (type !== 'all' && it.type !== type) return false;
    const dt = new Date(it.createdAt);
    if (from && dt < new Date(from + 'T00:00:00')) return false;
    if (to && dt > new Date(to + 'T23:59:59')) return false;
    if (q.trim()) {
      const hay = `${it.userId} ${JSON.stringify(it.data || {})}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto">
      {/* 篩選工具列 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-2 text-[#003262]"><Filter size={16} /><span className="text-sm font-bold">{t.list.filters}</span></div>
          <select value={type} onChange={e => setType(e.target.value)} className="bg-slate-100 border-none text-sm rounded-lg py-2 px-3 outline-none cursor-pointer">
            <option value="all">{t.list.all}</option>
            <option value="upload">{t.types.upload}</option>
            <option value="booking">{t.types.booking}</option>
            <option value="question">{t.types.question}</option>
            <option value="survey">{t.types.survey}</option>
          </select>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <span>{t.list.from}</span><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded px-2 py-1" />
            <span>{t.list.to}</span><input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded px-2 py-1" />
          </div>
          <button onClick={() => { setQ(''); setType('all'); setFrom(''); setTo(''); }} className="text-xs text-slate-500 hover:text-[#003262] underline">{t.list.reset}</button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 flex-1 min-w-[200px]">
            <Search size={16} className="text-slate-400 shrink-0" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={t.list.search} className="bg-transparent outline-none text-sm w-full" />
          </div>
          {isAdmin && (
            <button onClick={() => exportCsv(filtered, t, lang)} className="flex items-center gap-2 bg-[#003262] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#002244] transition-colors">
              <Download size={16} /> {t.list.export}
            </button>
          )}
        </div>
        <div className="text-xs text-slate-400">{t.list.count.replace('{n}', filtered.length)}</div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-8 text-center text-slate-500">{t.list.noResults}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(item => {
            const open = openId === item.id;
            return (
              <div key={item.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <button onClick={() => setOpenId(open ? null : item.id)} className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="bg-[#FDB515]/20 text-[#b47b00] px-2 py-0.5 rounded-md text-sm font-bold">{t.types[item.type]}</span>
                      {isAdmin && <span className="text-xs font-mono text-slate-400">{item.userId.slice(0, 8)}…</span>}
                    </div>
                    <div className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                  {open ? <ChevronUp size={20} className="text-slate-400 shrink-0" /> : <ChevronDown size={20} className="text-slate-400 shrink-0" />}
                </button>
                {open && (
                  <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50/50">
                    <div className="py-3">{isAdmin && <div className="text-xs font-mono text-slate-400 mb-2">ID: {item.id} · {item.userId}</div>}</div>
                    <DetailPanel item={item} />
                    {isAdmin && (
                      <button onClick={() => { if (confirm(t.list.confirmDelete)) deleteSubmission(item.id); }}
                        className="mt-3 flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                        <Trash2 size={14} /> {t.list.delete}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [lang, setLang] = useState('zh-TW');
  const [view, setView] = useState('home');
  const [user, setUser] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [role, setRole] = useState('student');
  const [adminOk, setAdminOk] = useState(false);
  const [adminPrompt, setAdminPrompt] = useState(false);
  const [adminInput, setAdminInput] = useState('');
  const t = translations[lang];

  // Auth
  useEffect(() => {
    const unsub = initAuth((u) => setUser(u));
    return () => { if (unsub) unsub(); };
  }, []);

  // Data
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeSubmissions(user.uid, setSubmissions);
    return () => { if (unsub) unsub(); };
  }, [user]);

  // 角色切換（含管理員輕量密碼保護）
  const trySwitchRole = (next) => {
    if (next === 'admin') {
      if (adminOk) { setRole('admin'); setView('admin'); return; }
      setAdminPrompt(true);
      return;
    }
    setRole('student'); setView('home');
  };
  const confirmAdmin = () => {
    if (!ADMIN_PASS || adminInput === ADMIN_PASS) { setAdminOk(true); setRole('admin'); setView('admin'); }
    else alert('管理員密碼錯誤');
    setAdminPrompt(false); setAdminInput('');
  };

  // 送出：先將附件轉成 base64 內嵌，再寫入 Firestore（或本機）；不使用 Cloud Storage
  const handleSubmit = async (e, type, formData) => {
    e.preventDefault();
    if (!user) return;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.innerText = t.saving; btn.disabled = true;
    try {
      const docId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      const files = formData.files || formData.attachments || [];
      const atts = await uploadFiles(files, user.uid, docId);
      await addSubmission({ userId: user.uid, type, data: formData }, atts, docId);
      alert(t.success);
      setView(role === 'admin' ? 'admin' : 'records');
    } catch (err) {
      console.error(err);
      alert('Error saving data.');
    } finally {
      if (btn) { btn.innerText = originalText; btn.disabled = false; }
    }
  };

  const HomeView = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-5xl mx-auto">
      <a href="https://drive.google.com/drive/folders/1-ZOC6sPNGISeD7Rf6lYT3Q10yYZaTdAy?usp=sharing" target="_blank" rel="noreferrer"
         className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-[#FDB515] transition-all flex flex-col items-center justify-center gap-4 group cursor-pointer min-h-[130px] sm:min-h-[160px] tap-target">
        <div className="bg-slate-50 p-4 rounded-full text-[#003262] group-hover:bg-[#003262] group-hover:text-white transition-colors"><BookOpen size={32} /></div>
        <h3 className="text-lg font-bold text-[#003262]">{t.f1}</h3>
      </a>
      <div onClick={() => setView('upload')} className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-[#FDB515] transition-all flex flex-col items-center justify-center gap-4 group cursor-pointer min-h-[130px] sm:min-h-[160px] tap-target">
        <div className="bg-slate-50 p-4 rounded-full text-[#003262] group-hover:bg-[#003262] group-hover:text-white transition-colors"><Upload size={32} /></div>
        <h3 className="text-lg font-bold text-[#003262]">{t.f2}</h3>
      </div>
      <div onClick={() => setView('replay')} className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-[#FDB515] transition-all flex flex-col items-center justify-center gap-4 group cursor-pointer min-h-[130px] sm:min-h-[160px] tap-target">
        <div className="bg-slate-50 p-4 rounded-full text-[#003262] group-hover:bg-[#003262] group-hover:text-white transition-colors"><PlayCircle size={32} /></div>
        <h3 className="text-lg font-bold text-[#003262]">{t.f3}</h3>
      </div>
      <a href="https://forms.gle/bueqUGc14efLNo6B7" target="_blank" rel="noreferrer"
         className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-[#FDB515] transition-all flex flex-col items-center justify-center gap-4 group cursor-pointer min-h-[130px] sm:min-h-[160px] tap-target">
        <div className="bg-slate-50 p-4 rounded-full text-[#003262] group-hover:bg-[#003262] group-hover:text-white transition-colors"><CalendarCheck size={32} /></div>
        <h3 className="text-lg font-bold text-[#003262]">{t.f4}</h3>
      </a>
      <div onClick={() => setView('question')} className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-[#FDB515] transition-all flex flex-col items-center justify-center gap-4 group cursor-pointer min-h-[130px] sm:min-h-[160px] tap-target">
        <div className="bg-slate-50 p-4 rounded-full text-[#003262] group-hover:bg-[#003262] group-hover:text-white transition-colors"><MessageCircleQuestion size={32} /></div>
        <h3 className="text-lg font-bold text-[#003262]">{t.f5}</h3>
      </div>
      <div onClick={() => setView('survey')} className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-[#FDB515] transition-all flex flex-col items-center justify-center gap-4 group cursor-pointer min-h-[130px] sm:min-h-[160px] tap-target">
        <div className="bg-slate-50 p-4 rounded-full text-[#003262] group-hover:bg-[#003262] group-hover:text-white transition-colors"><Smile size={32} /></div>
        <h3 className="text-lg font-bold text-[#003262]">{t.f6}</h3>
      </div>
    </div>
  );

  const QuestionForm = () => {
    const [tab, setTab] = useState('write');
    const [openCase, setOpenCase] = useState(null);
    const [formData, setFormData] = useState({});
    return (
      <div className="max-w-3xl mx-auto bg-white p-5 sm:p-8 rounded-xl shadow-sm border border-slate-100">
        <div className="flex flex-wrap gap-x-2 gap-y-1 border-b border-slate-200 mb-6">
          <button onClick={() => setTab('write')} className={`pb-3 px-3 sm:px-6 font-bold text-base sm:text-lg ${tab === 'write' ? 'border-b-2 border-[#FDB515] text-[#003262]' : 'text-slate-400 hover:text-slate-600'}`}>撰寫提問提交</button>
          <button onClick={() => setTab('cases')} className={`pb-3 px-3 sm:px-6 font-bold text-base sm:text-lg flex items-center gap-2 ${tab === 'cases' ? 'border-b-2 border-[#FDB515] text-[#003262]' : 'text-slate-400 hover:text-slate-600'}`}><FileText size={18} /> 模擬提問卡參考</button>
        </div>
        {tab === 'write' ? (
          <form onSubmit={(e) => handleSubmit(e, 'question', formData)} className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">組織與角色</label>
              <input required type="text" onChange={e => setFormData({ ...formData, role: e.target.value })} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none" placeholder="例如：承岳精密 / 專案經理" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">主要挑戰摘要</label>
              <input required type="text" onChange={e => setFormData({ ...formData, challenge: e.target.value })} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none" placeholder="一兩句話摘要目前困境" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">最想請教師資的問題 (Main Question)</label>
              <textarea required onChange={e => setFormData({...formData, mainQuestion: e.target.value})} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none h-32" placeholder="詳細描述背景與您的問題..."></textarea>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">補充檔案 <span className="text-slate-400 font-normal">(選填，附件總量上限 700KB)</span></label>
              <AttachmentUploader value={formData.attachments} onChange={(files) => setFormData({ ...formData, attachments: files })} />
            </div>
            <button type="submit" className="mt-4 bg-[#003262] text-white font-bold py-3 rounded-lg hover:bg-[#002244] transition-colors flex items-center justify-center gap-2"><Send size={18} /> {t.submit}</button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-500 mb-2">協助您理解如何把模糊的「客戶要求很多」轉成一個可由 Mentor 診斷、可在 90 天內推進的具體問題。</p>
            {mockCases.map(c => (
              <div key={c.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <button onClick={() => setOpenCase(openCase === c.id ? null : c.id)} className="w-full bg-slate-50 p-4 text-left flex justify-between items-center hover:bg-slate-100 transition-colors">
                  <div><h4 className="font-bold text-[#003262]">{c.title}</h4><p className="text-xs text-slate-500 mt-1">{c.desc}</p></div>
                  {openCase === c.id ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                </button>
                {openCase === c.id && (<div className="p-5 border-t border-slate-200 bg-white" dangerouslySetInnerHTML={{ __html: c.content }}></div>)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const SurveyForm = () => {
    const [formData, setFormData] = useState({ meta: {}, ratings: {}, open: {}, attachments: [] });
    const handleRating = (qId, val) => setFormData(prev => ({ ...prev, ratings: { ...prev.ratings, [qId]: val } }));
    const handleMeta = (field, val) => setFormData(prev => ({ ...prev, meta: { ...prev.meta, [field]: val } }));
    const handleOpen = (field, val) => setFormData(prev => ({ ...prev, open: { ...prev.open, [field]: val } }));
    return (
      <div className="max-w-4xl mx-auto bg-white p-5 sm:p-8 rounded-xl shadow-sm border border-slate-100">
        <h2 className="text-2xl font-bold text-[#003262] mb-2 text-center">每週課後滿意度調查表</h2>
        <p className="text-sm text-slate-500 text-center mb-8">感謝您完成本週課程。您的回覆將作為後續課程優化依據。問卷約需 3–5 分鐘。</p>
        <form onSubmit={(e) => handleSubmit(e, 'survey', formData)} className="flex flex-col gap-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 bg-slate-50 p-4 sm:p-5 rounded-lg border border-slate-200">
            <div><label className="block text-xs font-bold text-slate-500 mb-1">課程週次</label><input required onChange={e => handleMeta('week', e.target.value)} type="text" className="w-full p-2 border rounded outline-none" placeholder="例如：第 1 週" /></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">上課日期</label><input required onChange={e => handleMeta('date', e.target.value)} type="date" className="w-full p-2 border rounded outline-none" /></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">本週主題</label><input required onChange={e => handleMeta('theme', e.target.value)} type="text" className="w-full p-2 border rounded outline-none" /></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">講師姓名</label><input required onChange={e => handleMeta('lecturer', e.target.value)} type="text" className="w-full p-2 border rounded outline-none" /></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">學員姓名 (選填)</label><input onChange={e => handleMeta('name', e.target.value)} type="text" className="w-full p-2 border rounded outline-none" /></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">所屬組織 (選填)</label><input onChange={e => handleMeta('org', e.target.value)} type="text" className="w-full p-2 border rounded outline-none" /></div>
          </div>
          <div className="text-sm text-[#003262] font-semibold bg-[#FDB515]/20 p-3 rounded-md text-center">評量尺度：1＝非常不同意 ｜ 2＝不同意 ｜ 3＝普通 ｜ 4＝同意 ｜ 5＝非常同意</div>
          {surveySchema.map(sec => (
            <div key={sec.id}>
              <h3 className="font-bold text-[#003262] mb-3 border-b-2 border-[#003262] pb-2 inline-block">{sec.title}</h3>
              <div className="overflow-x-auto md:overflow-visible">
                <table className="hidden md:table w-full text-sm border-collapse">
                  <thead><tr className="bg-slate-100 text-slate-600">
                    <th className="p-3 text-left font-semibold border-b border-slate-200">評量題目</th>
                    {[1,2,3,4,5].map(v => <th key={v} className="p-3 text-center w-12 font-semibold border-b border-slate-200">{v}</th>)}
                  </tr></thead>
                  <tbody>{sec.questions.map(q => (
                    <tr key={q.id} className="hover:bg-slate-50 border-b border-slate-100 transition-colors">
                      <td className="p-3 text-slate-700">{q.text}</td>
                      {[1,2,3,4,5].map(val => (
                        <td key={val} className="p-3 text-center align-middle">
                          <input type="radio" name={q.id} value={val} required onChange={() => handleRating(q.id, val)} className="w-5 h-5 text-[#003262] cursor-pointer" />
                        </td>
                      ))}
                    </tr>
                  ))}</tbody>
                </table>
                <div className="md:hidden flex flex-col gap-3">
                  {sec.questions.map(q => (
                    <div key={q.id} className="border border-slate-200 rounded-lg p-3 bg-white">
                      <p className="text-sm text-slate-700 mb-3 leading-relaxed">{q.text}</p>
                      <div className="flex justify-between items-center bg-slate-50 rounded-lg p-1">
                        {[1,2,3,4,5].map(val => (
                          <label key={val} className="flex-1 flex flex-col items-center gap-1 py-2 cursor-pointer tap-target">
                            <input type="radio" name={q.id} value={val} required onChange={() => handleRating(q.id, val)} className="w-5 h-5 text-[#003262] cursor-pointer accent-[#003262]" />
                            <span className="text-xs font-semibold text-slate-500">{val}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <div>
            <h3 className="font-bold text-[#003262] mb-3 border-b-2 border-[#003262] pb-2 inline-block">五、開放式回饋</h3>
            <div className="space-y-5">
              <div><label className="block text-sm font-semibold text-slate-700 mb-2">1. 本週課程中，對您最有價值的主題、觀點、案例或工具是什麼？為什麼？</label><textarea required onChange={e => handleOpen('open_1', e.target.value)} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none h-24 resize-none"></textarea></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-2">2. 本週課程在內容、教學方式、教材或行政安排上，有哪些地方可以改善？</label><textarea required onChange={e => handleOpen('open_2', e.target.value)} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none h-24 resize-none"></textarea></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-2">3. 您希望下週課程或後續學習能進一步回應哪一個問題？</label><textarea required onChange={e=>handleOpen('open_3', e.target.value)} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none h-24 resize-none"></textarea></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-2">補充檔案 <span className="text-slate-400 font-normal">(選填，附件總量上限 700KB)</span></label><AttachmentUploader value={formData.attachments} onChange={(files) => setFormData({ ...formData, attachments: files })} /></div>
            </div>
          </div>
          <button type="submit" className="mt-4 bg-[#003262] text-white font-bold py-4 rounded-lg hover:bg-[#002244] shadow-md transition-all flex items-center justify-center gap-2 text-lg"><Send size={20} /> 提交滿意度調查</button>
        </form>
      </div>
    );
  };

  const DynamicForm = ({ type }) => {
    if (type === 'question') return <QuestionForm />;
    if (type === 'survey') return <SurveyForm />;
    const config = t.forms[type];
    const [formData, setFormData] = useState({});
    const handleFiles = (fileList) => {
      const files = Array.from(fileList);
      const tooBig = files.some(f => f.size > MAX_FILE_BYTES);
      if (tooBig) { alert('單一檔案超過 5MB，請改用較小的檔案。'); return; }
      const total = (formData.files || []).reduce((s, f) => s + (f.size || 0), 0) + files.reduce((s, f) => s + (f.size || 0), 0);
      if (total > MAX_TOTAL_BYTES) { alert('附件總量超過 700KB（受 Firestore 單文件 1MB 限制），請減少或壓縮檔案。'); return; }
      setFormData(prev => ({ ...prev, files: [...(prev.files || []), ...files] }));
    };
    return (
      <div className="max-w-2xl mx-auto bg-white p-5 sm:p-8 rounded-xl shadow-sm border border-slate-100">
        <h2 className="text-2xl font-bold text-[#003262] mb-6 flex items-center gap-3">{config.title}</h2>
        <form onSubmit={(e) => handleSubmit(e, type, formData)} className="flex flex-col gap-5">
          {type === 'upload' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{config.file}</label>
                <input required type="file" multiple onChange={e => handleFiles(e.target.files)} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-100 file:text-[#003262] file:font-semibold hover:file:bg-slate-200" />
                {formData.files && formData.files.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {formData.files.map((f, i) => (<li key={i} className="flex items-center gap-2"><FileText size={14} /> <span className="truncate">{f.name}</span> <span className="text-slate-400">({(f.size / 1024).toFixed(0)} KB)</span></li>))}
                  </ul>
                )}
              </div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1">{config.desc}</label><textarea onChange={e => setFormData({ ...formData, desc: e.target.value })} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none h-32" placeholder="選填"></textarea></div>
            </>
          )}
          {type === 'booking' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm font-semibold text-slate-700 mb-1">{config.date}</label><input required type="date" onChange={e => setFormData({ ...formData, date: e.target.value })} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none" /></div>
                <div><label className="block text-sm font-semibold text-slate-700 mb-1">{config.time}</label><select required onChange={e => setFormData({ ...formData, time: e.target.value })} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none"><option value="">Select...</option><option value="Morning">Morning</option><option value="Afternoon">Afternoon</option></select></div>
              </div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1">{config.topic}</label><textarea required onChange={e => setFormData({ ...formData, topic: e.target.value })} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none h-24"></textarea></div>
            </>
          )}
          <button type="submit" className="mt-4 bg-[#003262] text-white font-bold py-3 rounded-lg hover:bg-[#002244] transition-colors flex items-center justify-center gap-2"><Send size={18} /> {t.submit}</button>
        </form>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20">
      <nav className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap justify-between items-center gap-2 sm:gap-4 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <a href="https://www.imagebam.com/view/ME18KXOM" target="_blank" rel="noreferrer" className="block">
            <img src="https://thumbs4.imagebam.com/a0/d6/d4/ME18KXOM_t.png" alt="Logo" className="w-10 h-10 rounded-lg shadow-md object-cover" />
          </a>
          {view !== 'home' && (
            <button onClick={() => setView('home')} className="text-sm font-bold text-slate-500 hover:text-[#003262] flex items-center gap-1 transition-colors bg-slate-100 px-3 py-1.5 rounded-md hover:bg-slate-200">
              <ArrowLeft size={16} /> {t.back}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
          <select value={lang} onChange={(e) => setLang(e.target.value)} className="bg-slate-100 border-none text-sm font-semibold text-[#003262] rounded-lg py-2 px-3 outline-none cursor-pointer hover:bg-slate-200 transition-colors">
            <option value="zh-TW">繁體中文</option>
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </select>
          <select value={role} onChange={(e) => trySwitchRole(e.target.value)} className="bg-[#FDB515]/10 border border-[#FDB515]/30 text-sm font-semibold text-[#b47b00] rounded-lg py-2 px-3 outline-none cursor-pointer hover:bg-[#FDB515]/20 transition-colors">
            <option value="student">{t.roleStudent}</option>
            <option value="admin">{t.roleAdmin}</option>
          </select>
          {role === 'student' && (
            <button onClick={() => setView('records')} className="flex items-center gap-2 bg-[#003262] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#002244] transition-colors shadow-sm">
              <Database size={16} /> <span className="hidden sm:inline">{t.myRecords}</span>
            </button>
          )}
          {role === 'admin' && (
            <button onClick={() => setView('admin')} className="flex items-center gap-2 bg-[#FDB515] text-[#003262] px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#e5a213] transition-colors shadow-sm">
              <ShieldCheck size={16} /> <span className="hidden sm:inline">{t.admin}</span>
            </button>
          )}
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-2 text-[10px] text-slate-400">
        {useFirebase ? t.list.storageMode : t.list.localMode}
      </div>

      <main className="p-4 sm:p-6">
        {view === 'home' && (
          <div className="max-w-5xl mx-auto mb-10">
            <div className="bg-[#003262] rounded-2xl p-6 sm:p-10 md:p-16 text-center shadow-lg relative overflow-hidden border-b-4 border-[#FDB515]">
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-[#FDB515] rounded-full opacity-10 blur-3xl"></div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-6 relative z-10 font-serif tracking-tight leading-tight">{t.heroTitle}</h1>
              <a href="https://corporateinnovation.berkeley.edu/students/business-model-practicum-2026/" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 bg-[#FDB515] text-[#003262] font-bold text-sm px-6 py-2.5 rounded-full hover:bg-yellow-400 transition shadow-md relative z-10"><Globe size={16} /> 柏克萊官網課程介紹</a>
            </div>
          </div>
        )}

        {view === 'home' && <HomeView />}
        {['upload', 'booking', 'question', 'survey'].includes(view) && <DynamicForm type={view} />}
        {view === 'replay' && <ReplayView t={t} />}

        {view === 'records' && role === 'student' && (
          <>
            <h2 className="text-xl sm:text-2xl font-bold text-[#003262] max-w-5xl mx-auto mb-4 sm:mb-6 flex items-center gap-3"><Database className="text-[#FDB515]" /> {t.myRecords}</h2>
            <RecordsView data={submissions.filter(s => s.userId === user?.uid)} isAdmin={false} t={t} lang={lang} />
          </>
        )}

        {view === 'admin' && role === 'admin' && (
          <>
            <h2 className="text-xl sm:text-2xl font-bold text-[#003262] max-w-5xl mx-auto mb-4 sm:mb-6 flex items-center gap-3"><ShieldCheck className="text-[#FDB515]" /> {t.admin}</h2>
            <RecordsView data={submissions} isAdmin={true} t={t} lang={lang} />
          </>
        )}
      </main>

      <footer className="text-center text-slate-400 text-xs mt-12 pb-6">{t.footer}</footer>

      {/* 管理員密碼提示 */}
      {adminPrompt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4" onClick={() => setAdminPrompt(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-[#003262] flex items-center gap-2"><ShieldCheck size={18} /> {t.adminLoginTitle}</h3>
              <button onClick={() => setAdminPrompt(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">{t.adminPassLabel}</label>
            <input type="password" value={adminInput} onChange={e => setAdminInput(e.target.value)} autoFocus
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none mb-4"
              onKeyDown={e => { if (e.key === 'Enter') confirmAdmin(); }} />
            <div className="flex gap-2">
              <button onClick={confirmAdmin} className="flex-1 bg-[#003262] text-white font-bold py-2.5 rounded-lg hover:bg-[#002244]">{t.adminConfirm}</button>
              <button onClick={() => setAdminPrompt(false)} className="flex-1 bg-slate-100 text-slate-600 font-bold py-2.5 rounded-lg hover:bg-slate-200">{t.adminCancel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
