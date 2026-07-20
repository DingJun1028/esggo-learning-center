// ============================================================
// src/data/omnidata.js — User RAG 知識庫（OmniData）
// ============================================================
// 用途：
//   以 Firestore 當作知識庫索引，前端可依使用者/角色檢索相關條目。
//   若未連線 Firebase，則退回本機靜態種子資料，保證可用。

/** @typedef {{ id: string, title: string, body: string, tags: string[], roles: string[], updatedAt: string }} OmniEntry */

const seedEntries = [
  {
    id: 'student_onboarding',
    title: '學員入門指引',
    body: '學員請先完成課程影片觀看，並於每週按時填寫滿意度調查。提問請聚焦「可推進的下一步」與 90 天行動方案。',
    tags: ['student', 'onboarding', 'syllabus'],
    roles: ['student'],
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'mentor_rubric',
    title: 'Mentor 診斷回饋要點',
    body: '回饋請依循：背景限制 -> 90 天優先工作 -> 決策問題 -> 證據與治理 -> 下一步行動。避免直接提供答案，先協助聚焦問題。',
    tags: ['TA', 'rubric', 'feedback'],
    roles: ['TA', 'admin'],
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'admin_ops',
    title: '管理員營運清單',
    body: '管理員每週確認：影片與教材上架狀態、助教配對進度、問卷填寫率、近七日出版紀錄、高優先提問標註。',
    tags: ['admin', 'ops', 'checklist'],
    roles: ['admin'],
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'pairing_basics',
    title: '助教配對原則',
    body: '配對時請參考產業、組織規模與學習目標；student 可查看已接受的配對，mentor 可查看待確認/已接受的 mentee 清單。',
    tags: ['pairing', 'TA', 'student'],
    roles: ['student', 'TA', 'admin'],
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'rag_note',
    title: '知識庫檢索提示',
    body: '請用關鍵字查詢 ESG、治理、資料、90天、impact、responsible ai、portfolio、supply chain 等詞彙，系統會依角色過濾結果。',
    tags: ['rag', 'omnidata', 'search'],
    roles: ['student', 'TA', 'admin'],
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
];

const localKey = 'berkeley_omnidata';

/** Load all entries from localStorage fallback. @returns {OmniEntry[]} */
export const loadLocalOmnidata = () => {
  try {
    return JSON.parse(localStorage.getItem(localKey) || '[]');
  } catch {
    return seedEntries.slice();
  }
};

/** Persist entries into localStorage fallback. @param {OmniEntry[]} entries */
export const saveLocalOmnidata = (entries) => {
  try {
    localStorage.setItem(localKey, JSON.stringify(entries));
  } catch {
    // no-op
  }
};

export { seedEntries };
