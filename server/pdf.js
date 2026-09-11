// Import the library implementation rather than its debug-oriented package entry.
import pdf from 'pdf-parse/lib/pdf-parse.js';

const MAX_PDF_PAGES = 100;

/** Extract text only; no PDF content is ever rendered or executed by the server. */
export async function extractPdfText(buffer) {
  const result = await pdf(buffer, { max: MAX_PDF_PAGES });
  const text = String(result.text || '').trim();
  if (!text) throw Object.assign(new Error('No readable text was found in the PDF.'), { statusCode: 400 });
  if (text.length > 1_000_000) throw Object.assign(new Error('Extracted PDF text exceeds the allowed size.'), { statusCode: 400 });
  return text;
}
