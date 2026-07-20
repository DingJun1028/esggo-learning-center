import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  BookOpen, Upload, PlayCircle, CalendarCheck, MessageCircleQuestion, Smile,
  Database, ShieldCheck, ArrowLeft, Send, ChevronDown, ChevronUp, FileText,
  Globe, Search, Download, Trash2, Filter, X, User, Users, Plus, CheckSquare, XSquare, Clock, AlertCircle, Edit3, Save, Home, LogIn, LogOut
} from 'lucide-react';
import {
  useFirebase, initAuth, subscribeSubmissions, addSubmission, deleteSubmission,
  uploadFiles, loadLocal, APP_ID, signInWithGoogle, signOut as authSignOut,
  upsertProfile, getProfile, subscribePairings, createPairingRequest, acceptPairing, declinePairing,
  listPairingsForMentor, listPairingsForMentee, removePairing, PAIRING_STATUS, fetchOracleHealth
} from './db';
import { checkOracleHealth, exportToOracle } from './repositories/oracle.adapter';
import translations from './i18n/translations';

import surveySchema from './schemas/survey';


const ADMIN_PASS = import.meta.env.VITE_ADMIN_PASS || '';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 700 * 1024;

const langCode = (lang) => lang === 'zh-CN' ? 'zh-CN' : lang === 'en' ? 'en' : 'zh-TW';

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

const Field = ({ label, value }) => value ? (
  <div className="mb-2">
    <div className="text-xs font-bold text-slate-400 mb-0.5">{label}</div>
    <div className="text-sm text-slate-700 whitespace-pre-wrap break-words">{value}</div>
  </div>
) : null;

const DetailPanel = ({ item, t }) => {
  const d = item.data || {};
  const atts = d.attachments || [];
  const cd = translations['zh-TW'].cases.details[item.caseId || d.caseId];
  const isEn = item.lang === 'en';
  const dt = t.detail;
  return (
    <div className="text-sm">
      {item.type === 'upload' && (
        <>
          <Field label={dt.note} value={d.desc} />
          {atts.length > 0 ? (<><div className="text-xs font-bold text-slate-400 mb-0.5">{dt.files}</div>{renderFiles(atts)}</>) : <div className="text-xs text-slate-400">{dt.noFiles}</div>}
        </>
      )}
      {item.type === 'booking' && (
        <>
          <Field label={dt.booking.name} value={d.name} />
          <Field label={dt.booking.email} value={d.email} />
          <Field label={dt.booking.time} value={d.time} />
          <Field label={dt.booking.mode} value={d.mode} />
          <Field label={dt.booking.topic} value={d.topic} />
        </>
      )}
      {item.type === 'question' && (
        <>
          <Field label={dt.question.role} value={d.role} />
          <Field label={dt.question.challenge} value={d.challenge} />
          <Field label={dt.question.mainQuestion} value={d.mainQuestion} />
          {atts.length > 0 ? (<><div className="text-xs font-bold text-slate-400 mb-0.5 mt-2">{dt.supplements}</div>{renderFiles(atts)}</>) : null}
        </>
      )}
      {item.type === 'survey' && (
        <>
          <Field label={dt.survey.week} value={d.meta?.week} />
          <Field label={dt.survey.date} value={d.meta?.date} />
          <Field label={dt.survey.theme} value={d.meta?.theme} />
          <Field label={dt.survey.lecturer} value={d.meta?.lecturer} />
          <Field label={dt.survey.name} value={d.meta?.name} />
          <Field label={dt.survey.org} value={d.meta?.org} />
          {d.ratings && Object.keys(d.ratings).length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(d.ratings).map(([q, v]) => (
                <span key={q} className="text-xs bg-[#FDB515]/15 text-[#b47b00] px-2 py-1 rounded font-mono">Q:{q.slice(-1)} = {v}</span>
              ))}
            </div>
          ) : <div className="text-xs text-slate-400 mb-2">{dt.survey.noRatings}</div>}
          <div className="text-xs font-bold text-slate-400 mb-1">{dt.survey.feedback}</div>
          <div className="flex flex-col gap-1 text-sm text-slate-700">
            <div><span className="text-slate-400">1.</span> {d.open?.open_1}</div>
            <div><span className="text-slate-400">2.</span> {d.open?.open_2}</div>
            <div><span className="text-slate-400">3.</span> {d.open?.open_3}</div>
          </div>
          {atts.length > 0 ? (<><div className="text-xs font-bold text-slate-400 mb-0.5 mt-2">{dt.supplements}</div>{renderFiles(atts)}</>) : null}
        </>
      )}
    </div>
  );
};

const AttachmentUploader = ({ value = [], onChange, t }) => {
  const [error, setError] = useState('');
  const handleFiles = (fileList) => {
    const files = Array.from(fileList);
    const tooBig = files.some(f => f.size > MAX_FILE_BYTES);
    if (tooBig) { setError(t.common.attachmentTooBig); return; }
    const total = (value || []).reduce((s, f) => s + (f.size || 0), 0) + files.reduce((s, f) => s + (f.size || 0), 0);
    if (total > MAX_TOTAL_BYTES) { setError(t.common.attachmentTotalTooBig); return; }
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

const ReplayView = ({ t, lang }) => {
  const [videos, setVideos] = useState(null);
  const cleanupRef = useRef(null);
  const REPLAY_SYNC = { ENABLED: true, WEB_APP_URL: import.meta.env.VITE_REPLAY_WEB_APP_URL || '', CACHE_TTL_MS: 5 * 60 * 1000 };
  let __replayCache = null;

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

  useEffect(() => { cleanupRef.current = fetchReplayVideos(setVideos); return () => { if (cleanupRef.current) cleanupRef.current(); }; }, []);

  const DEFAULT_REPLAY_VIDEOS = [
    { id: 'REPLACE_WITH_DRIVE_FILE_ID_1', week: t.replay.altWeek.replace('{n}', '1'), title: t.replay.altWeek.replace('{n}', '1') + ' ' + (lang === 'en' ? 'Lesson overview' : '課程主題一（範例）'), date: '2026-01-10' },
    { id: 'REPLACE_WITH_DRIVE_FILE_ID_2', week: t.replay.altWeek.replace('{n}', '2'), title: t.replay.altWeek.replace('{n}', '2') + ' ' + (lang === 'en' ? 'Lesson overview' : '課程主題二（範例）'), date: '2026-01-17' },
  ];
  const hasVideos = Array.isArray(videos) && videos.length > 0;
  return (
    <div className="max-w-4xl mx-auto" onContextMenu={(e) => e.preventDefault()}>
      <h2 className="text-xl sm:text-2xl font-bold text-[#003262] mb-4 sm:mb-6 flex items-center gap-3"><PlayCircle className="text-[#FDB515]" /> {t.replay.title}</h2>
      {videos === null ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-10 text-center text-slate-400">{t.common.loading}</div>
      ) : !hasVideos ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-10 text-center text-slate-500">{t.replay.empty}</div>
      ) : (
        <div className="flex flex-col gap-6">
          {(MockReplayVideos(videos, lang)).map((v) => {
            const isPlaceholder = !v.id || v.id.startsWith('REPLACE_');
            return (
              <section key={v.id || v.title} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden select-none">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold text-[#b47b00] bg-[#FDB515]/20 px-2 py-0.5 rounded">{v.week}</span>
                      <span className="text-xs text-slate-400">{t.common.uploadedOn} {v.date}</span>
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-[#003262] truncate">{v.title}</h3>
                  </div>
                </div>
                <div className="relative bg-black">
                  {isPlaceholder ? (
                    <div className="aspect-video flex items-center justify-center text-slate-400 text-sm px-4 text-center">{t.common.randomIdHint}</div>
                  ) : (
                    <iframe src={`https://drive.google.com/file/d/${v.id}/preview`} className="w-full aspect-video" allow="autoplay" title={v.title} />
                  )}
                  <div className="absolute bottom-2 right-3 text-white/60 text-xs pointer-events-none select-none">{t.brandName} · {t.common.videoWatermarkVideoOnly}</div>
                </div>
              </section>
            );
          })}
        </div>
      )}
      <p className="mt-6 text-xs text-slate-400 leading-relaxed">{t.common.replayCopyright}</p>
    </div>
  );
};
const MockReplayVideos = (videos, lang) => videos.map(v => (typeof v.title === 'string' && v.title.includes('範例') || (lang !== 'en' && !v.title.includes('Lesson')) ? v : v));

const toCsvCell = (s) => `"${(String(s == null ? '' : s).replace(/"/g, '""')).replace(/[\\n\\r]+/g, ' ')}"`;
const flattenDetail = (item) => {
  const d = item.data || {};
  const type = item.type || '';
  if (type === 'upload') return { note: d.desc, files: (d.attachments || []).map(a => `${a.name}${a.url ? `(${a.url})` : ''}`).join('; ') };
  if (type === 'booking') return { name: d.name, email: d.email, time: d.time, topic: d.topic, mode: d.mode };
  if (type === 'question') return { role: d.role, challenge: d.challenge, question: d.mainQuestion, files: (d.attachments || []).map(a => `${a.name}${a.url ? `(${a.url})` : ''}`).join('; ') };
  if (type === 'survey') {
    const ratings = d.ratings ? Object.entries(d.ratings).map(([q, v]) => `${q}=${v}`).join(' ') : '';
    return { week: d.meta?.week, date: d.meta?.date, theme: d.meta?.theme, lecturer: d.meta?.lecturer, name: d.meta?.name, org: d.meta?.org, ratings, open1: d.open?.open_1, open2: d.open?.open_2, open3: d.open?.open_3, files: (d.attachments || []).map(a => `${a.name}${a.url ? `(${a.url})` : ''}`).join('; ') };
  }
  return {};
};
const exportCsv = (items, t, lang) => {
  const flatCols = ['note', 'date', 'time', 'topic', 'role', 'challenge', 'question', 'week', 'theme', 'lecturer', 'name', 'org', 'ratings', 'open1', 'open2', 'open3', 'files'];
  const headers = ['id', 'type', 'userId', 'createdAt', ...flatCols];
  const rows = items.map(it => {
    const f = flattenDetail(it);
    return [it.id, t.types[it.type] || it.type, it.userId, it.createdAt, ...flatCols.map(c => f[c] || '')];
  });
  const csv = [headers, ...rows].map(r => r.map(toCsvCell).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `submissions_${lang}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const PairingView = ({ data, isMentor, t, currentUser }) => {
  const [tab, setTab] = useState('mine');
  const list = Array.isArray(data) ? data : [];
  const mine = list.filter((item) => item.mentorUid === currentUser?.uid || item.menteeUid === currentUser?.uid);
  const display = tab === 'mine' ? mine : list;

  const request = async () => {
    const prompt = t.pairing.assignMentor || '請輸入助教/學員 ID';
    const input = window.prompt(prompt);
    if (!input || !currentUser?.uid) return;
    await createPairingRequest(currentUser.uid, input.trim());
    alert(t.pairing.createdSuccess);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setTab('mine')} className={`px-3 py-2 rounded-lg text-sm font-bold ${tab === 'mine' ? 'bg-[#003262] text-white' : 'bg-slate-100 text-slate-700'}`}>{t.pairings.myPairings}</button>
        {isMentor && <button onClick={() => setTab('all')} className={`px-3 py-2 rounded-lg text-sm font-bold ${tab === 'all' ? 'bg-[#003262] text-white' : 'bg-slate-100 text-slate-700'}`}>{t.pairings.viewAll}</button>}
      </div>
      {display.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-8 text-center text-slate-500">{t.pairings.empty}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {display.map((item) => {
            const isMe = item.mentorUid === currentUser?.uid;
            return (
              <div key={item.id || `${item.mentorUid}-${item.menteeUid}`} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-[#003262]">#{item.id ? item.id.slice(-6) : ''}</div>
                  <div className="text-xs text-slate-500">{t.pairings.mentorId}: {item.mentorUid?.slice(0, 8)} · {t.pairings.menteeId}: {item.menteeUid?.slice(0, 8)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={"text-xs font-semibold px-2 py-1 rounded " + (item.status === PAIRING_STATUS.ASSIGNED ? 'bg-green-100 text-green-700' : item.status === PAIRING_STATUS.DECLINED ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700')}>{(item.status === PAIRING_STATUS.ASSIGNED && t.pairings.statusAssigned) || (item.status === PAIRING_STATUS.DECLINED && t.pairings.statusDeclined) || (item.status === PAIRING_STATUS.PENDING && t.pairings.statusPending) || item.status}</span>
                  {isMe && item.status === PAIRING_STATUS.PENDING && (
                    <div className="flex gap-2">
                      <button onClick={async () => { await acceptPairing(item.mentorUid, item.menteeUid); alert(t.pairings.updatedSuccess); }} className="text-xs bg-[#003262] text-white px-3 py-1.5 rounded-lg">{t.pairings.actionApprove}</button>
                      <button onClick={async () => { await declinePairing(item.mentorUid, item.menteeUid); alert(t.pairings.updatedSuccess); }} className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg">{t.pairings.actionDecline}</button>
                    </div>
                  )}
                  {isMe && (
                    <button onClick={async () => { if (window.confirm(t.list.confirmDelete)) { await removePairing(item.mentorUid, item.menteeUid); alert(t.pairings.removedSuccess); } }} className="text-xs text-red-500 hover:text-red-700">{t.pairings.removeMentor}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {isMentor && (
        <div className="mt-4">
          <button onClick={request} className="flex items-center gap-2 bg-[#003262] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#002244] transition-colors"><Plus size={16} /> {t.pairings.create}</button>
        </div>
      )}
    </div>
  );
};

const ProfileSetupModal = ({ open, onClose, user, lang = 'zh-TW' }) => {
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [role, setRole] = useState('student');
  const t = translations[langCode(lang)];
  if (!open || !user) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[#003262] flex items-center gap-2"><User size={18} /> {t.auth.setupProfile}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">{t.auth.displayName}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3 border rounded-lg outline-none" placeholder={t.auth.displayName} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">{t.auth.email}</label>
            <input value={user?.email || ''} disabled className="w-full p-3 border rounded-lg bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">{t.auth.org}</label>
            <input value={org} onChange={(e) => setOrg(e.target.value)} className="w-full p-3 border rounded-lg outline-none" placeholder={t.auth.org} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">{t.auth.role}</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full p-3 border rounded-lg bg-white outline-none">
              <option value="student">{t.roleStudent}</option>
              <option value="mentor">{t.roleMentor}</option>
            </select>
          </div>
          <button onClick={async () => {
            if (!name.trim()) { alert(t.auth.displayName + ' 為必填'); return; }
            const profile = { ...(userProfile || {}), displayName: name.trim(), email: user?.email || '', org: org.trim(), role };
            setUserProfile(profile);
            setProfileSetupOpen(false);
            await upsertProfile(user.uid, profile);
          }} className="w-full bg-[#003262] text-white font-bold py-3 rounded-lg hover:bg-[#002244] transition-colors">{t.auth.saveAndContinue}</button>
        </div>
      </div>
    </div>
  );
};

const AdminLoginModal = ({ open, onClose, onLogin }) => {
  const [input, setInput] = useState('');
  const t = translations[langCode('zh-TW')];
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[#003262] flex items-center gap-2"><ShieldCheck size={18} /> {t.admin.loginTitle}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">{t.admin.loginPassword}</label>
        <input type="password" value={input} onChange={(e) => setInput(e.target.value)} autoFocus
          className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none mb-4"
          onKeyDown={(e) => { if (e.key === 'Enter') onLogin(input); }} />
        <div className="flex gap-2">
          <button onClick={() => onLogin(input)} className="flex-1 bg-[#003262] text-white font-bold py-2.5 rounded-lg hover:bg-[#002244]">{t.admin.loginEnter}</button>
          <button onClick={onClose} className="flex-1 bg-slate-100 text-slate-600 font-bold py-2.5 rounded-lg hover:bg-slate-200">{t.admin.loginCancel}</button>
        </div>
      </div>
    </div>
  );
};

const RecordsView = ({ data, isAdmin, t, lang, role }) => {
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [openId, setOpenId] = useState(null);

  const filtered = useMemo(() => {
    const q0 = q.trim().toLowerCase();
    return data.filter(it => {
      if (type !== 'all' && it.type !== type) return false;
      const dt = new Date(it.createdAt);
      if (from && dt < new Date(from + 'T00:00:00')) return false;
      if (to && dt > new Date(to + 'T23:59:59')) return false;
      if (q0) {
        const hay = `${it.userId} ${JSON.stringify(it.data || {})}`.toLowerCase();
        if (!hay.includes(q0)) return false;
      }
      return true;
    });
  }, [data, q, type, from, to]);

  const exportWithOracle = async () => {
    try {
      const health = await checkOracleHealth();
      if (!health.enabled || !health.healthy) {
        alert((t?.oracle?.disabled || 'Oracle 已關閉 / 未設定') + '\n' + (health?.reason || ''));
        exportCsv(filtered, t, lang || 'zh-TW');
        return;
      }
      const result = await exportToOracle(filtered, lang || 'zh-TW');
      alert((t?.oracle?.enabled || '已啟用') + '\n' + JSON.stringify(result || {}));
      exportCsv(filtered, t, lang || 'zh-TW');
    } catch (error) {
      alert((t?.oracle?.disabled || 'Oracle 已關閉 / 未設定') + '\n' + (error?.message || String(error)));
      exportCsv(filtered, t, lang || 'zh-TW');
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-2 text-[#003262]"><Filter size={16} /><span className="text-sm font-bold">{t.list.filters}</span></div>
          <select value={type} onChange={(e) => setType(e.target.value)} className="bg-slate-100 border-none text-sm rounded-lg py-2 px-3 outline-none cursor-pointer">
            <option value="all">{t.list.all}</option>
            <option value="upload">{t.types.upload}</option>
            <option value="booking">{t.types.booking}</option>
            <option value="question">{t.types.question}</option>
            <option value="survey">{t.types.survey}</option>
          </select>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <span>{t.list.from}</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-2 py-1" />
            <span>{t.list.to}</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-2 py-1" />
          </div>
          <button onClick={() => { setQ(''); setType('all'); setFrom(''); setTo(''); }} className="text-xs text-slate-500 hover:text-[#003262] underline">{t.list.reset}</button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 flex-1 min-w-[200px]">
            <Search size={16} className="text-slate-400 shrink-0" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.list.search} className="bg-transparent outline-none text-sm w-full" />
          </div>
          {isAdmin && (
            <button onClick={exportWithOracle} className="flex items-center gap-2 bg-[#003262] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#002244] transition-colors">
              <Download size={16} /> {t.list.export}
            </button>
          )}
        </div>
        <div className="text-xs text-slate-400">{filtered.length} {t.list.count.replace('{n}', filtered.length) || `筆`}</div>
      </div>
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-8 text-center text-slate-500">{t.list.noResults}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(item => {
            const open = openId === item.id;
            const itemLang = item.data?.lang || 'zh-TW';
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
                    <div className="py-3">{isAdmin && <div className="text-xs font-mono text-slate-400 mb-2">{t.list.idLabel.replace('{id}', item.id).replace('{userId}', item.userId)}</div>}</div>
                    <div lang={itemLang}><DetailPanel item={{ ...item, lang: itemLang, caseId: item.data?.caseId }} t={translations[langCode(itemLang)]} /></div>
                    {item.type === 'survey' && (
                      <div className="mt-3">
                        <div className="font-bold text-[#003262] mb-1 border-b-2 border-[#003262] inline-block pr-2">{translations[langCode(itemLang)]?.survey[`sec${(item.data?.sectionId || '1')}`] || ''}</div>
                      </div>
                    )}
                    {isAdmin && (
                      <button onClick={() => { if (window.confirm(t.list.confirmDelete)) deleteSubmission(item.id); }}
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
  const [role, setRole] = useState('student');
  const [adminOk, setAdminOk] = useState(false);
  const [adminPrompt, setAdminPrompt] = useState(false);
  const [adminInput, setAdminInput] = useState('');
  const [adminTab, setAdminTab] = useState('records');
  const [studentTab, setStudentTab] = useState('home');
  const [userProfile, setUserProfile] = useState(null);
  const [profileSetupOpen, setProfileSetupOpen] = useState(false);
  const [pairings, setPairings] = useState([]);
  const [oracleStatus, setOracleStatus] = useState({ enabled: false, healthy: false, reason: 'NONE' });
  const [supabaseStatus, setSupabaseStatus] = useState({ enabled: false, healthy: false, reason: 'NONE' });
  const [checkinForm, setCheckinForm] = useState({ name: '', status: 'present', note: '' });
  const t = translations[langCode(lang)];

  useEffect(() => {
    const unsub = initAuth((u) => setUser(u));
    return () => { if (unsub) unsub(); };
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeSubmissions(user.uid, setSubmissions);
    return () => { if (unsub) unsub(); };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const profile = await getProfile(user.uid);
      if (profile) { setUserProfile(profile); setProfileSetupOpen(false); }
      else setProfileSetupOpen(true);
    })();
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const status = await checkOracleHealth();
      if (!cancelled) setOracleStatus(status ?? { enabled: false, healthy: false, reason: 'EMPTY' });
    };
    run();
    const timer = setInterval(run, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!user || (role !== 'mentor' && role !== 'admin')) return;
    const unsub = subscribePairings(setPairings);
    return () => { if (unsub) unsub(); };
  }, [user, role]);

  const trySwitchRole = (next) => {
    if (next === 'admin') {
      if (adminOk) { setRole('admin'); setView('admin'); return; }
      setAdminPrompt(true);
      return;
    }
    if (next === 'mentor') {
      if (!user || user.isLocal) { alert(t.auth.signInRequired); return; }
      if (!userProfile?.displayName) {
        setProfileSetupOpen(true);
        alert(t.auth.profileRequired);
        return;
      }
      setRole('mentor'); setView('pairings'); return;
    }
    setRole('student'); setView('home');
  };
  const confirmAdmin = (value) => {
    const input = typeof value === 'string' ? value : adminInput;
    if (!ADMIN_PASS || input === ADMIN_PASS) { setAdminOk(true); setRole('admin'); setView('admin'); }
    else alert(t.error.adminWrongPassword);
    setAdminPrompt(false); setAdminInput('');
  };

  const handleSubmit = async (e, type, formData) => {
    e.preventDefault();
    if (!user) return;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn?.innerText || '';
    if (btn) { btn.innerText = t.saving; btn.disabled = true; }
    try {
      const docId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      const files = formData.files || formData.attachments || [];
      const atts = await uploadFiles(files);
      const payload = { userId: user.uid, type, data: { ...formData, lang } };
      if (type === 'booking' && userProfile?.role === 'mentor') {
        payload.data.mentorName = userProfile.displayName || user.email || '';
      }
      await addSubmission(payload, atts, docId);
      alert(t.success);
      setView(role === 'admin' ? 'admin' : 'records');
    } catch (err) {
      console.error(err);
      alert(t.error.generic);
    } finally {
      if (btn) { btn.innerText = originalText; btn.disabled = false; }
    }
  };

  const HomeView = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-5xl mx-auto">
      <a href="https://drive.google.com/drive/folders/1-ZOC6sPNGISeD7Rf6lYT3Q10yYZaTdAy?usp=sharing" target="_blank" rel="noreferrer"
        className="bg-white p-5 sm:p-6 rounded-2xl border-2 border-[#003262] shadow-sm hover:shadow-md transition-all flex flex-col items-center justify-center gap-4 group cursor-pointer min-h-[130px] sm:min-h-[160px] tap-target">
        <div className="border-2 border-[#003262] bg-white text-[#003262] p-4 rounded-full group-hover:bg-[#003262] group-hover:text-white transition-colors"><BookOpen size={32} /></div>
        <h3 className="text-lg font-bold text-[#003262]">{t.f1}</h3>
      </a>
      <div onClick={() => setView('upload')} className="bg-white p-5 sm:p-6 rounded-2xl border-2 border-[#003262] shadow-sm hover:shadow-md transition-all flex flex-col items-center justify-center gap-4 group cursor-pointer min-h-[130px] sm:min-h-[160px] tap-target">
        <div className="border-2 border-[#003262] bg-white text-[#003262] p-4 rounded-full group-hover:bg-[#003262] group-hover:text-white transition-colors"><Upload size={32} /></div>
        <h3 className="text-lg font-bold text-[#003262]">{t.f2}</h3>
      </div>
      <div onClick={() => setView('replay')} className="bg-white p-5 sm:p-6 rounded-2xl border-2 border-[#003262] shadow-sm hover:shadow-md transition-all flex flex-col items-center justify-center gap-4 group cursor-pointer min-h-[130px] sm:min-h-[160px] tap-target">
        <div className="border-2 border-[#003262] bg-white text-[#003262] p-4 rounded-full group-hover:bg-[#003262] group-hover:text-white transition-colors"><PlayCircle size={32} /></div>
        <h3 className="text-lg font-bold text-[#003262]">{t.f3}</h3>
      </div>
      <div onClick={() => setView('booking')} className="bg-white p-5 sm:p-6 rounded-2xl border-2 border-[#003262] shadow-sm hover:shadow-md transition-all flex flex-col items-center justify-center gap-4 group cursor-pointer min-h-[130px] sm:min-h-[160px] tap-target">
        <div className="border-2 border-[#003262] bg-white text-[#003262] p-4 rounded-full group-hover:bg-[#003262] group-hover:text-white transition-colors"><CalendarCheck size={32} /></div>
        <h3 className="text-lg font-bold text-[#003262]">{t.f4}</h3>
      </div>
      <div onClick={() => setView('question')} className="bg-white p-5 sm:p-6 rounded-2xl border-2 border-[#003262] shadow-sm hover:shadow-md transition-all flex flex-col items-center justify-center gap-4 group cursor-pointer min-h-[130px] sm:min-h-[160px] tap-target">
        <div className="border-2 border-[#003262] bg-white text-[#003262] p-4 rounded-full group-hover:bg-[#003262] group-hover:text-white transition-colors"><MessageCircleQuestion size={32} /></div>
        <h3 className="text-lg font-bold text-[#003262]">{t.f5}</h3>
      </div>
      <div onClick={() => setView('mentors')} className="bg-white p-5 sm:p-6 rounded-2xl border-2 border-[#003262] shadow-sm hover:shadow-md transition-all flex flex-col items-center justify-center gap-4 group cursor-pointer min-h-[130px] sm:min-h-[160px] tap-target">
        <div className="border-2 border-[#003262] bg-white text-[#003262] p-4 rounded-full group-hover:bg-[#003262] group-hover:text-white transition-colors"><Users size={32} /></div>
        <h3 className="text-lg font-bold text-[#003262]">{t.menu?.mentorsTitle || 'Mentor 介绍'}</h3>
      </div>
      <div onClick={() => setView('survey')} className="bg-white p-5 sm:p-6 rounded-2xl border-2 border-[#003262] shadow-sm hover:shadow-md transition-all flex flex-col items-center justify-center gap-4 group cursor-pointer min-h-[130px] sm:min-h-[160px] tap-target">
        <div className="border-2 border-[#003262] bg-white text-[#003262] p-4 rounded-full group-hover:bg-[#003262] group-hover:text-white transition-colors"><Smile size={32} /></div>
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
          <button onClick={() => setTab('write')} className={`pb-3 px-3 sm:px-6 font-bold text-base sm:text-lg ${tab === 'write' ? 'border-b-2 border-[#FDB515] text-[#003262]' : 'text-slate-400 hover:text-slate-600'}`}>{t.question.tabWrite}</button>
          <button onClick={() => setTab('cases')} className={`pb-3 px-3 sm:px-6 font-bold text-base sm:text-lg flex items-center gap-2 ${tab === 'cases' ? 'border-b-2 border-[#FDB515] text-[#003262]' : 'text-slate-400 hover:text-slate-600'}`}><FileText size={18} /> {t.question.tabCases}</button>
        </div>
        {tab === 'write' ? (
          <form onSubmit={(e) => handleSubmit(e, 'question', formData)} className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{t.question.fieldRole}</label>
              <input required type="text" onChange={(e) => setFormData({ ...formData, role: e.target.value })} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none" placeholder={t.question.fieldRolePlaceholder} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{t.question.fieldChallenge}</label>
              <input required type="text" onChange={(e) => setFormData({ ...formData, challenge: e.target.value })} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none" placeholder={t.question.fieldChallengePlaceholder} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{t.question.fieldMainQuestion}</label>
              <textarea required onChange={(e) => setFormData({ ...formData, mainQuestion: e.target.value })} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none h-32" placeholder={t.question.fieldMainQuestionPlaceholder}></textarea>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">補充檔案 <span className="text-slate-400 font-normal">{t.common.optional}</span></label>
              <AttachmentUploader value={formData.attachments} onChange={(files) => setFormData({ ...formData, attachments: files })} t={t} />
            </div>
            <button type="submit" className="mt-4 bg-[#003262] text-white font-bold py-3 rounded-lg hover:bg-[#002244] transition-colors flex items-center justify-center gap-2"><Send size={18} /> {t.submit}</button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-500 mb-2">{t.question.casesHelpText}</p>
            {mockCases.map((c) => {
              const localized = t.cases.list.find(x => x.id === c.id);
              const isOpen = openCase === c.id;
              return (
              <div key={c.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <button onClick={() => setOpenCase(isOpen ? null : c.id)} className="w-full bg-slate-50 p-4 text-left flex justify-between items-center hover:bg-slate-100 transition-colors">
                  <div><h4 className="font-bold text-[#003262]">{localized?.title || c.title}</h4><p className="text-xs text-slate-500 mt-1">{localized?.desc || c.desc}</p></div>
                  {isOpen ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                </button>
                {isOpen && t.cases.details[c.id] ? (
                  <div className="p-5 border-t border-slate-200 bg-white space-y-3 text-sm text-slate-700">
                    <div>
                      <h4 className="font-bold text-[#003262] border-b pb-2">{t.cases.details[c.id].part1Title}</h4>
                      <div className="mt-2 space-y-1">
                        <div><span className="text-xs font-bold text-slate-400">{t.cases.details[c.id].roleLabel}:</span> {t.cases.details[c.id].roleValue}</div>
                        <div><span className="text-xs font-bold text-slate-400">{t.cases.details[c.id].industryLabel}:</span> {t.cases.details[c.id].industryValue}</div>
                        <div><span className="text-xs font-bold text-slate-400">{t.cases.details[c.id].statusLabel}:</span> {t.cases.details[c.id].statusValue}</div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-bold text-[#003262] border-b pb-2 mt-4">{t.cases.details[c.id].part4Title}</h4>
                      <p className="text-sm bg-slate-50 p-3 rounded border border-slate-200 mt-2">{t.cases.details[c.id].questionValue}</p>
                    </div>
                    <div>
                      <h4 className="font-bold text-[#003262] border-b pb-2 mt-4">{t.cases.details[c.id].part6Title}</h4>
                      <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>{t.cases.details[c.id].output1}</li>
                        <li>{t.cases.details[c.id].output2}</li>
                        <li>{t.cases.details[c.id].output3}</li>
                      </ul>
                    </div>
                    <div className="bg-[#FDB515]/10 p-3 rounded mt-4">
                      <div className="font-bold text-[#003262]">{t.cases.details[c.id].whyTitle}</div>
                      <div className="text-sm text-[#003262] mt-1">{t.cases.details[c.id].whyBody}</div>
                    </div>
                  </div>
                ) : null}
              </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const SurveyForm = ({ t }) => {
    const [formData, setFormData] = useState({ meta: {}, ratings: {}, open: {}, attachments: [] });
    const handleRating = (qId, val) => setFormData((prev) => ({ ...prev, ratings: { ...prev.ratings, [qId]: val } }));
    const handleMeta = (field, val) => setFormData((prev) => ({ ...prev, meta: { ...prev.meta, [field]: val } }));
    const handleOpen = (field, val) => setFormData((prev) => ({ ...prev, open: { ...prev.open, [field]: val } }));
    const missing = surveySchema.some((sec) => !sec.questions.every((q) => formData.ratings[q.id]));
    const submit = (e) => {
      if (missing) { alert(t.survey.msgCompleteRating); return; }
      handleSubmit(e, 'survey', { ...formData, sectionId: '1' });
    };

    return (
      <div className="max-w-4xl mx-auto bg-white p-5 sm:p-8 rounded-xl shadow-sm border border-slate-100">
        <h2 className="text-2xl font-bold text-[#003262] mb-2 text-center">{t.survey.title}</h2>
        <p className="text-sm text-slate-500 text-center mb-8">{t.survey.subtitle}</p>
        <form onSubmit={submit} className="flex flex-col gap-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 bg-slate-50 p-4 sm:p-5 rounded-lg border border-slate-200">
            <div><label className="block text-xs font-bold text-slate-500 mb-1">{t.survey.meta.week}</label><input required onChange={(e) => handleMeta('week', e.target.value)} type="text" className="w-full p-2 border rounded outline-none" placeholder={lang === 'en' ? 'e.g., Week 1' : '例如：第 1 週'} /></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">{t.survey.meta.date}</label><input required onChange={(e) => handleMeta('date', e.target.value)} type="date" className="w-full p-2 border rounded outline-none" /></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">{t.survey.meta.theme}</label><input required onChange={(e) => handleMeta('theme', e.target.value)} type="text" className="w-full p-2 border rounded outline-none" /></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">{t.survey.meta.lecturer}</label><input required onChange={(e) => handleMeta('lecturer', e.target.value)} type="text" className="w-full p-2 border rounded outline-none" /></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">{t.survey.meta.name} {t.common.optional}</label><input onChange={(e) => handleMeta('name', e.target.value)} type="text" className="w-full p-2 border rounded outline-none" /></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">{t.survey.meta.org} {t.common.optional}</label><input onChange={(e) => handleMeta('org', e.target.value)} type="text" className="w-full p-2 border rounded outline-none" /></div>
          </div>
          <div className="text-sm text-[#003262] font-semibold bg-[#FDB515]/20 p-3 rounded-md text-center">{t.survey.ratingScale}</div>
          {surveySchema.map((sec) => {
            const sectionTitle = t.survey[sec.id] || sec.title;
            return (
            <div key={sec.id}>
              <h3 className="font-bold text-[#003262] mb-3 border-b-2 border-[#003262] pb-2 inline-block">{sectionTitle}</h3>
              <div className="overflow-x-auto md:overflow-visible">
                <table className="hidden md:table w-full text-sm border-collapse">
                  <thead><tr className="bg-slate-100 text-slate-600">
                    <th className="p-3 text-left font-semibold border-b border-slate-200 border-l-4 border-transparent">{t.table.details}</th>
                    {[1, 2, 3, 4, 5].map((v) => <th key={v} className="p-3 text-center w-12 font-semibold border-b border-slate-200">{v}</th>)}
                  </tr></thead>
                  <tbody>{sec.questions.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-50 border-b border-slate-100 transition-colors">
                      <td className="p-3 text-slate-700">{t.survey.questions[q.id] || q.text}</td>
                      {[1, 2, 3, 4, 5].map((val) => (
                        <td key={val} className="p-3 text-center align-middle">
                          <input type="radio" name={q.id} value={val} required onChange={() => handleRating(q.id, val)} className="w-5 h-5 text-[#003262] cursor-pointer" />
                        </td>
                      ))}
                    </tr>
                  ))}</tbody>
                </table>
                <div className="md:hidden flex flex-col gap-3">
                  {sec.questions.map((q) => (
                    <div key={q.id} className="border border-slate-200 rounded-lg p-3 bg-white">
                      <p className="text-sm text-slate-700 mb-3 leading-relaxed">{t.survey.questions[q.id] || q.text}</p>
                      <div className="flex justify-between items-center bg-slate-50 rounded-lg p-1">
                        {[1, 2, 3, 4, 5].map((val) => (
                          <label key={val} className="flex-1 flex flex-col items-center gap-1 py-2 cursor-pointer tap-target">
                            <input type="radio" name={q.id} value={val} required onChange={() => handleRating(q.id, val)} className="w-5 h-5 text-[#003262] cursor-pointer accent-[#003262]" />
                            <span className="text-xs font-semibold text-slate-500">{val}</span>
                          </label>
                        ))}
                      </div>
                      {formData.ratings[q.id] && <div className="text-xs text-[#003262] mt-2 text-center font-medium">{t.common.yes} {formData.ratings[q.id]} {lang === 'en' ? '' : '分'}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            );
          })}
          <div>
            <h3 className="font-bold text-[#003262] mb-3 border-b-2 border-[#003262] pb-2 inline-block">{t.survey.openFeedback.title}</h3>
            <div className="space-y-5">
              <div><label className="block text-sm font-semibold text-slate-700 mb-2">1. {t.survey.openFeedback.q1}</label><textarea required onChange={(e) => handleOpen('open_1', e.target.value)} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none h-24 resize-none"></textarea></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-2">2. {t.survey.openFeedback.q2}</label><textarea required onChange={(e) => handleOpen('open_2', e.target.value)} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none h-24 resize-none"></textarea></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-2">3. {t.survey.openFeedback.q3}</label><textarea required onChange={(e) => handleOpen('open_3', e.target.value)} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none h-24 resize-none"></textarea></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1">{t.common.attachmentLabel || '補充檔案'} <span className="text-slate-400 font-normal">{t.common.optionalWithLimit}</span></label><AttachmentUploader value={formData.attachments} onChange={(files) => setFormData({ ...formData, attachments: files })} t={t} /></div>
            </div>
          </div>
          <button type="submit" className="mt-4 bg-[#003262] text-white font-bold py-4 rounded-lg hover:bg-[#002244] shadow-md transition-all flex items-center justify-center gap-2 text-lg"><Send size={20} /> {t.survey.submitButton}</button>
        </form>
      </div>
    );
  };

  const DynamicForm = ({ type: viewType }) => {
    if (viewType === 'question') return <QuestionForm />;
    if (viewType === 'survey') return <SurveyForm t={t} />;
    const bookingUrl = import.meta.env.VITE_BOOKING_URL || '';
    const baseConfig = t.forms[viewType] || {};
    if (viewType === 'upload') {
      const [formData, setFormData] = useState({});
      return (
        <div className="max-w-2xl mx-auto bg-white p-5 sm:p-8 rounded-xl shadow-sm border border-slate-100">
          <h2 className="text-2xl font-bold text-[#003262] mb-6 flex items-center gap-3">{baseConfig.title}</h2>
          <form onSubmit={(e) => handleSubmit(e, viewType, formData)} className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{baseConfig.file}</label>
              <AttachmentUploader value={formData.files} onChange={(files) => setFormData({ ...formData, files })} t={t} />
            </div>
            <div><label className="block text-sm font-semibold text-slate-700 mb-1">{baseConfig.desc}</label><textarea onChange={(e) => setFormData({ ...formData, desc: e.target.value })} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none h-32" placeholder={t.common.optional}></textarea></div>
            <button type="submit" className="mt-4 bg-[#003262] text-white font-bold py-3 rounded-lg hover:bg-[#002244] transition-colors flex items-center justify-center gap-2"><Send size={18} /> {t.submit}</button>
          </form>
        </div>
      );
    }

    if (viewType === 'booking') {
      const slots = t.forms.booking.slots || [];
      const [email, setEmail] = useState('');
      const [name, setName] = useState('');
      const [slot, setSlot] = useState('');
      const [topic, setTopic] = useState('');
      const mode = t.forms.booking.virtual;
      const [errors, setErrors] = useState({});

      const validate = () => {
        const e = {};
        if (!name.trim()) e.name = t.common.required;
        if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = t.common.required;
        if (!slot) e.slot = t.common.required;
        setErrors(e);
        return Object.keys(e).length === 0;
      };

      return (
        <div className="max-w-4xl mx-auto bg-white p-5 sm:p-8 rounded-xl shadow-sm border border-slate-100">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-[#003262] mb-2">{baseConfig.title}</h2>
            <p className="text-sm text-slate-500 leading-relaxed">{baseConfig.noteText ?? baseConfig.noteTextBare ?? ''}</p>
          </div>
          <div className="max-w-3xl mx-auto">
            <form onSubmit={(e) => {
              if (!validate()) return;
              handleSubmit(e, 'booking', { email, name, time: slot, topic, mode, lang });
            }} className="flex flex-col gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{baseConfig.date} <span className="text-red-500">{t.common.yes}</span></label>
                <input required type="text" value={name} onChange={(e) => setName(e.target.value)} className={`w-full p-3 border rounded-lg outline-none ${errors.name ? 'border-red-400' : ''}`} placeholder={baseConfig.namePlaceholder} />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{baseConfig.email} <span className="text-red-500">{t.common.yes}</span></label>
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`w-full p-3 border rounded-lg outline-none ${errors.email ? 'border-red-400' : ''}`} placeholder={baseConfig.emailPlaceholder} />
                <p className="text-[10px] text-slate-400 mt-1">{baseConfig.emailPlaceholder}</p>
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{baseConfig.time} <span className="text-red-500">{t.common.yes}</span></label>
                <select required value={slot} onChange={(e) => setSlot(e.target.value)} className={`w-full p-3 border rounded-lg outline-none bg-white ${errors.slot ? 'border-red-400' : ''}`}>
                  <option value="">{t.common.selectPlaceholder}</option>
                  {slots.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {errors.slot && <p className="text-xs text-red-500 mt-1">{errors.slot}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{baseConfig.description}</label>
                <div className="flex flex-wrap gap-3 text-sm text-slate-700 mb-2">
                  <span className="inline-flex items-center gap-2 border border-[#003262] bg-white rounded-lg px-3 py-2">
                    <span className="font-semibold">{mode}</span>
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{baseConfig.topic}</label>
                <textarea value={topic} onChange={(e) => setTopic(e.target.value)} className="w-full p-3 border rounded-lg outline-none h-28 resize-none" placeholder={baseConfig.topicPlaceholder}></textarea>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                {baseConfig.noteText}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setView('home')} className="sm:w-auto w-full whitespace-nowrap inline-flex items-center justify-center gap-2 bg-slate-100 text-slate-700 font-bold py-3 px-6 rounded-lg hover:bg-slate-200 transition-colors">{t.forms.back}</button>
                <button type="submit" className="sm:w-auto w-full whitespace-nowrap inline-flex items-center justify-center gap-2 bg-[#003262] text-white font-bold py-3 px-6 rounded-lg hover:bg-[#002244] transition-colors shadow-sm"><Send size={18} /> {baseConfig.cta}</button>
              </div>
            </form>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20">
      <nav className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap justify-between items-center gap-2 sm:gap-4 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <a href="https://www.imagebam.com/view/ME18KXOM" target="_blank" rel="noreferrer" className="block">
            <span className="inline-flex w-10 h-10 items-center justify-center rounded-lg shadow-md bg-[#003262] text-white font-extrabold leading-none" aria-label={t.header.logoAriaLabel}>B</span>
          </a>
          {view !== 'home' && (
            <button onClick={() => setView('home')} className="text-sm font-bold text-slate-500 hover:text-[#003262] flex items-center gap-1 transition-colors bg-slate-100 px-3 py-1.5 rounded-md hover:bg-slate-200">
              <ArrowLeft size={16} /> {t.back}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
          <select value={lang} onChange={(e) => setLang(e.target.value)} className="bg-slate-100 border-none text-sm font-semibold text-[#003262] rounded-lg py-2 pl-3 pr-8 outline-none cursor-pointer hover:bg-slate-200 transition-colors">
            <option value="zh-TW">繁體中文</option>
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </select>
          <select value={role} onChange={(e) => trySwitchRole(e.target.value)} className="bg-[#FDB515]/10 border border-[#FDB515]/30 text-sm font-semibold text-[#b47b00] rounded-lg py-2 pl-3 pr-8 outline-none cursor-pointer hover:bg-[#FDB515]/20 transition-colors">
            <option value="student">{t.roleStudent}</option>
            <option value="mentor">{t.roleMentor}</option>
            <option value="admin">{t.roleAdmin}</option>
          </select>
          {user && (
            <button onClick={async () => {
              if (user.isLocal) { alert(t.auth.signInRequired); return; }
              await authSignOut();
            }} className="flex items-center gap-2 border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-slate-100 transition-colors">
              <LogOut size={16}/> {t.auth.signOut}
            </button>
          )}
          {!user && useFirebase && (
            <button onClick={async () => { await signInWithGoogle(); }} className="flex items-center gap-2 bg-[#003262] text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-[#002244] transition-colors shadow-sm">
              <LogIn size={16}/> {t.auth.signInGoogle}
            </button>
          )}
          {role === 'student' && (
            <button onClick={() => { setStudentTab('home'); setView('home'); }} className="flex items-center gap-2 bg-[#003262] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#002244] transition-colors shadow-sm">
              <Home size={16}/> <span className="hidden sm:inline">{t.myRecords}</span>
            </button>
          )}
          {role === 'mentor' && (
            <button onClick={() => { setStudentTab('pairings'); setView('pairings'); }} className="flex items-center gap-2 bg-[#003262] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#002244] transition-colors shadow-sm">
              <Users size={16}/> <span className="hidden sm:inline">{t.pairings.listTitle}</span>
            </button>
          )}
          {role === 'admin' && (
            <button onClick={() => { setAdminTab('records'); setView('admin'); }} className="flex items-center gap-2 bg-[#FDB515] text-[#003262] px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#e5a213] transition-colors shadow-sm">
              <ShieldCheck size={16}/> <span className="hidden sm:inline">{t.admin}</span>
            </button>
          )}
        </div>
      </nav>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-2 text-[10px] text-slate-400">
        {useFirebase ? t.storageMode : t.localMode}
        {oracleStatus.enabled && <span className="ml-2 text-[10px] text-slate-400">｜ Oracle: {oracleStatus.healthy ? t.oracle.connected : t.oracle.disconnected}</span>}
      </div>
      <main className="p-4 sm:p-6">
        {view === 'home' && (
          <div className="max-w-5xl mx-auto mb-10">
            <div className="bg-[#002244] rounded-2xl p-6 sm:p-10 md:p-16 text-center shadow-lg relative overflow-hidden border border-[#FDB515]">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-6 relative z-10 font-sans tracking-tight leading-tight">{t.heroTitle}</h1>
              <a href="https://corporateinnovation.berkeley.edu/students/business-model-practicum-2026/" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 bg-[#FDB515] text-[#002244] font-bold text-sm px-6 py-2.5 rounded-full hover:bg-yellow-400 transition shadow-md relative z-10"><Globe size={16} /> {t.heroCta}</a>
            </div>
          </div>
        )}
        {view === 'home' && <HomeView />}
        {['upload', 'booking', 'question', 'survey'].includes(view) && <DynamicForm type={view} />}
        {view === 'replay' && <ReplayView t={t} lang={lang} />}
        {view === 'pairings' && role === 'mentor' && (
          <>
            <h2 className="text-xl sm:text-2xl font-bold text-[#003262] max-w-5xl mx-auto mb-4 sm:mb-6 flex items-center gap-3"><Users className="text-[#FDB515]" /> {t.pairings.listTitle}</h2>
            <PairingView data={pairings} isMentor={true} t={t} currentUser={user} />
          </>
        )}
        {view === 'records' && role === 'student' && (
          <>
            <h2 className="text-xl sm:text-2xl font-bold text-[#003262] max-w-5xl mx-auto mb-4 sm:mb-6 flex items-center gap-3"><Database className="text-[#FDB515]" /> {t.myRecords}</h2>
            <RecordsView data={submissions.filter((s) => s.userId === user?.uid)} isAdmin={false} t={t} lang={lang} role={role} />
          </>
        )}
        {view === 'admin' && role === 'admin' && (
          <>
            <h2 className="text-xl sm:text-2xl font-bold text-[#003262] max-w-5xl mx-auto mb-4 sm:mb-6 flex items-center gap-3"><ShieldCheck className="text-[#FDB515]" /> {t.admin}</h2>
            <RecordsView data={submissions} isAdmin={true} t={t} lang={lang} role={role} />
          </>
        )}
      </main>
      <footer className="text-center text-slate-400 text-xs mt-12 pb-6">{t.footer}</footer>
      <button onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setView('home'); }}
        className="fixed bottom-6 right-6 z-40 bg-white border border-slate-200 shadow-lg text-[#003262] rounded-full p-3 hover:border-[#FDB515] hover:text-[#b47b00] transition-colors"
        aria-label={t.header.helpAriaLabel}>
        <span className="flex items-center justify-center w-10 h-10 text-lg" aria-hidden="true">{t.header.helpSymbol}</span>
      </button>
      <ProfileSetupModal open={profileSetupOpen} onClose={() => setProfileSetupOpen(false)} user={user} lang={lang} />
      <AdminLoginModal open={adminPrompt} onClose={() => setAdminPrompt(false)} onLogin={confirmAdmin} />
    </div>
  );
}
