/**
 * Best-effort client-side extraction of contact details from raw resume text.
 * Used to pre-fill the Add Candidate form so the recruiter doesn't have to
 * re-type what's already in the document. The user can always override.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;

export function extractEmailFromText(text: string): string | null {
  const match = text.match(EMAIL_RE);
  return match ? match[0].trim() : null;
}

export function extractPhoneFromText(text: string): string | null {
  const match = text.match(PHONE_RE);
  if (!match) return null;
  const phone = match[0].trim();
  // Avoid matching things that are clearly not phone numbers (e.g. long numbers).
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return phone;
}

export function extractFullNameFromText(text: string): string | null {
  const lines = text.split('\n').map((l) => l.trim());
  // Look at the first few non-empty lines for a plausible name (2-4 words, mostly letters).
  for (const line of lines.slice(0, 10)) {
    if (!line) continue;
    // Skip lines that look like contact info or section headers.
    if (EMAIL_RE.test(line) || PHONE_RE.test(line)) continue;
    if (/[@\d#]/.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Za-z][A-Za-z.'-]+$/.test(w))) {
      return line;
    }
  }
  return null;
}
