function toCamelCase(value: string | null | undefined): string | null | undefined {
  if (!value) return value;
  return value
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function mask(value: string | null | undefined, demo = true): string | null | undefined {
  if (!demo) return value;
  if (!value || value.length <= 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  const middle = '*'.repeat(value.length - 2);
  return `${first}${middle}${last}`;
}

function maskName(value: string | null | undefined, demo = true): string | null | undefined {
  const normalized = toCamelCase(value);
  if (!normalized) return normalized;
  if (!demo) return normalized;
  if (normalized.length <= 2) return normalized;
  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  const middle = 'x'.repeat(normalized.length - 2);
  return `${first}${middle}${last}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function maskText(
  value: string | null | undefined,
  name: string | null | undefined,
  demo = true
): string | null | undefined {
  if (!demo || !value || !name) return value;
  let out = value;
  const full = name.trim();
  if (full.length > 2) {
    out = out.replace(new RegExp(escapeRegExp(full), 'gi'), maskName(full, true) ?? '');
  }
  for (const part of full.split(/\s+/)) {
    if (part.length <= 2) continue;
    out = out.replace(
      new RegExp(`\\b${escapeRegExp(part)}\\b`, 'gi'),
      maskName(part, true) ?? ''
    );
  }
  return out;
}

export { maskName, maskText, toCamelCase };
export const maskEmail = mask;
export const maskPhone = mask;
