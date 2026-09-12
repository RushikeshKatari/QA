import { parse as csvParse } from 'csv-parse/sync';

// The single parsing/cleaning contract used by paste, uploads, and extracted PDF text.
const OPTION_LINE = /^\s*(?:\(([A-Ha-h])\)|([A-Ha-h])\s*[.):\-])\s*(.+?)\s*$/;
const NUMBERED_OPTION_LINE = /^\s*(\d+)\s*(?:\\)?[.)\-:]\s*(.+?)\s*$/;
const ANSWER_LINE = /^\s*(?:answer|ans|correct(?:\s+answer)?|key)\s*[.:\-]?\s*.+$/i;
const QUESTION_START = /^\s*(?:(?:important\s+)?question\s*(?:\d+)?\s*[:.)\-]+|q\s*\d*\s*[:.)\-]+|\d+\s*(?:\\)?[.)\-:]\s*)\s*(.+)$/i;
const UI_ARTIFACT = /^(?:timer|time|score|page|question\s*\d+\s+of\s+\d+)\s*:\s*[\d:]+$/i;
const collapse = value => String(value || '').replace(/\r\n?/g, '\n').replace(/\s+/g, ' ').trim();

function sentenceCaseIfAllCaps(value) {
  if (!value || value !== value.toUpperCase() || value === value.toLowerCase()) return value;
  const lower = value.toLowerCase();
  return lower[0].toUpperCase() + lower.slice(1);
}

function splitInlineOptions(text) {
  const match = String(text || '').match(/^(.*?\?)\s+(.+)$/);
  if (!match) return null;
  const values = match[2].trim().split(/\s+/).filter(Boolean);
  return values.length >= 2 && values.length <= 4 ? { question: match[1].trim(), options: values } : null;
}

function splitInlineLabeledOptions(text) {
  const marker = String(text || '').search(/\s+Answer\s+[A-Da-d][.)]\s*/i);
  if (marker < 0) return null;
  const body = String(text).slice(0, marker).replace(/\s+Question\s+\d+\s*$/i, '').trim();
  const optionText = String(text).slice(marker).replace(/^\s+Answer\s+/i, '');
  const matches = [...optionText.matchAll(/(?:^|\s)([A-Da-d])[.)]\s*(.*?)(?=\s+[A-Da-da-d][.)]\s+|$)/g)];
  if (!body || matches.length < 2) return null;
  return {
    question: body,
    options: matches.map(match => ({ key: match[1].toUpperCase(), text: match[2].trim() })).filter(option => option.text)
  };
}

/** Removes only explicit leading labels/numbering; body words are not guessed at. */
export function cleanQuestionText(text) {
  let value = collapse(String(text || '').replace(/&(nbsp|#0*160|#x0*a0);/gi, ' ').replace(/<[^>]*>/g, ''));
  const labelled = value.match(QUESTION_START);
  if (labelled?.[1]) value = labelled[1];
  value = value.replace(/^\s*\d+\s*(?:\\)?[.)\-:]\s+/, '').replace(/\s+([?!.,;:])/g, '$1').replace(/([?!]){2,}/g, '$1');
  return sentenceCaseIfAllCaps(collapse(value));
}

export function normalizeQuestion(text) {
  return cleanQuestionText(text).normalize('NFKC').toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeForSimilarity(text) {
  return normalizeQuestion(text).replace(/\b(?:a|an|the)\b/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function validateQuestion(displayQuestion, options = [], sourceFormat = 'text') {
  const value = collapse(displayQuestion);
  if (!value) return { valid: false, status: 'rejected', reason: 'empty question' };
  if (UI_ARTIFACT.test(value) || /^(?:loading|submit|next|previous)$/i.test(value)) return { valid: false, status: 'rejected', reason: 'UI artifact rather than a question' };
  if (!/[\p{L}]{3,}/u.test(value)) return { valid: false, status: 'rejected', reason: 'question has no meaningful text' };
  if (value.length < 8 || value.split(/\s+/).length < 2) return { valid: false, status: 'rejected', reason: 'question is too short' };
  if (new Set(options.map(o => o.key)).size !== options.length) return { valid: false, status: 'rejected', reason: 'duplicate option labels' };
  if (sourceFormat === 'pdf' && /(?:\uFFFD|[|]{3,})/.test(value)) return { valid: false, status: 'rejected', reason: 'PDF text extraction appears corrupted' };
  return { valid: true, status: 'pending', reason: null };
}

function standardizeOptions(rawOptions) {
  if (!rawOptions) return [];
  const entries = Array.isArray(rawOptions) ? rawOptions : Object.entries(rawOptions).map(([key, text]) => ({ key, text }));
  return entries.map((item, index) => {
    if (!item) return null;
    if (typeof item === 'object' && item.key && item.text != null) return { key: String(item.key).replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase(), text: collapse(item.text) };
    const match = String(item).match(OPTION_LINE);
    return match ? { key: (match[1] || match[2]).toUpperCase(), text: collapse(match[3]) } : { key: String.fromCharCode(65 + index), text: collapse(item) };
  }).filter(option => option?.key && option.text);
}

export function prepareQuestion(rawQuestion, sourceFormat = 'text') {
  const original_text = String(rawQuestion.original_text ?? rawQuestion.question_text ?? '');
  const display_question = cleanQuestionText(rawQuestion.question_text ?? original_text);
  const canonical_question = normalizeQuestion(display_question);
  const options = standardizeOptions(rawQuestion.options);
  return { original_text, display_question, canonical_question, options, ...validateQuestion(display_question, options, sourceFormat) };
}

export function parsePlainText(content) {
  const result = []; let questionLines = []; let options = [];
  const commit = () => { if (questionLines.length) result.push({ original_text: [...questionLines, ...options.map(o => `${o.key}. ${o.text}`)].join('\n'), question_text: questionLines.join(' ').trim(), options }); questionLines = []; options = []; };
  for (const line of String(content || '').replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = line.trim().replace(/^#{1,6}\s*/, '');
    // Timers, score counters, and pagination chrome can be injected by copied UI/PDF text.
    // Discard them before they can become the current question stem.
    if (!trimmed || UI_ARTIFACT.test(trimmed) || ANSWER_LINE.test(trimmed) || /^#?\d+\s*\**(?:ANSWERED|PENDING)\**\s*$/i.test(trimmed) || /^source\s*:/i.test(trimmed)) continue;
    const inlineLabeled = splitInlineLabeledOptions(trimmed);
    if (inlineLabeled) {
      if (questionLines.length) commit();
      questionLines.push(inlineLabeled.question);
      options = inlineLabeled.options;
      continue;
    }
    const option = trimmed.match(OPTION_LINE);
    if (option && questionLines.length) { options.push({ key: (option[1] || option[2]).toUpperCase(), text: option[3] }); continue; }
    // Once a question has started, sequential 1)-4) lines are options. This
    // check intentionally precedes QUESTION_START so `1)Seismic` cannot start
    // a new question. Non-sequential numbered lines remain question starts.
    const numberedOption = trimmed.match(NUMBERED_OPTION_LINE);
    if (numberedOption && questionLines.length) {
      const expected = options.length + 1;
      if (Number(numberedOption[1]) === expected && expected <= 8) {
        options.push({ key: String.fromCharCode(64 + expected), text: numberedOption[2] });
        continue;
      }
    }
    const start = trimmed.match(QUESTION_START);
    if (start) {
      if (questionLines.length) commit();
      const inline = splitInlineOptions(start[1]);
      if (inline) {
        questionLines.push(inline.question);
        options = inline.options.map((text, index) => ({ key: String.fromCharCode(65 + index), text }));
      } else questionLines.push(start[1]);
      continue;
    }
    if (!questionLines.length) {
      const inline = splitInlineOptions(trimmed);
      if (inline) {
        questionLines.push(inline.question);
        options = inline.options.map((text, index) => ({ key: String.fromCharCode(65 + index), text }));
        continue;
      }
    }
    if (!questionLines.length) questionLines.push(trimmed);
    else if (options.length || /[?]$/.test(questionLines.at(-1))) {
      // A question ending in '?' followed by four bare lines is the common
      // unlabeled-MCQ format. Assign A-D in arrival order.
      if (options.length < 8) options.push({ key: String.fromCharCode(65 + options.length), text: trimmed });
      else options[options.length - 1].text += ` ${trimmed}`;
    } else questionLines.push(trimmed);
  }
  commit(); return result;
}

export function parseCSV(content) {
  const records = csvParse(content, { skip_empty_lines: true, trim: true, relax_column_count: true }); if (!records.length) return [];
  const header = records[0].map(v => String(v).toLowerCase().replace(/[^a-z0-9]/g, ''));
  const hasHeader = header.some(v => /question|stem|option/.test(v)); const qColumn = hasHeader ? Math.max(0, header.findIndex(v => /question|stem/.test(v))) : 0;
  const optionColumns = hasHeader ? header.map((value, index) => (/^(?:option)?[a-h]$|^option[a-h]$/.test(value) || value.startsWith('option') ? index : -1)).filter(index => index >= 0) : null;
  return records.slice(hasHeader ? 1 : 0).map(row => {
    const columns = optionColumns || row.map((_, i) => i).filter(i => i !== qColumn);
    return { original_text: row.join(','), question_text: row[qColumn], options: columns.map((i, position) => ({ key: optionColumns ? header[i].slice(-1).toUpperCase() : String.fromCharCode(65 + position), text: row[i] })).filter(option => option.text) };
  }).filter(q => q.question_text);
}

export function parseJSON(content) {
  const payload = typeof content === 'string' ? JSON.parse(content) : content;
  const list = Array.isArray(payload) ? payload : (payload?.questions || payload?.data || [payload]);
  return list.map(item => { const question = item?.question ?? item?.question_text ?? item?.text ?? item?.stem; return question ? { original_text: String(question), question_text: question, options: standardizeOptions(item.options ?? item.choices ?? []) } : null; }).filter(Boolean);
}

export function parseQuestions(content, format = 'text') {
  const clean = typeof content === 'string' ? content.replace(/^\uFEFF/, '') : content;
  if (!clean) return []; if (format === 'csv') return parseCSV(clean); if (format === 'json') return parseJSON(clean); return parsePlainText(clean);
}

export function areNearDuplicateQuestions(first, second) {
  const a = normalizeForSimilarity(first), b = normalizeForSimilarity(second); if (!a || !b) return false; if (a === b) return true;
  const max = Math.max(a.length, b.length); if (max < 12 || Math.abs(a.length - b.length) > Math.ceil(max * .1)) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return (max - prev[b.length]) / max >= .92;
}

export function parseAnswerPattern(patternText) {
  return (String(patternText || '').match(/\{([^}]+)\}/g) || []).map(raw => { const keys = [], texts = []; raw.slice(1, -1).split(',').map(x => x.trim()).filter(Boolean).forEach(part => { const match = part.match(/^\(?([A-Za-z])\)?(?:[.:\-\s]+(.*))?$/); if (!match) return; const key = match[1].toUpperCase(); if (!keys.includes(key)) keys.push(key); if (match[2]?.trim()) texts.push(match[2].trim()); }); return { raw, keys, answerKey: keys.join(', '), answerText: texts.join(', ') }; });
}
