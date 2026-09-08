/**
 * Client-side fetch wrapper. Auth rides on Supabase cookies, so there is no
 * token handling here at all - the whole class of bug where a component forgets
 * to attach a header cannot happen.
 */

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

const AGENT_BY_PATH: Record<string, string> = {
  '/documents/extract': 'Resume Agent',
};

// The /analyze call runs agents server-side in sequence.
const ANALYZE_SUB_AGENTS = ['Evidence Retrieval Agent', 'Gap Analysis + Question Agent'];

// The /transcripts/:id/evaluate call runs agents server-side in sequence.
const TRANSCRIPT_SUB_AGENTS = [
  'Evidence Retrieval Agent',
  'Transcript Evaluation Agent',
  'Red Flag Agent',
  'Human Review Agent',
];

function inferAgent(path: string): string | undefined {
  if (path.includes('/jobs/') && path.endsWith('/parse')) return 'JD Agent';
  if (path.includes('/candidates/') && path.endsWith('/parse')) return 'Resume Agent';
  if (path.includes('/candidates/') && path.endsWith('/analyze')) return 'Gap Analysis + Question Agent';
  if (path.includes('/questions')) return 'Question Agent';
  if (path.includes('/transcripts/') && path.endsWith('/evaluate')) return 'Transcript Evaluation Agent';
  if (path.includes('/flags')) return 'Red Flag Agent';
  if (path.includes('/review')) return 'Human Review Agent';
  if (path.includes('/knowledge')) return 'Evidence Retrieval Agent';
  return AGENT_BY_PATH[path];
}

/** Extracts a candidate ID from API paths like /candidates/abc-123/analyze. */
function extractCandidateId(path: string): string | undefined {
  const match = path.match(/\/candidates\/([a-f0-9-]+)/);
  return match?.[1];
}

/** Extracts a job ID from API paths like /jobs/abc-123/parse. */
function extractJobId(path: string): string | undefined {
  const match = path.match(/\/jobs\/([a-f0-9-]+)/);
  return match?.[1];
}

function getDemoHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('hirelens_demo');
    if (!raw) return {};
    const demo = JSON.parse(raw) as {
      enabled?: boolean;
      credentials?: Record<string, string>;
      prompts?: Record<string, { system: string; user: string }>;
    };
    if (!demo.enabled) return {};

    const headers: Record<string, string> = { 'x-demo-enabled': 'true' };
    if (demo.prompts && Object.keys(demo.prompts).length > 0) {
      headers['x-demo-prompts'] = JSON.stringify(demo.prompts);
    }
    return headers;
  } catch {
    return {};
  }
}

function emitTrace(
  type: 'start' | 'finish',
  payload: { path: string; method?: string; agent?: string; status?: number; error?: string; candidateId?: string; jobId?: string; tokenUsage?: Record<string, { promptTokens: number; completionTokens: number; totalTokens: number }> }
) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('hirelens-trace', {
      detail: { type, ...payload, timestamp: Date.now() },
    })
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET';
  const agent = inferAgent(path);
  const candidateId = extractCandidateId(path);
  const jobId = extractJobId(path);
  const isAnalyze = path.includes('/candidates/') && path.endsWith('/analyze');
  const isTranscriptEval = path.includes('/transcripts/') && path.endsWith('/evaluate');
  const isMultiAgent = isAnalyze || isTranscriptEval;
  const subAgents = isAnalyze
    ? ANALYZE_SUB_AGENTS
    : isTranscriptEval
      ? TRANSCRIPT_SUB_AGENTS
      : null;

  // Emit start traces for all sub-agents when the call runs multiple agents.
  if (isMultiAgent && subAgents) {
    for (const subAgent of subAgents) {
      emitTrace('start', { path, method, agent: subAgent, candidateId, jobId });
    }
  } else {
    emitTrace('start', { path, method, agent, candidateId, jobId });
  }

  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...getDemoHeaders(),
      ...init?.headers,
    },
  });

  if (response.status === 401) {
    // Session is gone; middleware will redirect on the next navigation.
    if (isMultiAgent && subAgents) {
      for (const subAgent of subAgents) {
        emitTrace('finish', { path, method, agent: subAgent, status: 401, error: 'Session expired', candidateId, jobId });
      }
    } else {
      emitTrace('finish', { path, method, agent, status: 401, error: 'Session expired', candidateId, jobId });
    }
    window.location.href = '/login';
    throw new ApiClientError(401, 'Session expired');
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const error =
      payload?.error ?? `Request failed with status ${response.status}`;
    if (isMultiAgent && subAgents) {
      for (const subAgent of subAgents) {
        emitTrace('finish', { path, method, agent: subAgent, status: response.status, error, candidateId, jobId });
      }
    } else {
      emitTrace('finish', { path, method, agent, status: response.status, error, candidateId, jobId });
    }
    throw new ApiClientError(
      response.status,
      error,
      payload?.details
    );
  }

  // Extract token usage from the response payload.
  const tokenUsage = payload?.token_usage as
    | Record<string, { promptTokens: number; completionTokens: number; totalTokens: number }>
    | undefined;

  // For transcript evaluation, the candidate ID isn't in the URL — extract it
  // from the response payload so traces are attributed to the right candidate.
  const effectiveCandidateId = candidateId ?? payload?.candidate_id;

  if (isMultiAgent && subAgents) {
    for (const subAgent of subAgents) {
      emitTrace('finish', { path, method, agent: subAgent, status: response.status, candidateId: effectiveCandidateId, jobId, tokenUsage });
    }
  } else {
    emitTrace('finish', { path, method, agent, status: response.status, candidateId: effectiveCandidateId, jobId, tokenUsage });
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),

  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),

  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  /** Uploads a document and returns its extracted text. */
  extractText: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ text: string; file_name: string; characters: number }>(
      '/documents/extract',
      { method: 'POST', body: form }
    );
  },
};
