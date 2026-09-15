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

export function RunningAgentSummary() {
  const pathname = usePathname() ?? '';
  const [serverAgent, setServerAgent] = useState<RunningAgent | null>(null);
  const [serverLoaded, setServerLoaded] = useState(false);
  const [traceAgent, setTraceAgent] = useState<RunningAgent | null>(null);

  const candidateMatch = pathname.match(/^\/candidates\/([a-f0-9-]+)$/);
  const jobMatch = pathname.match(/^\/jobs\/([a-f0-9-]+)(?:\/.*)?$/);
  const candidateId = candidateMatch?.[1];
  const jobId = candidateId ? undefined : jobMatch?.[1];

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const controller = new AbortController();

    setServerAgent(null);
    setServerLoaded(false);
    setTraceAgent(null);

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
        if (!response.ok) return;
        const agent = (await response.json()) as RunningAgent | null;
        if (!cancelled) {
          setServerAgent(agent);
          setServerLoaded(true);
        }
      } catch {
        // The API may be unavailable during startup, refresh, or navigation.
        if (!cancelled) setServerLoaded(true);
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(() => void load(), 5000);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [candidateId, jobId]);

  useEffect(() => {
    const handleTrace = (event: Event) => {
      const detail = (event as CustomEvent<TraceDetail>).detail;
      if (!detail.agent) return;
      if (candidateId && detail.candidateId !== candidateId) return;
      if (!candidateId && jobId && detail.jobId !== jobId) return;
      if (detail.type === 'finish') {
        setTraceAgent(null);
        return;
      }
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

  const activeAgent = serverLoaded ? serverAgent : traceAgent;
  if (!activeAgent) return null;

  return (
    <div
      id="running-agent-summary"
      className={cn(
        'mb-6 flex items-center gap-3 rounded-md border border-primary/20 bg-primary/5 px-4 py-3',
        'text-sm shadow-sm',
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
      <Activity className="size-4 text-primary" aria-hidden />
      <span className="font-medium">Running now: {activeAgent.agent_name}</span>
      {activeAgent.candidate_id && (
        <Badge variant="outline" className="ml-auto font-mono text-[10px]">
          Candidate {activeAgent.candidate_id.slice(0, 8)}
        </Badge>
      )}
    </div>
  );
}