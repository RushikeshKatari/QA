import React, { useState, useEffect } from 'react';
import { Search, Upload, FileText, CheckCircle2, AlertCircle, HelpCircle, ArrowRight, RefreshCw, Layers, ShieldCheck } from 'lucide-react';

export default function PublicHome({ onNavigateAdmin }) {
  const [stats, setStats] = useState({ totalUnique: 0, answered: 0, pending: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Submission tab state: 'paste' or 'upload'
  const [submissionTab, setSubmissionTab] = useState('paste');
  const [pastedText, setPastedText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Result modal state
  const [submissionResult, setSubmissionResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchStats();
    handleSearch('');
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data.success) {
        setStats(data);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const handleSearch = async (query = searchQuery, page = 1) => {
    setIsSearching(true);
    try {
      const res = await fetch(`/api/questions/search?q=${encodeURIComponent(query)}&page=${page}&limit=10`);
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.items);
        setTotalPages(data.totalPages || 1);
        setSearchPage(page);
      }
    } catch (err) {
      console.error('Error searching questions:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const onSearchSubmit = (e) => {
    e.preventDefault();
    handleSearch(searchQuery, 1);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validExts = ['.txt', '.csv', '.json', '.pdf'];
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!validExts.includes(ext)) {
        setErrorMessage(`Invalid file format (${ext}). Supported formats: .txt, .csv, .json, .pdf`);
        setSelectedFile(null);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setErrorMessage('File size exceeds 5MB limit.');
        setSelectedFile(null);
        return;
      }
      setErrorMessage('');
      setSelectedFile(file);
    }
  };

  const handleSubmitQuestions = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      let res;
      if (submissionTab === 'paste') {
        if (!pastedText.trim()) {
          setErrorMessage('Please paste at least one question into the text area.');
          setIsSubmitting(false);
          return;
        }

        res = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: pastedText })
        });
      } else {
        if (!selectedFile) {
          setErrorMessage('Please choose a .txt, .csv, .json, or .pdf file to upload.');
          setIsSubmitting(false);
          return;
        }

        const formData = new FormData();
        formData.append('file', selectedFile);

        res = await fetch('/api/submit', {
          method: 'POST',
          body: formData
        });
      }

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Failed to submit questions. Please verify format.');
      } else {
        setSubmissionResult(data);
        setPastedText('');
        setSelectedFile(null);
        fetchStats();
        handleSearch(searchQuery, 1);
      }
    } catch (err) {
      console.error('Submission error:', err);
      setErrorMessage('Network or server error while submitting: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Unified public workflow */}
      <div className="flex flex-col items-center justify-center space-y-2">
        <div className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/25 text-xs sm:text-sm font-bold">
          <Search className="w-4 h-4" /> Find or Add Questions
        </div>
      </div>

      {/* Find-or-add is handled by the submission endpoint: it searches first,
          returns an existing match, or creates a pending question. */}
      {false && (
        <section className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur-sm animate-fade-in">
          <div className="text-center space-y-3 mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold uppercase tracking-wider">
              <Layers className="w-3.5 h-3.5" /> Public Question Repository
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              QUESTION DATABASE
            </h1>
            <p className="text-slate-400 text-sm sm:text-base">
              Search verified questions and view official approved answers.
            </p>
            <div className="pt-2">
              <span className="inline-block px-4 py-1.5 rounded-full bg-slate-900 border border-slate-700 text-blue-400 font-bold text-sm sm:text-base shadow-inner">
                {stats.totalUnique.toLocaleString()} Unique Questions
              </span>
            </div>
          </div>

          {/* Search Form */}
          <form onSubmit={onSearchSubmit} className="max-w-2xl mx-auto mb-8">
            <div className="relative flex items-center">
              <Search className="absolute left-4 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  handleSearch(e.target.value, 1);
                }}
                placeholder="Search for a question..."
                className="w-full pl-12 pr-28 py-3.5 bg-slate-900/90 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base transition-all"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="absolute right-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg shadow transition-colors flex items-center gap-1.5"
              >
                {isSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Search'}
              </button>
            </div>
          </form>

          {/* Search Results */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-700/60 pb-2">
              <span>{searchResults.length > 0 ? `Showing results (${searchResults.length})` : 'No questions found'}</span>
              <span>Answered questions show verified official answers</span>
            </div>

            {searchResults.map((q) => (
              <div
                key={q.id}
                className="bg-slate-900/70 border border-slate-700/60 rounded-xl p-5 hover:border-slate-600 transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-slate-400">Question #{q.id}</div>
                    <h3 className="text-base sm:text-lg font-medium text-white leading-relaxed">
                      {q.question_text}
                    </h3>
                  </div>
                  {q.times_seen > 1 && (
                    <span className="shrink-0 text-xs px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-400 font-mono">
                      Seen {q.times_seen}x
                    </span>
                  )}
                </div>

                {/* Options */}
                {q.options && q.options.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {(() => {
                      const answerKeys = (q.correct_answer || '')
                        .split(',')
                        .map((k) => k.trim().toUpperCase())
                        .filter(Boolean);
                      return q.options.map((opt) => {
                        const isCorrect = q.answer_status === 'answered' && answerKeys.includes(opt.key.toUpperCase());
                        return (
                          <div
                            key={opt.key}
                            className={`text-xs sm:text-sm px-3 py-2 rounded-lg border flex items-center gap-2 ${
                              isCorrect
                                ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300 font-medium'
                                : 'bg-slate-800/60 border-slate-700/50 text-slate-300'
                            }`}
                          >
                            <span className={`w-5 h-5 flex items-center justify-center rounded text-xs font-bold ${
                              isCorrect ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-300'
                            }`}>
                              {opt.key}
                            </span>
                            <span className="truncate">{opt.text}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}

                {/* Answer display status */}
                <div className="pt-2 flex items-center justify-between border-t border-slate-800/80">
                  {q.answer_status === 'answered' ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs sm:text-sm font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Answer: {q.answer_display}</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs sm:text-sm">
                      <HelpCircle className="w-4 h-4 text-amber-400" />
                      <span>Answer: Not available yet</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  disabled={searchPage <= 1}
                  onClick={() => handleSearch(searchQuery, searchPage - 1)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 text-xs font-medium rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-xs text-slate-400">
                  Page {searchPage} of {totalPages}
                </span>
                <button
                  disabled={searchPage >= totalPages}
                  onClick={() => handleSearch(searchQuery, searchPage + 1)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 text-xs font-medium rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>

        </section>
      )}

      {/* FIND OR ADD: paste/upload uses the same clean, deduplicate, and resolve flow */}
      {true && (
      <section className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur-sm">
        <div className="border-b border-slate-700 pb-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold uppercase tracking-wider mb-2">
              <ShieldCheck className="w-3.5 h-3.5" /> Open Public Submission
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">FIND OR ADD QUESTIONS</h2>
            <p className="text-slate-400 text-xs sm:text-sm mt-1">
              Submit single or bulk questions via paste or file upload. No login required.
            </p>
          </div>

          {/* Method Tabs */}
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setSubmissionTab('paste')}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
                submissionTab === 'paste'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" /> Paste Text
            </button>
            <button
              onClick={() => setSubmissionTab('upload')}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
                submissionTab === 'upload'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Upload className="w-4 h-4" /> Upload File
            </button>
          </div>
        </div>

        {/* Security / Admin Policy Banner */}
        <div className="mb-6 p-4 rounded-xl bg-blue-950/30 border border-blue-800/50 text-blue-300 text-xs sm:text-sm flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-blue-200">Public Policy:</span> Public users cannot assign or modify official answers. All submitted questions undergo automated normalization, duplicate detection, and are marked as <strong>Pending</strong> until administrator review.
          </div>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmitQuestions} className="space-y-6">
          {submissionTab === 'paste' ? (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Question Text (Single or Multiple)
              </label>
              <textarea
                rows={9}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={`Paste your questions here...\n\nExample:\n1. What is the capital of India?\nA. Mumbai\nB. Delhi\nC. Chennai\nD. Kolkata\n\n2. Which planet is known as the Red Planet?\n(A) Earth\n(B) Mars\n(C) Jupiter\n(D) Venus`}
                className="w-full p-4 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 font-mono text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              ></textarea>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Automatic formatting detection for numbered lists, A/B/C/D choices, or plain questions.</span>
                <span>Max 500 questions per batch</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Upload Question File (.txt, .csv, .json, .pdf)
              </label>
              <div className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-2xl p-8 text-center bg-slate-900/50 transition-colors">
                <input
                  type="file"
                  id="file-upload"
                  accept=".txt,.csv,.json,.pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center justify-center space-y-3"
                >
                  <div className="w-12 h-12 rounded-full bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-blue-400 hover:underline">Click to browse</span> or drag and drop your file here
                  </div>
                  <p className="text-xs text-slate-400">
                    Supports text (.txt), CSV spreadsheets (.csv), JSON arrays (.json), and text PDFs (.pdf) up to 5MB
                  </p>
                </label>
              </div>

              {selectedFile && (
                <div className="p-3 bg-slate-900 border border-slate-700 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-blue-400" />
                    <div>
                      <div className="text-sm font-medium text-white">{selectedFile.name}</div>
                      <div className="text-xs text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="text-xs text-rose-400 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Processing & Deduplicating...
                </>
              ) : submissionTab === 'paste' ? (
                <>
                  [ Analyze & Submit ]
                </>
              ) : (
                <>
                  [ Submit Questions ]
                </>
              )}
            </button>
          </div>
        </form>

        <div className="mt-8 pt-4 border-t border-slate-700/60 text-center">
          <button
            type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="text-xs sm:text-sm text-blue-400 hover:text-blue-300 font-semibold inline-flex items-center gap-1.5 transition"
          >
              <Search className="w-4 h-4" /> Search verified answers above →
          </button>
        </div>
      </section>
      )}

      {/* SUBMISSION RESULT MODAL */}
      {submissionResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">{submissionResult.title}</h3>
                <p className="text-xs text-slate-400">Processed by Question Parser & Deduplication Engine</p>
              </div>
            </div>

            {/* Results Details Card */}
            {submissionResult.isSingle ? (
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-200 space-y-3">
                <p>{submissionResult.message}</p>
                {submissionResult.result?.question && (
                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    <div className="font-semibold text-white">{submissionResult.result.question.question_text}</div>
                    <div className="space-y-1 text-xs text-slate-300">
                      {(submissionResult.result.question.options || []).map((option) => (
                        <div key={option.key}>{option.key}. {option.text}</div>
                      ))}
                    </div>
                    <div className={`pt-2 font-semibold ${submissionResult.result.status === 'answered' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {submissionResult.result.status === 'answered'
                        ? `Verified answer: ${submissionResult.result.question.correct_answer}`
                        : 'Answer: Awaiting admin review'}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 space-y-2">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Submission Breakdown
                </div>
                <div className="flex items-center justify-between text-sm py-1 border-b border-slate-800">
                  <span className="text-slate-300">Questions detected:</span>
                  <span className="font-bold text-white font-mono">{submissionResult.counts.detected}</span>
                </div>
                <div className="flex items-center justify-between text-sm py-1 border-b border-slate-800">
                  <span className="text-emerald-400 font-medium">New questions:</span>
                  <span className="font-bold text-emerald-400 font-mono">{submissionResult.counts.new}</span>
                </div>
                <div className="flex items-center justify-between text-sm py-1">
                  <span className="text-amber-400 font-medium">Already existing:</span>
                  <span className="font-bold text-amber-400 font-mono">{submissionResult.counts.existing}</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSubmissionResult(null);
                  handleSearch('', 1);
                }}
                className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white text-xs sm:text-sm font-semibold rounded-xl transition flex items-center gap-1.5"
              >
                <Search className="w-3.5 h-3.5" /> View in Search
              </button>
              <button
                type="button"
                onClick={() => setSubmissionResult(null)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold rounded-xl shadow transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
