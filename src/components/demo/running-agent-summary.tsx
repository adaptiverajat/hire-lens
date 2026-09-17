'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Activity, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface RunningAgent {
  agent_name: string;
  task_type: string;
  candidate_id: string | null;
  job_id: string | null;
}

interface TraceDetail {
  type: 'start' | 'finish';
  agent?: string;
  candidateId?: string;
  jobId?: string;
}

const AGENT_ACTIVITY: Record<string, { stage: string; ai: string; orchestration: string }> = {
  'JD Agent': {
    stage: 'Extracting and weighting job requirements.',
    ai: 'A fast structured-output LLM converts the job description into validated fields.',
    orchestration: 'LangGraph will persist the requirements, then create privacy-filtered retrieval embeddings.',
  },
  'Resume Agent': {
    stage: 'Building an anonymised skills and experience profile.',
    ai: 'A privacy filter removes candidate PII before a structured-output LLM extracts resume evidence.',
    orchestration: 'LangGraph validates, normalises, stores, and indexes the resulting non-PII profile.',
  },
  'Evidence Retrieval Agent': {
    stage: 'Searching prior outcomes for relevant evidence.',
    ai: 'An embedding model performs semantic retrieval over privacy-filtered historical cases.',
    orchestration: 'Agentic RAG selects evidence that later reasoning agents can use for calibration.',
  },
  'Gap Analysis Agent': {
    stage: 'Comparing candidate evidence with weighted job requirements.',
    ai: 'A reasoning LLM assesses strengths, partial matches, gaps, and interview validation areas.',
    orchestration: 'The agent is anchored by deterministic coverage and can trigger a second targeted RAG pass.',
  },
  'Gap Analysis + Question Agent': {
    stage: 'Scoring role fit, retrieving gap evidence, and drafting targeted questions.',
    ai: 'Reasoning LLMs analyse evidence and generate structured, candidate-specific interview questions.',
    orchestration: 'A LangGraph supervisor routes analysis depth and runs iterative agentic RAG before persistence.',
  },
  'Question Agent': {
    stage: 'Drafting evidence-based interview questions and expected signals.',
    ai: 'A reasoning LLM targets verified strengths, uncertain claims, and role-critical gaps.',
    orchestration: 'The agent consumes gap-analysis artifacts and retrieved evidence, then stores a reusable question set.',
  },
  'Transcript Evaluation Agent': {
    stage: 'Evaluating interview answers against expected signals.',
    ai: 'A reasoning LLM scores technical and communication evidence using privacy-filtered transcript quotes.',
    orchestration: 'A reflexion loop validates quote grounding and retries the AI output when checks fail.',
  },
  'Red Flag Agent': {
    stage: 'Checking resume claims against interview evidence for inconsistencies.',
    ai: 'A fast LLM produces advisory, quote-backed findings and never makes the hiring decision.',
    orchestration: 'A parallel agent task validates evidence and can self-correct through reflexion before review.',
  },
  'Human Review Agent': {
    stage: 'Assembling the final evidence packet for a human reviewer.',
    ai: 'A reasoning LLM synthesises scores, flags, uncertainty, and comparable cases into a recommendation.',
    orchestration: 'Guardrails keep the result advisory and route unresolved high-severity flags to a person.',
  },
};

const DEFAULT_ACTIVITY = {
  stage: 'Executing the current recruitment-intelligence workflow stage.',
  ai: 'AI models process only privacy-filtered inputs and return schema-validated outputs.',
  orchestration: 'LangGraph coordinates tool calls, agent routing, validation, persistence, and human handoff.',
};

export function RunningAgentSummary() {
  const pathname = usePathname() ?? '';
  const [serverAgent, setServerAgent] = useState<RunningAgent | null>(null);
  const [traceAgent, setTraceAgent] = useState<RunningAgent | null>(null);
  const [polling, setPolling] = useState(false);

  const candidateMatch = pathname.match(/^\/candidates\/([a-f0-9-]+)$/);
  const jobMatch = pathname.match(/^\/jobs\/([a-f0-9-]+)(?:\/.*)?$/);
  const candidateId = candidateMatch?.[1];
  const jobId = candidateId ? undefined : jobMatch?.[1];

  useEffect(() => {
    setServerAgent(null);
    setTraceAgent(null);
    setPolling(false);
  }, [candidateId, jobId]);

  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    let timer: number | undefined;
    const controller = new AbortController();

    const load = async () => {
      try {
        const params = new URLSearchParams();
        if (candidateId) params.set('candidateId', candidateId);
        if (jobId) params.set('jobId', jobId);
        const query = params.toString();
        const response = await fetch(
          `/api/agent-status${query ? `?${query}` : ''}`,
          { cache: 'no-store', signal: controller.signal },
        );
        if (!response.ok) {
          if (!cancelled) setPolling(false);
          return;
        }
        const agent = (await response.json()) as RunningAgent | null;
        if (cancelled) return;
        setServerAgent(agent);
        if (agent) timer = window.setTimeout(() => void load(), 3000);
        else setPolling(false);
      } catch {
        if (!cancelled) setPolling(false);
      }
    };

    timer = window.setTimeout(() => void load(), 500);

    return () => {
      cancelled = true;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [candidateId, jobId, polling]);

  useEffect(() => {
    const handleTrace = (event: Event) => {
      const detail = (event as CustomEvent<TraceDetail>).detail;
      if (!detail.agent) return;
      if (candidateId && detail.candidateId !== candidateId) return;
      if (!candidateId && jobId && detail.jobId !== jobId) return;
      if (detail.type === 'finish') {
        setTraceAgent(null);
        setServerAgent(null);
        setPolling(false);
        return;
      }
      setPolling(true);
      setTraceAgent({
        agent_name: detail.agent,
        task_type: detail.agent,
        candidate_id: detail.candidateId ?? null,
        job_id: null,
      });
    };

    window.addEventListener('hirelens-trace', handleTrace);
    return () => window.removeEventListener('hirelens-trace', handleTrace);
  }, [candidateId, jobId]);

  const activeAgent = serverAgent ?? traceAgent;
  if (!activeAgent) return null;
  const activity = AGENT_ACTIVITY[activeAgent.agent_name] ?? AGENT_ACTIVITY[activeAgent.task_type] ?? DEFAULT_ACTIVITY;

  return (
    <div
      id="running-agent-summary"
      className={cn(
        'mb-6 flex items-start gap-3 rounded-md border border-primary/20 bg-primary/5 px-4 py-3',
        'text-sm shadow-sm',
      )}
      role="status"
      aria-live="polite"
    >
      <div className="mt-0.5 flex shrink-0 items-center gap-2">
        <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
        <Activity className="size-4 text-primary" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Agentic AI workflow running: {activeAgent.agent_name}</span>
          {activeAgent.candidate_id && (
            <Badge variant="outline" className="font-mono text-[10px]">
              Candidate {activeAgent.candidate_id.slice(0, 8)}
            </Badge>
          )}
        </div>
        <p><span className="font-medium">Current stage:</span> {activity.stage}</p>
        <p className="text-muted-foreground"><span className="font-medium text-foreground">AI involvement:</span> {activity.ai}</p>
        <p className="text-muted-foreground"><span className="font-medium text-foreground">Agentic orchestration:</span> {activity.orchestration}</p>
      </div>
    </div>
  );
}