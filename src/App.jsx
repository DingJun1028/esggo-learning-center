import React, { useState, useEffect, useRef, Component } from 'react';
import {
  useFirebase, initAuth, subscribeSubmissions, addSubmission, deleteSubmission,
  uploadFiles, signInWithGoogle, signOut
} from './db';
import {
  BookOpen, Upload, PlayCircle, Smile, Database, ArrowLeft, Send, ChevronDown, FileText,
  Search, Trash2, LogIn, LogOut, User, Download
} from 'lucide-react';
import translations from './i18n/translations';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 700 * 1024;

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }
  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="min-h-screen bg-red-50 text-red-900 p-6">
          <div className="max-w-2xl mx-auto bg-white border border-red-200 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold mb-2">預期外的錯誤</h2>
            <pre className="whitespace-pre-wrap font-mono text-sm bg-red-50 border border-red-200 rounded-lg p-4">{error?.message}{'\n'}{error?.stack}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const renderFiles = (files) => (
  <div className="flex flex-col gap-2">
    {files.map((f, i) => (
      <a key={i} href={f.url || f.data} download={f.name} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[#003262] hover:underline text-xs bg-slate-50 border border-slate-200 rounded p-2">
        <FileText size={14} className="shrink-0" />
        <span className="truncate font-medium">{f.name}</span>
        <span className="text-slate-400 ml-auto whitespace-nowrap">{(f.size ? `${(f.size / 1024).toFixed(0)} KB` : '')} ↓</span>
      </a>
    ))}
  </div>
);

const ReplayListView = ({ t, videos, onSelect }) => {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  if (!ready) {
    return <div className="max-w-5xl mx-auto mt-2 text-center text-sm text-slate-500">{t.replay.loading}</div>;
  }
  return (
    <div className="max-w-5xl mx-auto mt-2">
      <h2 className="text-xl sm:text-2xl font-bold text-[#003262] mb-4 sm:mb-6">{t.replay.title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {(videos || []).map((v, i) => {
          const id = (v.id || v.videoId || v.driveId || '').trim();
          const titleId = (id || v.url || v.driveUrl || v.previewUrl || '').trim();
          const driveFileIdMatch = String(titleId).match(/[-\w]{25,}/);
          const driveEmbed = driveFileIdMatch ? `https://drive.google.com/file/d/${driveFileIdMatch[0]}/preview` : '';
          const finalSrc = (v.url || v.driveUrl || v.previewUrl || driveEmbed || '').trim();
          return (
            <button key={i} onClick={() => onSelect?.({ ...v, url: finalSrc })} className="bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-[#FDB515] transition-all flex flex-col items-start gap-2 text-left min-h-[120px]">
              <div className="flex items-center gap-2 text-[#003262] font-bold w-full">
                <PlayCircle size={18} className="shrink-0" />
                <span className="truncate text-sm sm:text-base">{v.title || v.name || ('影片 #'+(i+1))}</span>
              </div>
              {v.week && <div className="text-[11px] text-slate-400">{v.week}{v.date ? ' · ' + v.date : ''}</div>}
              {!finalSrc && <div className="text-xs text-slate-400 line-clamp-2">{t.replay.placeholder}</div>}
            </button>
          );
        })}
        {Array.isArray(videos) && videos.length === 0 && <div className="text-sm text-slate-500">{t.replay.empty}</div>}
      </div>
    </div>
  );
};

const ReplayPlayerView = ({ t, video, onBack }) => (
  <div className="max-w-5xl mx-auto mt-2">
    <button onClick={onBack} className="text-sm font-bold text-slate-500 hover:text-[#003262] inline-flex items-center gap-1 transition-colors bg-slate-100 px-3 py-1.5 rounded-md hover:bg-slate-200 mb-4"><ArrowLeft size={16} /> {t.replay.backToList}</button>
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-3 border-b border-slate-200 flex items-center gap-2 text-sm text-slate-700 font-semibold"><PlayCircle size={18} /> {(video?.title || video?.name || '課程回放')}</div>
      {video?.url ? <iframe src={video.url} allow="autoplay; encrypted-media; fullscreen" allowFullScreen title={video.title || 'replay'} className="w-full aspect-video border-0" /> : <div className="p-10 text-center text-sm text-slate-400">{t.replay.placeholder}</div>}
      <div className="p-3 text-[11px] text-slate-400">{t.replay.watermark} · {t.replay.replayCopyright}</div>
    </div>
  </div>
);

const DetailPanel = ({ t, item }) => {
  const d = item.data || {};
  const atts = d.attachments || [];
  const Field = ({ label, value }) => value ? (
    <div className="mb-2">
      <div className="text-xs font-bold text-slate-400 mb-0.5">{label}</div>
      <div className="text-sm text-slate-700 whitespace-pre-wrap break-words">{value}</div>
    </div>
  ) : null;
  return (
    <div className="text-sm">
      {item.type === 'upload' && (<>
        <Field label={t.detail.note} value={d.desc} />
        {atts.length > 0 && (<><div className="text-xs font-bold text-slate-400 mb-0.5">{t.detail.files}</div>{renderFiles(atts)}</>)}
        {atts.length === 0 && <div className="text-xs text-slate-400">{t.detail.noFiles}</div>}
      </>)}
      {item.type === 'booking' && (<><Field label={t.detail.booking.name} value={d.name} /><Field label={t.detail.booking.email} value={d.email} /><Field label={t.detail.booking.time} value={d.time} /><Field label={t.detail.booking.topic} value={d.topic} /></>)}
      {item.type === 'question' && (<><Field label={t.detail.question.submitterName || '提問人姓名'} value={d.submitterName} /><Field label={t.detail.question.submitterEmail || '提問人 Email'} value={d.submitterEmail} /><Field label={t.detail.question.role} value={d.role} /><Field label={t.detail.question.challenge} value={d.challenge} /><Field label={t.detail.question.mainQuestion} value={d.mainQuestion} />{atts.length > 0 && (<><div className="text-xs font-bold text-slate-400 mb-0.5">{t.detail.supplements}</div>{renderFiles(atts)}</>)}</>)}
      {item.type === 'survey' && (<>
        <Field label={t.detail.survey.week} value={d.meta?.week} />
        <Field label={t.detail.survey.date} value={d.meta?.date} />
        <Field label={t.detail.survey.theme} value={d.meta?.theme} />
        <Field label={t.detail.survey.lecturer} value={d.meta?.lecturer} />
        <Field label={t.detail.survey.name} value={d.meta?.name} />
        <Field label={t.detail.survey.org} value={d.meta?.org} />
        {d.ratings && Object.keys(d.ratings).length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-3">{Object.entries(d.ratings).map(([q, v]) => (<span key={q} className="text-xs bg-[#FDB515]/15 text-[#b47b00] px-2 py-1 rounded font-mono">Q:{q.slice(-1)} = {v}</span>))}</div>
        ) : <div className="text-xs text-slate-400 mb-2">{t.detail.survey.noRatings}</div>}
        <Field label={t.detail.survey.feedback + ' 1'} value={d.open?.open_1} />
        <Field label={t.detail.survey.feedback + ' 2'} value={d.open?.open_2} />
        <Field label={t.detail.survey.feedback + ' 3'} value={d.open?.open_3} />
        {atts.length > 0 && (<><div className="text-xs font-bold text-slate-400 mb-0.5">{t.detail.supplements}</div>{renderFiles(atts)}</>)}
      </>)}
    </div>
  );
};

const SurveyForm = ({ t, onSubmit }) => {
  const [meta, setMeta] = useState({ week: '', date: '', theme: '', lecturer: '', name: '', org: '' });
  const [ratings, setRatings] = useState({});
  const [open, setOpen] = useState({ open_1: '', open_2: '', open_3: '' });
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const update = (key, value) => setMeta((prev) => ({ ...prev, [key]: value }));
  const setRating = (key, value) => setRatings((prev) => ({ ...prev, [key]: value }));
  const setOpenField = (key, value) => setOpen((prev) => ({ ...prev, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    const qCount = t.survey.questions ? Object.keys(t.survey.questions).length : 0;
    if (Object.keys(ratings).length !== qCount) {
      setError(t.error?.completeRating || '請完成所有評分題目。');
      return;
    }
    setError('');
    await onSubmit({ meta, ratings, open, attachments: files });
  };

  const qEntries = t.survey.questions ? Object.entries(t.survey.questions) : [];
  const optLabelText = t.common.optionalWithLimit || '(选填，附件总量上限 700KB)';

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div>
        <div className="text-lg font-bold text-[#003262] mb-3">{t.survey.meta.week}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {[['week', meta.week, t.survey.meta.weekPlaceholder || '例如：第 1 週'], ['date', meta.date, ''], ['theme', meta.theme, ''], ['lecturer', meta.lecturer, ''], ['name', meta.name, ''], ['org', meta.org, '']].map(([k, v, ph]) => (
            <div key={k}>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {k === 'week' ? t.survey.meta.week : k === 'date' ? t.survey.meta.date : k === 'theme' ? t.survey.meta.theme : k === 'lecturer' ? t.survey.meta.lecturer : k === 'name' ? t.survey.meta.name : t.survey.meta.org}
              </label>
              <input value={v} onChange={(e) => update(k, e.target.value)} required={['week', 'date', 'theme', 'name'].includes(k)} placeholder={ph} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-lg font-bold text-[#003262] mb-2">{t.survey.section1}</div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-slate-600 mb-3">{t.survey.ratingScale}</div>
          <div className="flex flex-col gap-3">
            {qEntries.slice(0, 3).map(([qKey, qText]) => (
              <div key={qKey}>
                <div className="text-sm text-slate-700 mb-1">{qText}</div>
                <select value={ratings[qKey] || ''} onChange={(e) => setRating(qKey, Number(e.target.value))} className="bg-white border rounded-lg p-2 text-sm outline-none">
                  <option value="">--</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="text-lg font-bold text-[#003262] mb-2">{t.survey.section2}</div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-slate-600 mb-3">{t.survey.ratingScale}</div>
          <div className="flex flex-col gap-3">
            {qEntries.slice(3, 7).map(([qKey, qText]) => (
              <div key={qKey}>
                <div className="text-sm text-slate-700 mb-1">{qText}</div>
                <select value={ratings[qKey] || ''} onChange={(e) => setRating(qKey, Number(e.target.value))} className="bg-white border rounded-lg p-2 text-sm outline-none">
                  <option value="">--</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="text-lg font-bold text-[#003262] mb-2">{t.survey.section3}</div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-slate-600 mb-3">{t.survey.ratingScale}</div>
          <div className="flex flex-col gap-3">
            {qEntries.slice(7, 9).map(([qKey, qText]) => (
              <div key={qKey}>
                <div className="text-sm text-slate-700 mb-1">{qText}</div>
                <select value={ratings[qKey] || ''} onChange={(e) => setRating(qKey, Number(e.target.value))} className="bg-white border rounded-lg p-2 text-sm outline-none">
                  <option value="">--</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="text-lg font-bold text-[#003262] mb-2">{t.survey.section4}</div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-slate-600 mb-3">{t.survey.ratingScale}</div>
          <div className="flex flex-col gap-3">
            {qEntries.slice(9, 12).map(([qKey, qText]) => (
              <div key={qKey}>
                <div className="text-sm text-slate-700 mb-1">{qText}</div>
                <select value={ratings[qKey] || ''} onChange={(e) => setRating(qKey, Number(e.target.value))} className="bg-white border rounded-lg p-2 text-sm outline-none">
                  <option value="">--</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="text-lg font-bold text-[#003262] mb-2">{t.survey.openFeedback?.title || '五、開放式回饋'}</div>
        <div className="flex flex-col gap-3">
          {Object.entries({
            open_1: t.survey.openFeedback?.q1 || '',
            open_2: t.survey.openFeedback?.q2 || '',
            open_3: t.survey.openFeedback?.q3 || '',
          }).map(([k, label]) => (
            <div key={k}>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{label}</label>
              <textarea value={open[k] || ''} onChange={(e) => setOpenField(k, e.target.value)} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none h-28" placeholder={t.common.optionalLabel}></textarea>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">{t.common.attachmentLabel} <span className="text-slate-400">{optLabelText}</span></label>
        <input type="file" multiple onChange={(e) => { setFiles(Array.from(e.target.files || [])); }} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-100 file:text-[#003262] file:font-semibold hover:file:bg-slate-200" />
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}
      <button type="submit" className="mt-2 bg-[#003262] text-white font-bold py-3 rounded-lg hover:bg-[#002244] transition-colors inline-flex items-center justify-center gap-2"><Send size={18} /> {t.survey.submitButton || '送出回饋'}</button>
    </form>
  );
};

export default function App() {
  const [lang, setLang] = useState('zh-TW');
  const [view, setView] = useState('home');
  const [user, setUser] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [replayView, setReplayView] = useState('list');
  const [replayVideos, setReplayVideos] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [authMessage, setAuthMessage] = useState('');
  const [profileSetup, setProfileSetup] = useState(false);
  const [profileForm, setProfileForm] = useState({ displayName: '', email: '', org: '' });
  const [error, setError] = useState(null);
  const profileMenuRef = useRef(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const t = translations[lang];

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handler = (e) => { if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) setProfileMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileMenuOpen]);

  useEffect(() => {
    window.onerror = (_msg, _url, _line, _col, err) => { setError(err || new Error(String(_msg))); };
    window.addEventListener('unhandledrejection', (e) => { const err = e?.reason; setError(err || new Error(String(e))); });
    const unsub = initAuth((u) => setUser(u));
    return () => { if (unsub) unsub(); };
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeSubmissions(user.uid, setSubmissions);
    return () => { if (unsub) unsub(); };
  }, [user]);

  useEffect(() => {
    if (view !== 'replay') return;
    setReplayView('list'); setSelectedVideo(null);
    let cancelled = false;
    (async () => {
      try {
        const url = (import.meta.env.VITE_REPLAY_WEB_APP_URL || '').trim();
        const res = await fetch(url);
        const text = await res.text();
        let payload = {};
        try { payload = JSON.parse(text); } catch {
          const jsonp = text.match(/^[^(]*\((.*)\);\s*$/s);
          if (jsonp) payload = JSON.parse(jsonp[1]);
        }
        if (!cancelled) {
          const videos = (Array.isArray(payload) ? payload : (payload.videos || payload.recordings || payload.items || [])).filter(Boolean);
          setReplayVideos(videos.length ? videos : [{ title: t.replay.empty, url: '' }]);
        }
      } catch (err) {
        console.error('replay fetch failed', err);
        if (!cancelled) setReplayVideos([{ title: t.replay.loading + ' - error', url: '' }]);
      }
    })();
    return () => { cancelled = true; };
  }, [view]);

  const handleReplaySelect = (video) => { setSelectedVideo(video); setReplayView('player'); };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      setAuthMessage(t.auth.signInSuccess || '登入成功');
      const auth = await import('firebase/auth').then((m) => m.getAuth());
      const currentUser = auth.currentUser;
      if (currentUser) {
        const existing = await import('./repositories/profile.repository').then((m) => m.getUserProfile(currentUser.uid));
        if (!existing) {
          setProfileForm({ displayName: currentUser.displayName || '', email: currentUser.email || '', org: '' });
          setProfileSetup(true);
        }
      }
    } catch (err) {
      console.error(err);
      const msg = String(err?.message || err);
      setAuthMessage(msg || (t.auth.signInFailed || '登入失敗，請稍後再試。'));
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setProfileMenuOpen(false); setAuthMessage('');
    setView('home'); setProfileSetup(false); setProfileForm({ displayName: '', email: '', org: '' });
  };

  const handleSubmit = async (e, type, formData) => {
    e.preventDefault();
    if (!user) return;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn?.innerText; if (submitBtn) { submitBtn.innerText = t.saving; submitBtn.disabled = true; }
    try {
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      const attachments = await uploadFiles(formData.attachments || []);
      await addSubmission({ userId: user.uid, type, data: formData }, attachments, id);
      alert(t.success);
      setView('records');
    } catch (err) {
      console.error(err);
      alert(t.error.generic || '發生錯誤');
    } finally { if (submitBtn) { submitBtn.innerText = originalText; submitBtn.disabled = false; } }
  };

  const handleSurveySubmit = async (formData) => {
    await handleSubmit({ preventDefault: () => {} }, 'survey', formData);
  };

  const LayoutShell = ({ children }) => (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20">
      <nav className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap justify-between items-center gap-2 sm:gap-4 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="text-sm font-extrabold text-[#003262] tracking-tight">ESGGO</span>
          {view !== 'home' && (
            <button onClick={() => setView('home')} className="text-sm font-bold text-slate-500 hover:text-[#003262] inline-flex items-center gap-1 transition-colors bg-slate-100 px-3 py-1.5 rounded-md hover:bg-slate-200">
              <ArrowLeft size={16} /> {t.back}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
          <select value={lang} onChange={(e) => setLang(e.target.value)} className="bg-slate-100 border-none text-sm font-semibold text-[#003262] rounded-lg py-2 px-3 outline-none cursor-pointer hover:bg-slate-200 transition-colors">
            <option value="zh-TW">繁體中文</option>
            <option value="zh-CN">简体中文</option>
          </select>
          <div className="relative" ref={profileMenuRef}>
            {user && !user.isLocal && !user.isAnonymous ? (
              <button onClick={() => setProfileMenuOpen(!profileMenuOpen)} className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-[#003262] px-3 py-2 rounded-lg text-sm font-semibold transition-colors" title={user.email || user.displayName || ''}>
                {user.photoURL ? (<img src={user.photoURL} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />) : (<User size={16} />)}
                <span className="hidden sm:inline max-w-[100px] truncate">{user.displayName || user.email?.split('@')[0] || ''}</span>
                <ChevronDown size={14} />
              </button>
            ) : (
              <button onClick={handleGoogleSignIn} className="inline-flex items-center gap-2 bg-[#003262] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#002244] transition-colors shadow-sm">
                <LogIn size={16} /> <span className="hidden sm:inline">{t.auth?.signInGoogle || 'Google 登入'}</span>
              </button>
            )}
            {profileMenuOpen && user && !user.isLocal && !user.isAnonymous && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg w-56 z-[60] overflow-hidden" onClick={() => setProfileMenuOpen(false)}>
                <div className="px-4 py-3 border-b border-slate-100">
                  <div className="text-sm font-bold text-[#003262] truncate">{user.displayName || ''}</div>
                  <div className="text-xs text-slate-400 truncate">{user.email || ''}</div>
                </div>
                <button onClick={async () => { await handleSignOut(); setProfileMenuOpen(false); }} className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 inline-flex items-center gap-2 transition-colors">
                  <LogOut size={16} /> {t.auth?.signOut || '登出'}
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
      {children}
      <footer className="text-center text-slate-400 text-xs mt-12 pb-6">{t.footer}</footer>
    </div>
  );

  return (
    <LayoutShell>
      {authMessage && (<div className="max-w-5xl mx-auto mb-4"><div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4">{authMessage}</div></div>)}
      {error && (<div className="max-w-5xl mx-auto mb-6"><div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-4 whitespace-pre-wrap font-mono">{error?.message}{'\n'}{error?.stack}</div></div>)}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-1">
        <div className="text-[10px] text-slate-400">{useFirebase ? t.list.storageMode : t.list.localMode}</div>
      </div>

      {view === 'home' && (
        <div className="max-w-5xl mx-auto mb-10">
          <div className="bg-[#003262] rounded-2xl p-6 sm:p-10 md:p-16 text-center shadow-lg relative overflow-hidden border-b-4 border-[#FDB515]">
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-[#FDB515] rounded-full opacity-10 blur-3xl"></div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-4 relative z-10 font-serif tracking-tight leading-tight">{t.heroTitle}</h2>
            <div className="relative z-10 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-lg text-left">
              <a href="https://corporateinnovation.berkeley.edu/students/business-model-practicum-2026/" target="_blank" rel="noreferrer" className="block px-4 py-3 text-sm font-semibold text-[#003262] hover:underline">2026 Berkeley 柏克萊 官方網站課程介紹</a>
            </div>
          </div>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <a href="https://drive.google.com/drive/folders/1-ZOC6sPNGISeD7Rf6lYT3Q10yYZaTdAy?usp=drive_link" target="_blank" rel="noreferrer" className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-[#FDB515] transition-all flex flex-col items-center justify-center gap-4 group cursor-pointer min-h-[130px] sm:min-h-[160px]">
              <div className="bg-slate-50 p-4 rounded-full text-[#003262] group-hover:bg-[#003262] group-hover:text-white transition-colors"><BookOpen size={32} /></div>
              <h3 className="text-lg font-bold text-[#003262]">{t.f1}</h3>
            </a>
            <a href="https://forms.gle/LVQ2mxL1eFa8Up2u9" target="_blank" rel="noreferrer" className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-[#FDB515] transition-all flex flex-col items-center justify-center gap-4 group cursor-pointer min-h-[130px] sm:min-h-[160px]">
              <div className="bg-slate-50 p-4 rounded-full text-[#003262] group-hover:bg-[#003262] group-hover:text-white transition-colors"><Upload size={32} /></div>
              <h3 className="text-lg font-bold text-[#003262]">{t.f2}</h3>
            </a>
            <div onClick={() => setView('replay')} className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-[#FDB515] transition-all flex flex-col items-center justify-center gap-4 group cursor-pointer min-h-[130px] sm:min-h-[160px]">
              <div className="bg-slate-50 p-4 rounded-full text-[#003262] group-hover:bg-[#003262] group-hover:text-white transition-colors"><PlayCircle size={32} /></div>
              <h3 className="text-lg font-bold text-[#003262]">{t.f3}</h3>
            </div>
            <a href="https://docs.google.com/forms/d/e/1FAIpQLSeLEij5XZ1TtBqxHYoNAx22QCSvfr-WPg0yp26hceq6d_ZMWg/viewform" target="_blank" rel="noreferrer" className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-[#FDB515] transition-all flex flex-col items-center justify-center gap-4 group cursor-pointer min-h-[130px] sm:min-h-[160px]">
              <div className="bg-slate-50 p-4 rounded-full text-[#003262] group-hover:bg-[#003262] group-hover:text-white transition-colors"><Smile size={32} /></div>
              <h3 className="text-lg font-bold text-[#003262]">{t.f4}</h3>
            </a>
          </div>
        </div>
      )}

      {view === 'replay' && replayView === 'list' && <ReplayListView t={t} videos={replayVideos} onSelect={handleReplaySelect} />}
      {view === 'replay' && replayView === 'player' && selectedVideo && <ReplayPlayerView t={t} video={selectedVideo} onBack={() => setReplayView('list')} />}

      {profileSetup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={()=>{}}>
          <form onSubmit={async (e) => {
            e.preventDefault();
            try {
              const { setupProfileIfMissing, upsertUserProfile } = await import('./repositories/profile.repository');
              await setupProfileIfMissing({ ...user, displayName: profileForm.displayName, email: profileForm.email });
              await upsertUserProfile(user.uid, { displayName: profileForm.displayName, email: profileForm.email, org: profileForm.org });
              setProfileSetup(false);
            } catch (err) { console.error('Profile setup error:', err); }
          }} className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-sm w-full p-6 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#003262]">{t.auth?.setupProfile || '個人資料設定'}</h3>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{t.auth?.displayName || '顯示名稱'}</label>
              <input autoFocus type="text" required value={profileForm.displayName} onChange={(e) => setProfileForm((prev) => ({ ...prev, displayName: e.target.value }))} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{t.auth?.email || 'Email'}</label>
              <input type="email" required value={profileForm.email} onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{t.auth?.org || '組織'}</label>
              <input type="text" value={profileForm.org} onChange={(e) => setProfileForm((prev) => ({ ...prev, org: e.target.value }))} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#003262] outline-none" />
            </div>
            <button type="submit" className="mt-2 bg-[#003262] text-white font-bold py-3 rounded-lg hover:bg-[#002244] transition-colors">{t.auth?.saveAndContinue || '儲存並繼續'}</button>
          </form>
        </div>
      )}
    </LayoutShell>
  );
}
