import React, { useState, useEffect } from 'react';
import { 
  KeyRound, ShieldCheck, CheckCircle2, Clock, AlertCircle, RefreshCw, 
  ListChecks, Layers, Hash, Calendar, ArrowRight, Trash2, Check, ExternalLink,
  Copy, CheckCheck, Sparkles, Code
} from 'lucide-react';

export default function AdminDashboard({ onNavigateHome }) {
  const [token, setToken] = useState(localStorage.getItem('admin_token') || '');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Admin view tabs: 'pending', 'all', 'recent'
  const [activeTab, setActiveTab] = useState('pending');

  // Stats
  const [stats, setStats] = useState({
    totalUnique: 0,
    answered: 0,
    pending: 0,
    newToday: 0,
    answeredToday: 0,
    pendingAnswers: 0
  });
  const [recentSubmissions, setRecentSubmissions] = useState([]);

  // Pending questions list & selection
  const [pendingQuestions, setPendingQuestions] = useState([]);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState([]);
  
  // Pattern Assignment state: { a delhi } { b india } { a delhi , c canada }
  const [patternInput, setPatternInput] = useState('');
  const [isAssigningPattern, setIsAssigningPattern] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedWithQuestions, setCopiedWithQuestions] = useState(false);
  const [copiedAllQuestions, setCopiedAllQuestions] = useState(false);
  const [isDeletingAllQuestions, setIsDeletingAllQuestions] = useState(false);
  const [isImportingAnsweredQuestions, setIsImportingAnsweredQuestions] = useState(false);

  // All questions list
  const [allQuestions, setAllQuestions] = useState([]);
  const [allFilterStatus, setAllFilterStatus] = useState('all');
  const [allSearchQuery, setAllSearchQuery] = useState('');
  const [isLoadingAll, setIsLoadingAll] = useState(false);

  // Notifications
  const [actionNotice, setActionNotice] = useState('');

  useEffect(() => {
    if (token) {
      loadDashboardData();
    }
  }, [token, activeTab]);

  const loadDashboardData = async () => {
    await fetchAdminStats();
    if (activeTab === 'pending') {
      await fetchPendingQuestions();
    } else if (activeTab === 'all') {
      await fetchAllQuestions();
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLoginError(data.error || 'Login failed. Check credentials.');
      } else {
        localStorage.setItem('admin_token', data.token);
        setToken(data.token);
        setPassword('');
      }
    } catch (err) {
      setLoginError('Error connecting to server: ' + err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setToken('');
  };

  const fetchAdminStats = async () => {
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setRecentSubmissions(data.recentSubmissions || []);
      }
    } catch (err) {
      console.error('Error fetching admin stats:', err);
    }
  };

  const fetchPendingQuestions = async () => {
    setIsLoadingPending(true);
    try {
      const res = await fetch('/api/admin/pending?limit=100', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setPendingQuestions(data.items || []);
        setSelectedQuestionIds([]);
      }
    } catch (err) {
      console.error('Error fetching pending questions:', err);
    } finally {
      setIsLoadingPending(false);
    }
  };

  const fetchAllQuestions = async () => {
    setIsLoadingAll(true);
    try {
      const res = await fetch(
        `/api/admin/all-questions?status=${allFilterStatus}&q=${encodeURIComponent(allSearchQuery)}&limit=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (data.success) {
        setAllQuestions(data.items || []);
      }
    } catch (err) {
      console.error('Error fetching all questions:', err);
    } finally {
      setIsLoadingAll(false);
    }
  };

  const handleAssignSingle = async (questionId, answer) => {
    try {
      const res = await fetch('/api/admin/assign-single', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ questionId, answer })
      });
      const data = await res.json();
      if (data.success) {
        showNotice(`Assigned answer '${answer}' to Question #${questionId}`);
        loadDashboardData();
      }
    } catch (err) {
      console.error('Error assigning single answer:', err);
    }
  };

  const handleToggleSelectQuestion = (id) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllPending = () => {
    if (selectedQuestionIds.length === pendingQuestions.length) {
      setSelectedQuestionIds([]);
    } else {
      setSelectedQuestionIds(pendingQuestions.map((q) => q.id));
    }
  };

  // Client-side pattern parser for real-time preview
  const parsePatternClient = (patternText) => {
    if (!patternText || typeof patternText !== 'string') return [];
    const clean = patternText.replace(/^\uFEFF/, '');
    const blockMatches = clean.match(/\{([^}]+)\}/g);
    if (!blockMatches) return [];

    return blockMatches.map((block) => {
      const inner = block.replace(/^\{/, '').replace(/\}$/, '').trim();
      const parts = inner.split(',').map((p) => p.trim()).filter(Boolean);

      const keys = [];
      const texts = [];

      for (const part of parts) {
        const match = part.match(/^(?:\(?([A-Za-z0-9])\)?)(?:[\.\:\-\s]+(.*))?$/);
        if (match) {
          const key = match[1].toUpperCase();
          if (!keys.includes(key)) keys.push(key);
          if (match[2] && match[2].trim()) texts.push(match[2].trim());
        } else if (part) {
          const fallbackKey = part.trim().toUpperCase();
          if (!keys.includes(fallbackKey)) keys.push(fallbackKey);
        }
      }

      return {
        raw: block,
        keys,
        answerKey: keys.join(', '),
        answerText: texts.join(', '),
        isMulti: keys.length > 1
      };
    });
  };

  // Copy standard prompt template to clipboard
  const handleCopyPromptTemplate = () => {
    const template = `Please solve the questions and output the answers strictly in the following format:
[What is the capital of India?]{a delhi}
[Which countries are in Europe?]{a france , c germany}

Formatting Rules:
- Put the complete question inside square brackets and append the answer immediately after it in curly brackets: [question text]{answer}
- For single-choice questions, write the letter key and option text: { a option_text } or { b option_text }
- For multiple-choice questions with multiple correct options, separate them with commas: { a option_text , c option_text }
- Output ONLY [question]{answer} lines in sequential order. Do not include question numbers or conversational text.`;

    navigator.clipboard.writeText(template);
    setCopiedPrompt(true);
    showNotice('✓ Answer pattern prompt template copied to clipboard!');
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  // Copy prompt loaded with currently selected questions
  const handleCopyPromptWithSelectedQuestions = () => {
    const selected = pendingQuestions.filter((q) => selectedQuestionIds.includes(q.id));
    if (selected.length === 0) {
      alert('Please select at least one question from the queue below first.');
      return;
    }

    const formattedQuestions = selected.map((q) => {
      const opts = (q.options || []).map((o) => `   ${o.key}. ${o.text}`).join('\n');
      return `[${q.question_text}]${opts ? `\n${opts}` : ''}`;
    }).join('\n\n');

    const promptText = `Please solve the following ${selected.length} questions and output each answer strictly in this format:
[question text]{a option_text}
[question text]{a option_text , c option_text}

Rules:
- Put the complete question inside square brackets and append the answer immediately after it in curly braces: [question text]{answer}
- For single choice: { key option_text } e.g. { a delhi }
- For multiple choices: { key option_text , key option_text } e.g. { a delhi , c canada }
- Provide exactly ${selected.length} [question]{answer} line(s) in order, one per question.
- Do not add numbering, IDs, explanations, or conversational filler.

Questions to answer:
${formattedQuestions}`;

    navigator.clipboard.writeText(promptText);
    setCopiedWithQuestions(true);
    showNotice(`✓ Prompt with ${selected.length} questions copied to clipboard! Paste into AI or assistant.`);
    setTimeout(() => setCopiedWithQuestions(false), 2500);
  };

  const handleCopyAllPendingQuestions = () => {
    if (pendingQuestions.length === 0) {
      alert('There are no pending questions to copy.');
      return;
    }

    const formattedQuestions = pendingQuestions.map((q, idx) => {
      const opts = (q.options || []).map((o) => `   ${o.key}. ${o.text}`).join('\n');
      return `Question ${idx + 1} (ID: #${q.id}):\n${q.question_text}${opts ? `\n${opts}` : ''}`;
    }).join('\n\n');

    const promptText = `Please solve the questions and output the answers strictly in the following format:\n\n[ question text ] { a option_text }\n[ question text ] { b option_text }\n[ question text ] { a option_text , c option_text }\n\nFormatting Rules:\n\n- Clean each question by removing question numbers, IDs, status labels, UI text, and other unnecessary information.\n- Put the cleaned question inside square brackets: [ question text ]\n- Put the answer immediately after the question in curly brackets: { ... }\n- For single-choice questions, write the letter key and complete option text: { a option_text } or { b option_text }\n- For multiple-choice questions with multiple correct options, separate the correct answers with commas: { a option_text , c option_text }\n- Keep the questions and answers in the exact same sequential order as provided.\n- Do not add explanations, commentary, headings, or extra text.\n- Output ONLY the [ question ] { answer } lines.\n\nQuestions to answer:\n${formattedQuestions}`;

    navigator.clipboard.writeText(promptText);
    setCopiedAllQuestions(true);
    showNotice(`✓ All ${pendingQuestions.length} pending questions copied to clipboard.`);
    setTimeout(() => setCopiedAllQuestions(false), 2500);
  };

  // Apply pattern answers to selected questions
  const handleApplyPattern = async (e) => {
    e.preventDefault();
    const isAnsweredQuestionImport = /\[[\s\S]*?\]\s*\{[^{}]+\}/.test(patternInput);

    if (isAnsweredQuestionImport) {
      if (!confirm('This will remove all current pending questions and add these entries as answered. Continue?')) return;

      setIsImportingAnsweredQuestions(true);
      try {
        const res = await fetch('/api/admin/import-answered', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ content: patternInput })
        });
        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
          ? await res.json()
          : {
              success: false,
              error: 'The admin server needs to be restarted to enable answered-question imports.'
            };
        if (!data.success) {
          alert(data.error || 'Failed to import answered questions.');
          return;
        }

        setPatternInput('');
        setSelectedQuestionIds([]);
        setActiveTab('all');
        showNotice(`✓ Imported ${data.importedCount} new answered question${data.importedCount === 1 ? '' : 's'}, skipped ${data.skippedCount || 0} existing question${data.skippedCount === 1 ? '' : 's'}, and removed ${data.removedPendingCount} pending question${data.removedPendingCount === 1 ? '' : 's'}.`);
        await fetchAdminStats();
        await fetchPendingQuestions();
        await fetchAllQuestions();
      } catch (err) {
        alert('Network error: ' + err.message);
      } finally {
        setIsImportingAnsweredQuestions(false);
      }
      return;
    }

    if (selectedQuestionIds.length === 0) {
      alert('Please select questions first to apply the answer pattern.');
      return;
    }

    const parsed = parsePatternClient(patternInput);
    if (parsed.length === 0) {
      alert('No valid answer blocks detected. Please format as: { a delhi } { b india } { a delhi , c canada }');
      return;
    }

    if (parsed.length < selectedQuestionIds.length) {
      alert(`Pattern has ${parsed.length} answer block(s), but you selected ${selectedQuestionIds.length} question(s). Please provide an answer for each selected question.`);
      return;
    }

    setIsAssigningPattern(true);
    try {
      const res = await fetch('/api/admin/assign-pattern', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          questionIds: selectedQuestionIds,
          pattern: patternInput
        })
      });
      const data = await res.json();
      if (data.success) {
        setPatternInput('');
        setSelectedQuestionIds([]);
        showNotice(`✓ Successfully assigned answers to ${data.assignments.length} questions (including multi-option answers)!`);
        loadDashboardData();
      } else {
        alert(data.error || 'Failed to assign pattern answers.');
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    } finally {
      setIsAssigningPattern(false);
    }
  };

  const handleDeleteQuestion = async (id) => {
    if (!confirm(`Are you sure you want to delete Question #${id}?`)) return;
    try {
      const res = await fetch(`/api/admin/questions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showNotice(`Question #${id} deleted.`);
        loadDashboardData();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleDeleteAllQuestions = async () => {
    if (!confirm('Delete every question in the repository? This cannot be undone.')) return;
    if (!confirm('Final confirmation: permanently delete all questions?')) return;

    setIsDeletingAllQuestions(true);
    try {
      const res = await fetch('/api/admin/questions', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSelectedQuestionIds([]);
        setPatternInput('');
        setAllQuestions([]);
        showNotice(`✓ Deleted all ${data.deletedCount} question${data.deletedCount === 1 ? '' : 's'}.`);
        loadDashboardData();
      } else {
        alert(data.error || 'Failed to delete all questions.');
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    } finally {
      setIsDeletingAllQuestions(false);
    }
  };

  const showNotice = (msg) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(''), 4000);
  };

  // If not logged in, render login screen
  if (!token) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-blue-600/10 border border-blue-500/20 text-blue-400 mx-auto flex items-center justify-center">
              <KeyRound className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-white">Admin Authentication</h2>
            <p className="text-slate-400 text-xs sm:text-sm">
              Sign in to manage pending submissions and assign official answer sequences.
            </p>
          </div>

          {loginError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Default: admin123"
                required
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition shadow flex items-center justify-center gap-2"
            >
              {isLoggingIn ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Log In to Admin Panel'}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-700/60 space-y-3 text-center">
            <button
              type="button"
              onClick={() => {
                setUsername('admin');
                setPassword('admin123');
              }}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-700 border border-slate-700 text-emerald-400 hover:text-emerald-300 font-semibold transition"
            >
              ⚡ Auto-Fill Default Credentials (admin / admin123)
            </button>
            <div>
              <button
                type="button"
                onClick={onNavigateHome}
                className="text-xs text-slate-400 hover:text-slate-200 underline"
              >
                ← Return to Public Homepage
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Selected questions for pattern preview
  const selectedQuestions = pendingQuestions.filter((q) => selectedQuestionIds.includes(q.id));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Top Header & Admin Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-800/90 border border-slate-700 p-6 rounded-2xl shadow-xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" /> Administrator Console
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Admin Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchAdminStats}
            className="p-2.5 bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-300 rounded-xl text-xs flex items-center gap-1.5 transition"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-slate-900 hover:bg-rose-950 border border-slate-700 hover:border-rose-800 text-slate-300 hover:text-rose-300 rounded-xl text-xs font-semibold transition"
          >
            Log Out
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-500/60 text-emerald-300 text-sm flex items-center gap-2 shadow-lg animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* METRICS CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-slate-800/80 border border-slate-700/80 p-5 rounded-xl space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-blue-400" /> Total Unique
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-white font-mono">
            {stats.totalUnique.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500">In question repository</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 p-5 rounded-xl space-y-2">
          <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Answered
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono">
            {stats.answered.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500">Publicly available</div>
        </div>

        <div className="bg-slate-800/80 border border-amber-500/30 p-5 rounded-xl space-y-2 bg-amber-950/10">
          <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-amber-400" /> Pending Answers
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-400 font-mono">
            {stats.pending.toLocaleString()}
          </div>
          <div className="text-[11px] text-amber-400/70">Awaiting admin review</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 p-5 rounded-xl space-y-2">
          <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-blue-400" /> New Today
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-blue-400 font-mono">
            {stats.newToday.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500">Submitted today</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 p-5 rounded-xl space-y-2 col-span-2 sm:col-span-1">
          <div className="text-xs font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
            <Check className="w-4 h-4 text-purple-400" /> Answered Today
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-purple-400 font-mono">
            {stats.answeredToday.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500">Approved by admin</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-6 py-3 font-semibold text-sm border-b-2 transition flex items-center gap-2 ${
            activeTab === 'pending'
              ? 'border-blue-500 text-blue-400 bg-blue-500/5'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Clock className="w-4 h-4" /> Pending Questions Queue ({pendingQuestions.length})
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`px-6 py-3 font-semibold text-sm border-b-2 transition flex items-center gap-2 ${
            activeTab === 'all'
              ? 'border-blue-500 text-blue-400 bg-blue-500/5'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" /> All Questions Explorer
        </button>
        <button
          onClick={() => setActiveTab('recent')}
          className={`px-6 py-3 font-semibold text-sm border-b-2 transition flex items-center gap-2 ${
            activeTab === 'recent'
              ? 'border-blue-500 text-blue-400 bg-blue-500/5'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Calendar className="w-4 h-4" /> New Submissions Log
        </button>
      </div>

      {/* TAB 1: PENDING QUESTIONS & ANSWER SEQUENCE SYSTEM */}
      {activeTab === 'pending' && (
        <div className="space-y-6">
          {/* Answer Assignment Card with Pattern { a delhi } { b india } { a delhi , c canada } */}
          <div className="bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-slate-900 border border-blue-800/60 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-700/60 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ListChecks className="w-5 h-5 text-blue-400" /> Answer Pattern Assignment Tool
                </h3>
                <p className="text-xs text-slate-400">
                  Paste <span className="font-mono text-emerald-300 font-bold">{`[ question ] { a answer }`}</span> to replace pending questions with answered entries, or use answer-only patterns for selected questions.
                </p>
              </div>

              <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300">
                Selected: <span className="text-blue-400 font-bold">{selectedQuestionIds.length}</span> question{selectedQuestionIds.length !== 1 ? 's' : ''}
              </div>
            </div>

            <div className="space-y-5">
              {/* PROMPT ASSISTANT FOR COPY-PASTE */}
              <div className="bg-slate-900/90 border border-blue-500/30 rounded-xl p-4 sm:p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Sparkles className="w-4 h-4 text-amber-400" /> AI / Assistant Prompt Helper
                  </div>
                  <div className="text-xs text-slate-400">
                    Copy prompt to request answers from ChatGPT/Claude in the exact required format.
                  </div>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-emerald-300">
                  <span className="text-slate-400">Desired Pattern: </span>
                  <span className="font-bold">{`{ a delhi } { b india } { a delhi , c canada }`}</span>
                  <span className="text-slate-500 block sm:inline sm:ml-2">
                    (supports single-choice & multiple-choice questions)
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleCopyPromptTemplate}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition flex items-center gap-1.5"
                  >
                    {copiedPrompt ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-blue-400" />}
                    {copiedPrompt ? 'Copied Template!' : 'Copy Prompt Template'}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyPromptWithSelectedQuestions}
                    className="px-3.5 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 rounded-lg text-xs font-semibold text-blue-300 hover:text-blue-200 transition flex items-center gap-1.5"
                  >
                    {copiedWithQuestions ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
                    {copiedWithQuestions
                      ? `Copied ${selectedQuestionIds.length} Questions!`
                      : `Copy Prompt with Selected Questions (${selectedQuestionIds.length})`}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyAllPendingQuestions}
                    disabled={pendingQuestions.length === 0}
                    className="px-3.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 disabled:opacity-50 border border-indigo-500/40 rounded-lg text-xs font-semibold text-indigo-200 transition flex items-center gap-1.5"
                  >
                    {copiedAllQuestions ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedAllQuestions ? 'Copied All Pending Questions!' : `Copy All Pending Questions (${pendingQuestions.length})`}
                  </button>
                </div>
              </div>

              {/* PASTE PATTERN INPUT FORM */}
              <form onSubmit={handleApplyPattern} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Paste Answer Pattern or Answered Questions:
                  </label>
                  <textarea
                    rows={3}
                    value={patternInput}
                    onChange={(e) => setPatternInput(e.target.value)}
                    placeholder={'[ What is the capital of India? ] { b Delhi }\n[ Which planet is red? ] { b Mars }'}
                    className="w-full p-3.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-600"
                  ></textarea>
                </div>

                {/* REAL-TIME LIVE PARSER PREVIEW */}
                {(() => {
                  const parsed = parsePatternClient(patternInput);
                  const selected = pendingQuestions.filter((q) => selectedQuestionIds.includes(q.id));
                  if (patternInput.trim().length === 0) return null;

                  const countMatches = parsed.length === selected.length && selected.length > 0;

                  return (
                    <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          Live Pattern Assignment Preview:
                        </div>
                        <div className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                          countMatches
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                        }`}>
                          {parsed.length} answer block{parsed.length !== 1 ? 's' : ''} detected for {selected.length} selected question{selected.length !== 1 ? 's' : ''}
                        </div>
                      </div>

                      {selected.length === 0 ? (
                        <div className="text-xs text-amber-400/90 p-2 rounded bg-amber-950/20 border border-amber-800/40">
                          Please select questions from the pending queue below to preview mapping.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {selected.map((q, idx) => {
                            const block = parsed[idx];
                            const hasBlock = Boolean(block);
                            return (
                              <div
                                key={q.id}
                                className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between gap-1.5 ${
                                  hasBlock
                                    ? 'bg-emerald-950/30 border-emerald-600/50 text-emerald-300'
                                    : 'bg-rose-950/30 border-rose-800/50 text-rose-300'
                                }`}
                              >
                                <div className="truncate">
                                  <span className="font-bold">Q{idx + 1} (#{q.id}):</span> {q.question_text}
                                </div>
                                <div className="flex items-center justify-between">
                                  {hasBlock ? (
                                    <>
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono font-bold px-2 py-0.5 rounded bg-emerald-500 text-slate-950">
                                          {block.answerKey}
                                        </span>
                                        {block.answerText && (
                                          <span className="text-slate-300 truncate max-w-[120px]">
                                            {block.answerText}
                                          </span>
                                        )}
                                      </div>
                                      {block.isMulti && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold">
                                          Multi-Option
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-rose-400 font-semibold">Missing Answer Block</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={isAssigningPattern || isImportingAnsweredQuestions || !patternInput.trim() || (!/\[[\s\S]*?\]\s*\{[^{}]+\}/.test(patternInput) && selectedQuestionIds.length === 0)}
                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg transition flex items-center justify-center gap-2"
                  >
                    {isAssigningPattern || isImportingAnsweredQuestions ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> {isImportingAnsweredQuestions ? 'Importing Answered Questions...' : 'Applying Pattern Answers...'}
                      </>
                    ) : (
                      <>{/\[[\s\S]*?\]\s*\{[^{}]+\}/.test(patternInput) ? 'Confirm & Import Answered Questions' : 'Confirm & Assign Pattern Answers'}</>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Pending Questions Table / List */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-700 pb-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSelectAllPending}
                  className="text-xs font-semibold px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-300 hover:text-white transition"
                >
                  {selectedQuestionIds.length === pendingQuestions.length && pendingQuestions.length > 0
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
                <span className="text-xs text-slate-400">
                  {pendingQuestions.length} pending questions in queue
                </span>
              </div>
              <button
                type="button"
                onClick={handleDeleteAllQuestions}
                disabled={isDeletingAllQuestions || stats.totalUnique === 0}
                className="px-3 py-1.5 bg-rose-950/50 hover:bg-rose-900/60 disabled:opacity-50 border border-rose-800 rounded-lg text-xs font-semibold text-rose-300 hover:text-rose-200 transition flex items-center justify-center gap-1.5"
                title="Permanently delete every question in the repository"
              >
                {isDeletingAllQuestions ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {isDeletingAllQuestions ? 'Deleting All...' : 'Delete All Questions'}
              </button>
            </div>

            {isLoadingPending ? (
              <div className="py-12 text-center text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin" /> Loading pending questions...
              </div>
            ) : pendingQuestions.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <div className="text-white font-medium">All caught up!</div>
                <p className="text-xs">No questions currently pending administrator answers.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingQuestions.map((q, index) => {
                  const isSelected = selectedQuestionIds.includes(q.id);
                  return (
                    <div
                      key={q.id}
                      className={`p-4 rounded-xl border transition-all space-y-3 ${
                        isSelected
                          ? 'bg-blue-950/20 border-blue-500/70'
                          : 'bg-slate-900/70 border-slate-700/60'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectQuestion(q.id)}
                          className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-700 bg-slate-800"
                        />
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                            <span className="font-bold text-blue-400">Question {index + 1}</span>
                            <span>(ID: #{q.id})</span>
                            {q.times_seen > 1 && (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                                Seen {q.times_seen}x
                              </span>
                            )}
                            <span className="text-slate-500">
                              {new Date(q.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="text-base font-medium text-white">{q.question_text}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="text-slate-500 hover:text-rose-400 p-1 transition"
                          title="Delete spam/invalid question"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Options */}
                      {q.options && q.options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7">
                          {q.options.map((opt) => (
                            <div
                              key={opt.key}
                              className="text-xs p-2 rounded bg-slate-800/80 border border-slate-700/60 flex items-center gap-2 text-slate-300"
                            >
                              <span className="w-5 h-5 flex items-center justify-center rounded bg-slate-700 text-slate-200 font-bold text-xs">
                                {opt.key}
                              </span>
                              <span className="truncate">{opt.text}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Individual Answer Assignment Buttons */}
                      <div className="pl-7 pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-slate-400 flex items-center gap-1.5">
                          <span>Status:</span>
                          <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold text-[11px]">
                            Pending
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-400 mr-1">Assign answer:</span>
                          {q.options && q.options.length > 0 ? (
                            q.options.map((opt) => (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => handleAssignSingle(q.id, opt.key)}
                                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-emerald-600 hover:text-white border border-slate-700 text-slate-300 font-bold text-xs transition"
                                title={`Set answer to ${opt.key}`}
                              >
                                {opt.key}
                              </button>
                            ))
                          ) : (
                            ['A', 'B', 'C', 'D'].map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => handleAssignSingle(q.id, opt)}
                                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-emerald-600 hover:text-white border border-slate-700 text-slate-300 font-bold text-xs transition"
                              >
                                {opt}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ALL QUESTIONS EXPLORER */}
      {activeTab === 'all' && (
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between border-b border-slate-700 pb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">Filter Status:</span>
              <select
                value={allFilterStatus}
                onChange={(e) => {
                  setAllFilterStatus(e.target.value);
                }}
                className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
              >
                <option value="all">All Questions</option>
                <option value="pending">Pending</option>
                <option value="answered">Answered</option>
              </select>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={allSearchQuery}
                onChange={(e) => setAllSearchQuery(e.target.value)}
                placeholder="Filter by keyword..."
                className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 w-full sm:w-64"
              />
              <button
                type="button"
                onClick={fetchAllQuestions}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={handleDeleteAllQuestions}
                disabled={isDeletingAllQuestions || stats.totalUnique === 0}
                className="px-3 py-1.5 bg-rose-950/50 hover:bg-rose-900/60 disabled:opacity-50 border border-rose-800 rounded-lg text-xs font-semibold text-rose-300 hover:text-rose-200 transition flex items-center justify-center gap-1.5 whitespace-nowrap"
                title="Permanently delete every question in the repository"
              >
                {isDeletingAllQuestions ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {isDeletingAllQuestions ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </div>

          {isLoadingAll ? (
            <div className="py-12 text-center text-slate-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin" /> Loading questions...
            </div>
          ) : allQuestions.length === 0 ? (
            <div className="py-12 text-center text-slate-400">No questions found matching criteria.</div>
          ) : (
            <div className="space-y-3">
              {allQuestions.map((q) => (
                <div
                  key={q.id}
                  className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/70 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                        <span>#{q.id}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          q.answer_status === 'answered'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                        }`}>
                          {q.answer_status.toUpperCase()}
                        </span>
                        {q.times_seen > 1 && <span>Seen {q.times_seen}x</span>}
                      </div>
                      <h4 className="text-sm font-medium text-white mt-1">{q.question_text}</h4>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="text-slate-500 hover:text-rose-400 p-1 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
                    <div className="text-slate-400">
                      Answer: <span className="font-bold text-emerald-400">{q.correct_answer || 'Pending'}</span>
                    </div>
                    <div className="text-slate-500">
                      Source: {q.source || 'public'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: NEW SUBMISSIONS LOG */}
      {activeTab === 'recent' && (
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="border-b border-slate-700 pb-3">
            <h3 className="text-lg font-bold text-white">NEW SUBMISSIONS FEED</h3>
            <p className="text-xs text-slate-400">Recent question submissions with timestamps and source channels</p>
          </div>

          <div className="space-y-3">
            {recentSubmissions.map((sub) => (
              <div
                key={sub.id}
                className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono text-blue-400">#{sub.id}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
                      via {sub.source}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      sub.answer_status === 'answered' ? 'text-emerald-400' : 'text-amber-300'
                    }`}>
                      {sub.answer_status}
                    </span>
                  </div>
                  <div className="text-sm text-white font-medium">{sub.question_text}</div>
                </div>

                <div className="text-right shrink-0 text-xs text-slate-400 font-mono">
                  {new Date(sub.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
