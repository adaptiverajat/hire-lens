export interface PiiContext {
  names?: Array<string | null | undefined>;
  emails?: Array<string | null | undefined>;
  phones?: Array<string | null | undefined>;
  locations?: Array<string | null | undefined>;
  institutions?: Array<string | null | undefined>;
}

const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const URL = /\b(?:https?:\/\/|www\.)\S+/gi;
const INSTITUTION = /\b(?:university|college|institute|school of|academy)\b/i;
const EDUCATION_HEADING = /^\s*(?:education|academic (?:background|qualifications?)|qualifications?)\s*:?[\s-]*$/i;
const SECTION_HEADING = /^\s*(?:experience|employment|work history|projects?|skills?|certifications?|summary|profile|awards?|publications?|languages?|interests?)\s*:?[\s-]*$/i;
const PRIVATE_KEYS = /(?:candidate_?name|full_?name|e-?mail|phone|mobile|location|address|institution|college|university|participants?)/i;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function present(values: Array<string | null | undefined> | undefined): string[] {
  return (values ?? []).map((value) => value?.trim() ?? '').filter((value) => value.length > 1);
}

export function redactPii(text: string, context: PiiContext = {}): string {
  let redacted = text
    .replace(EMAIL, '[EMAIL REDACTED]')
    .replace(URL, '[URL REDACTED]')
    .replace(PHONE, (value) => {
      const digits = value.replace(/\D/g, '');
      return digits.length >= 7 && digits.length <= 15 ? '[PHONE REDACTED]' : value;
    });

  const knownValues = [
    ...present(context.names),
    ...present(context.emails),
    ...present(context.phones),
    ...present(context.locations),
    ...present(context.institutions),
  ].sort((a, b) => b.length - a.length);

  for (const value of knownValues) {
    redacted = redacted.replace(new RegExp(escapeRegex(value), 'gi'), '[PII REDACTED]');
  }

  return redacted
    .split('\n')
    .map((line) => {
      if (INSTITUTION.test(line)) return '[EDUCATION INSTITUTION REDACTED]';
      if (/^\s*(?:name|e-?mail|phone|mobile|location|address)\s*:/i.test(line)) {
        return `${line.split(':', 1)[0]}: [PII REDACTED]`;
      }
      return line;
    })
    .join('\n');
}

export function redactResumePii(resume: string, context: PiiContext = {}): string {
  let inEducation = false;
  const lines = redactPii(resume, context).split('\n');

  return lines
    .map((line) => {
      if (EDUCATION_HEADING.test(line)) {
        inEducation = true;
        return 'EDUCATION\n[EDUCATION DETAILS REDACTED]';
      }
      if (inEducation && SECTION_HEADING.test(line)) inEducation = false;
      return inEducation ? '' : line;
    })
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n');
}

export function sanitizeLlmInput(
  input: Record<string, unknown>,
  context: PiiContext = {},
): Record<string, unknown> {
  const sanitize = (value: unknown, key = ''): unknown => {
    if (PRIVATE_KEYS.test(key)) {
      if (Array.isArray(value)) return value.length ? ['[PII REDACTED]'] : [];
      return value == null ? value : '[PII REDACTED]';
    }
    if (typeof value === 'string') {
      return key === 'resume' ? redactResumePii(value, context) : redactPii(value, context);
    }
    if (Array.isArray(value)) return value.map((item) => sanitize(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => [
          nestedKey,
          sanitize(nestedValue, nestedKey),
        ]),
      );
    }
    return value;
  };

  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, sanitize(value, key)]),
  );
}
