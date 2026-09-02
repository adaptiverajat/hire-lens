/**
 * Skill normalisation. JDs and resumes describe the same capability in many
 * ways ("JS", "Javascript", "ECMAScript"); gap analysis is only meaningful if
 * both sides collapse to one canonical token.
 */

const ALIASES: Record<string, string> = {
  js: 'javascript',
  ecmascript: 'javascript',
  'node': 'node.js',
  nodejs: 'node.js',
  'node js': 'node.js',
  ts: 'typescript',
  py: 'python',
  golang: 'go',
  'c sharp': 'c#',
  csharp: 'c#',
  'dot net': '.net',
  dotnet: '.net',
  'asp net': 'asp.net',
  reactjs: 'react',
  'react js': 'react',
  'react.js': 'react',
  nextjs: 'next.js',
  'next js': 'next.js',
  vuejs: 'vue',
  'vue js': 'vue',
  angularjs: 'angular',
  postgres: 'postgresql',
  psql: 'postgresql',
  'ms sql': 'sql server',
  mssql: 'sql server',
  k8s: 'kubernetes',
  'amazon web services': 'aws',
  'google cloud platform': 'gcp',
  'microsoft azure': 'azure',
  ml: 'machine learning',
  'deep learning': 'deep learning',
  ai: 'artificial intelligence',
  nlp: 'natural language processing',
  'ci cd': 'ci/cd',
  cicd: 'ci/cd',
  'rest api': 'rest',
  restful: 'rest',
  'graph ql': 'graphql',
  tf: 'terraform',
  'unit testing': 'testing',
  'sql databases': 'sql',
};

/** Lowercases, strips punctuation noise and resolves known aliases. */
export function normaliseSkill(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[_/\\]+/g, ' ')
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[-\s]+|[-\s]+$/g, '')
    .trim();

  if (!cleaned) return '';

  // Try the alias table both with and without internal dots/hyphens.
  const candidates = [cleaned, cleaned.replace(/[.\-]/g, ' ').replace(/\s+/g, ' ').trim()];
  for (const candidate of candidates) {
    if (ALIASES[candidate]) return ALIASES[candidate];
  }

  return cleaned;
}

/** Human-facing label for a normalised token. */
export function displaySkill(normalised: string): string {
  const SPECIAL: Record<string, string> = {
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    'node.js': 'Node.js',
    'next.js': 'Next.js',
    postgresql: 'PostgreSQL',
    aws: 'AWS',
    gcp: 'GCP',
    azure: 'Azure',
    'ci/cd': 'CI/CD',
    graphql: 'GraphQL',
    rest: 'REST',
    sql: 'SQL',
    'c#': 'C#',
    '.net': '.NET',
    'asp.net': 'ASP.NET',
    kubernetes: 'Kubernetes',
    'sql server': 'SQL Server',
  };

  if (SPECIAL[normalised]) return SPECIAL[normalised];

  return normalised
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/** Deduplicates a list of raw skill strings by normalised form. */
export function dedupeSkills<T extends { skill: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];

  for (const item of items) {
    const key = normaliseSkill(item.skill);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, skill: key });
  }

  return out;
}
