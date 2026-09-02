import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

export const SUPPORTED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/vtt',
  'application/json',
] as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export class UnsupportedDocumentError extends Error {
  constructor(mimeType: string) {
    super(`Unsupported file type: ${mimeType || 'unknown'}. Upload a PDF, DOCX or plain text file.`);
    this.name = 'UnsupportedDocumentError';
  }
}

function isDocx(mimeType: string, fileName: string) {
  return (
    mimeType.includes('officedocument.wordprocessingml') ||
    mimeType === 'application/msword' ||
    fileName.toLowerCase().endsWith('.docx')
  );
}

function isPdf(mimeType: string, fileName: string) {
  return mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
}

/**
 * Extracts plain text from an uploaded document.
 * `unpdf` is used for PDFs because it works in serverless runtimes without the
 * canvas/DOM polyfills that pdfjs' browser build needs.
 */
export async function extractDocumentText(
  buffer: ArrayBuffer,
  mimeType: string,
  fileName = ''
): Promise<string> {
  if (isPdf(mimeType, fileName)) {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return normaliseWhitespace(Array.isArray(text) ? text.join('\n') : text);
  }

  if (isDocx(mimeType, fileName)) {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return normaliseWhitespace(value);
  }

  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    /\.(txt|vtt|md|json)$/i.test(fileName)
  ) {
    return normaliseWhitespace(new TextDecoder().decode(buffer));
  }

  throw new UnsupportedDocumentError(mimeType);
}

/** Collapses the ragged whitespace PDF extraction tends to produce. */
export function normaliseWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}
