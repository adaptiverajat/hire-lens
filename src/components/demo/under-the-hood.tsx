'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useDemo, type CandidateAgentLog } from '@/lib/demo/store';
import { PROMPTS } from '@/lib/demo/prompts';
import { getWorkflowStages } from '@/lib/demo/workflows';
import { WorkflowPath } from '@/components/demo/agent-graph';
import { api } from '@/lib/api/client';
import { maskName, toCamelCase } from '@/lib/utils/mask';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Cpu, ChevronDown, ChevronUp, Activity, Check, Loader2, X } from 'lucide-react';

interface Trace {
  id: string;
  type: 'start' | 'finish';
  path: string;
  method: string;
  agent?: string;
  status?: number;
  error?: string;
  candidateId?: string;
  jobId?: string;
  timestamp: number;
  tokenUsage?: Record<string, { promptTokens: number; completionTokens: number; totalTokens: number }>;
}

/** Masks a candidate name when demo is enabled, always camel-cases. */
function displayName(name: string, demoEnabled: boolean): string {
  if (!name) return name;
  const camel = toCamelCase(name) ?? name;
  if (!demoEnabled) return camel;
  return maskName(camel, true) ?? camel;
}

/** Extracts candidate ID from a pathname like /candidates/abc-123. */
function candidateIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/\/candidates\/([a-f0-9-]+)/);
  return match?.[1];
}

function jobIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/\/jobs\/([a-f0-9-]+)/);
  return match?.[1];
}

export function UnderTheHood() {
  const demo = useDemo();
  const pathname = usePathname() ?? '';
  const stages = useMemo(() => getWorkflowStages(pathname), [pathname]);
  const currentCandidateId = useMemo(() => candidateIdFromPath(pathname), [pathname]);
  const currentJobId = useMemo(() => jobIdFromPath(pathname), [pathname]);
  const isJobOverview = /^\/jobs\/[a-f0-9-]+$/.test(pathname);

  const [minimized, setMinimized] = useState(false);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>(stages[0] ?? '');
  const [currentCandidateName, setCurrentCandidateName] = useState<string>('');
  const demoRef = useRef(demo);
  demoRef.current = demo;

  // Fetch the current candidate's name for the WorkflowPath title.
  // Also re-check the store when candidateLogs changes (e.g. after a trace
  // event creates the entry with "Unknown candidate" and the API fetch later
  // fills in the real name).
  useEffect(() => {
    if (!currentCandidateId) {
      setCurrentCandidateName('');
      return;
    }
    // Check if we already have the name in the store.
    const existing = demo.state.candidateLogs[currentCandidateId];
    if (existing && existing.name && existing.name !== 'Unknown candidate') {
      setCurrentCandidateName(existing.name);
      return;
    }
    // Fetch the candidate's name from the API.
    let cancelled = false;
    api.get<{ full_name: string }>(`/candidates/${currentCandidateId}`)
      .then((res) => {
        if (cancelled) return;
        const name = res.full_name ?? 'Unknown candidate';
        setCurrentCandidateName(name);
        if (name !== 'Unknown candidate') {
          demo.setCandidateName(currentCandidateId, name);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentCandidateName('');
          demo.removeCandidateLog(currentCandidateId);
        }
      });
    return () => { cancelled = true; };
  }, [currentCandidateId, demo.state.candidateLogs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch names for ALL candidates in the logs that still have "Unknown candidate".
  // This ensures workflow path titles show real names, not alphanumeric IDs.
  useEffect(() => {
    if (!demo.state.enabled) return;
    const entries = Object.values(demo.state.candidateLogs);
    const unknown = entries.filter(
      (e) => (!e.name || e.name === 'Unknown candidate') && e.candidateId,
    );
    if (unknown.length === 0) return;

    let cancelled = false;
    for (const entry of unknown) {
      api
        .get<{ full_name: string }>(`/candidates/${entry.candidateId}`)
        .then((res) => {
          if (cancelled) return;
          const name = res.full_name ?? 'Unknown candidate';
          if (name !== 'Unknown candidate') {
            demo.setCandidateName(entry.candidateId, name);
          }
        })
        .catch(() => {
          // Remove deleted candidates so the stale ID is not retried forever.
          demo.removeCandidateLog(entry.candidateId);
        });
    }
    return () => { cancelled = true; };
  }, [demo.state.enabled, demo.state.candidateLogs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handle = (event: Event) => {
      const detail = (event as CustomEvent).detail as Trace & { timestamp: number };

      setTraces((prev) => {
        const next = [...prev];
        if (detail.type === 'start') {
          next.push({ ...detail, id: `${detail.timestamp}-${detail.agent}-${Math.random()}` });
        } else {
          const started = [...next]
            .reverse()
            .find((t) => t.path === detail.path && t.type === 'start' && t.agent === detail.agent);
          if (started) {
            next[next.indexOf(started)] = { ...started, ...detail, type: 'finish' };
          }
        }
        return next.slice(-40);
      });

      // Update candidate logs and global completion state OUTSIDE the setTraces
      // updater, using only data available on the event detail itself.
      const d = demoRef.current;
      if (detail.candidateId && detail.agent) {
        if (detail.type === 'start') {
          d.logCandidateAgent(detail.candidateId, '', detail.agent, 'running');
        } else {
          // Extract this agent's token usage from the trace event.
          const agentUsage = detail.tokenUsage?.[detail.agent];
          d.logCandidateAgent(
            detail.candidateId,
            '',
            detail.agent,
            detail.error ? 'failed' : 'complete',
            agentUsage,
          );
          if (!detail.error) {
            d.markAgentComplete(detail.agent);
          }
        }
      } else if (detail.jobId && detail.agent === 'JD Agent') {
        const agentUsage = detail.tokenUsage?.[detail.agent];
        d.logJobAgent(
          detail.jobId,
          detail.agent,
          detail.type === 'start' ? 'running' : detail.error ? 'failed' : 'complete',
          agentUsage,
        );
        if (detail.type === 'finish' && !detail.error) d.markAgentComplete(detail.agent);
      }
    };

    window.addEventListener('hirelens-trace', handle);
    return () => window.removeEventListener('hirelens-trace', handle);
  }, []);

  // Per-candidate completed agents — derived from candidateLogs, NOT the global list.
  // This ensures agents only show green for the candidate they actually ran for.
  // Render-time inference: if agent at lifecycle index N is complete, all prior
  // agents (0..N-1) are implicitly complete too. This catches cases where JD Agent
  // ran on a job (no candidateId in the trace) but was never directly logged for
  // the candidate.
  const LIFECYCLE_ORDER = [
    'JD Agent', 'Resume Agent', 'Evidence Retrieval Agent',
    'Gap Analysis + Question Agent', 'Transcript Evaluation Agent',
    'Red Flag Agent', 'Human Review Agent',
  ];

  // Build inferred agent status for ALL candidates (used by the agent-runs list)
  // and for the current candidate (used by the WorkflowPath).
  // Inference: the latest valid running agent is the current stage. Earlier stages
  // are complete, and a later completion supersedes stale running states.
  const inferredLogs = useMemo(() => {
    return Object.values(demo.state.candidateLogs)
      .map((entry) => {
        const statusMap = new Map(entry.agents.map((a) => [a.agent, a.status]));
        const highestRunningIndex = LIFECYCLE_ORDER.reduce(
          (highest, agent, index) =>
            statusMap.get(agent) === 'running' ? index : highest,
          -1,
        );
        const highestCompletedIndex = LIFECYCLE_ORDER.reduce(
          (highest, agent, index) =>
            statusMap.get(agent) === 'complete' ? index : highest,
          -1,
        );
        const runningIndex = highestRunningIndex > highestCompletedIndex ? highestRunningIndex : -1;

        const inferred = LIFECYCLE_ORDER.map((agentName, i) => {
          const existing = entry.agents.find((a) => a.agent === agentName);

          if (existing?.status === 'failed') {
            return existing;
          }

          if (runningIndex >= 0 && i < runningIndex) {
            return { agent: agentName, status: 'complete' as const, timestamp: existing?.timestamp ?? entry.updatedAt };
          }

          if (runningIndex >= 0 && i === runningIndex) {
            return existing ?? { agent: agentName, status: 'running' as const, timestamp: entry.updatedAt };
          }

          if (runningIndex < 0 && i <= highestCompletedIndex) {
            return { agent: agentName, status: 'complete' as const, timestamp: existing?.timestamp ?? entry.updatedAt };
          }

          if (existing?.status === 'complete') return existing;
          return null;
        }).filter(Boolean) as CandidateAgentLog[];
        return { ...entry, agents: inferred };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [demo.state.candidateLogs]);

  // Agent status map for the current candidate — drives the prompt selector.
  const currentAgentStatus = useMemo(() => {
    const status: Record<string, 'running' | 'complete' | 'failed'> = {};
    if (!currentCandidateId) return status;
    const entry = inferredLogs.find((e) => e.candidateId === currentCandidateId);
    if (!entry) return status;
    for (const a of entry.agents) {
      status[a.agent] = a.status;
    }
    return status;
  }, [inferredLogs, currentCandidateId]);

  // Per-candidate status maps for ALL candidates — drives the stacked WorkflowPaths.
  const allCandidateStatus = useMemo(() => {
    return inferredLogs.map((entry) => {
      const status: Record<string, 'running' | 'complete' | 'failed'> = {};
      for (const a of entry.agents) {
        status[a.agent] = a.status;
      }
      return {
        candidateId: entry.candidateId,
        name: entry.name,
        status,
        updatedAt: entry.updatedAt,
      };
    });
  }, [inferredLogs]);

  const currentJobRun = useMemo(() => {
    const entry = currentJobId ? demo.state.jobLogs[currentJobId] : undefined;
    if (!entry) return null;
    return {
      ...entry,
      status: Object.fromEntries(entry.agents.map((agent) => [agent.agent, agent.status])),
    };
  }, [currentJobId, demo.state.jobLogs]);

  // Prefer the workflow for the page's current candidate, then any active
  // workflow, then the most recently updated workflow.
  const currentWorkflowEntry = useMemo(() => {
    if (allCandidateStatus.length === 0) return null;

    const currentCandidate = currentCandidateId
      ? allCandidateStatus.find((entry) => entry.candidateId === currentCandidateId)
      : undefined;
    if (currentCandidate) return currentCandidate;

    const running = allCandidateStatus.find((c) =>
      Object.values(c.status).some((s) => s === 'running'),
    );
    return running ?? allCandidateStatus[0];
  }, [allCandidateStatus, currentCandidateId]);

  // The active agent for the prompt selector — first running agent, or first completed.
  const activeAgent = useMemo(() => {
    for (const agent of LIFECYCLE_ORDER) {
      if (currentAgentStatus[agent] === 'running') return agent;
    }
    for (const agent of LIFECYCLE_ORDER) {
      if (currentAgentStatus[agent] === 'complete') return agent;
    }
    return undefined;
  }, [currentAgentStatus]);

  useEffect(() => {
    const next = activeAgent && stages.includes(activeAgent) ? activeAgent : stages[0] ?? '';
    setSelectedAgent((prev) => (stages.includes(prev) ? prev : next));
  }, [activeAgent, stages]);

  const defaultPrompt = useMemo(() => PROMPTS[selectedAgent], [selectedAgent]);
  const override = demo.getPrompt(selectedAgent);
  const editable = Boolean(defaultPrompt);
  const [draft, setDraft] = useState({
    system: override?.system ?? defaultPrompt?.system ?? '',
    user: override?.user ?? defaultPrompt?.user ?? '',
  });

  useEffect(() => {
    setDraft({
      system: override?.system ?? defaultPrompt?.system ?? '',
      user: override?.user ?? defaultPrompt?.user ?? '',
    });
  }, [selectedAgent, override, defaultPrompt]);

  if (!demo.state.enabled) return null;

  return (
    <>
    <div className="h-[200px]" aria-hidden="true" />
    <Card id="demo-under-the-hood-card" className="border-primary/20 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Cpu className="h-4 w-4 text-primary" />
          Under the hood
          <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
            DEMO
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMinimized((m) => !m)}
            className="h-7 w-7 p-0"
          >
            {minimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CardTitle>
      </CardHeader>

      {!minimized && (
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <section id="under-the-hood-current-workflow" className="lg:col-span-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Activity className="h-4 w-4" />
                Current workflow
              </div>
              {currentJobRun && isJobOverview ? (
                <WorkflowPath
                  stages={['JD Agent']}
                  agentStatus={currentJobRun.status}
                  title={`Job ${currentJobRun.jobId.slice(0, 8)}`}
                  onSelect={setSelectedAgent}
                />
              ) : currentWorkflowEntry ? (
                <WorkflowPath
                  stages={stages}
                  agentStatus={currentWorkflowEntry.status}
                  title={currentWorkflowEntry.name && currentWorkflowEntry.name !== 'Unknown candidate'
                    ? displayName(currentWorkflowEntry.name, demo.state.enabled)
                    : currentWorkflowEntry.candidateId.slice(0, 8)}
                  onSelect={setSelectedAgent}
                />
              ) : currentJobRun ? (
                <WorkflowPath
                  stages={['JD Agent']}
                  agentStatus={currentJobRun.status}
                  title={`Job ${currentJobRun.jobId.slice(0, 8)}`}
                  onSelect={setSelectedAgent}
                />
              ) : (
                <WorkflowPath
                  stages={stages}
                  agentStatus={{}}
                  onSelect={setSelectedAgent}
                />
              )}
            </section>

            <section id="under-the-hood-agent-runs" className="lg:col-span-1">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Activity className="h-4 w-4" />
                  Log: Agent runs per candidate
                </div>
                {inferredLogs.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => demo.clearCandidateLogs()}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <ScrollArea className="h-64 rounded-md border bg-muted/30 p-3">
                {inferredLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No agent runs recorded yet. Analyse a candidate to see the
                    pipeline here.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {inferredLogs.map((entry) => (
                      <div
                        key={entry.candidateId}
                        id={`candidate-agent-log-${entry.candidateId}`}
                        className="space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-foreground">
                            {displayName(entry.name, demo.state.enabled)}
                          </p>
                          <span className="font-mono text-[9px] text-muted-foreground/60">
                            {new Date(entry.updatedAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <ul className="space-y-1">
                          {entry.agents.map((agentLog) => (
                            <AgentStatusRow key={agentLog.agent} agentLog={agentLog} />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </section>

            <section id="under-the-hood-prompt-editor" className="space-y-3 lg:col-span-2">
              <div className="flex items-center gap-3">
                <label htmlFor="agent-select" className="text-sm font-medium">
                  Active agent prompt
                </label>
                <select
                  id="agent-select"
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {stages.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                {override ? (
                  <Badge variant="secondary" className="text-[10px]">
                    custom
                  </Badge>
                ) : null}
              </div>

              {editable ? (
                <>
                  <div className="space-y-2">
                    <label
                      htmlFor="system-prompt"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      System prompt
                    </label>
                    <Textarea
                      id="system-prompt"
                      value={draft.system}
                      onChange={(e) => setDraft((d) => ({ ...d, system: e.target.value }))}
                      rows={6}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="user-prompt"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      User prompt template
                    </label>
                    <Textarea
                      id="user-prompt"
                      value={draft.user}
                      onChange={(e) => setDraft((d) => ({ ...d, user: e.target.value }))}
                      rows={6}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" onClick={() => demo.setPrompt(selectedAgent, draft)}>
                      Save override
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => demo.resetPrompt(selectedAgent)}
                    >
                      Reset to default
                    </Button>
                  </div>
                </>
              ) : (
                <p className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  {selectedAgent
                    ? `${selectedAgent} does not use an LLM prompt.`
                    : 'Select a stage to view or edit its prompt.'}
                </p>
              )}

              <Separator />

              <p className="text-xs text-muted-foreground">
                Demo overrides are sent with the next API call. The server will use your custom
                system and user prompt for the selected agent. OpenAI and Supabase credentials are
                still read from .env.local.
              </p>
            </section>
          </div>
        </CardContent>
      )}
    </Card>

    {demo.state.showAgentRunsPerCandidate && <Card id="demo-workflow-paths-card" className="mt-4 border-primary/20 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Cpu className="h-4 w-4 text-primary" />
          Agent runs per candidate
          <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
            DEMO
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <section id="under-the-hood-workflow-stack">
          {allCandidateStatus.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No workflow paths yet. Run any agent to see candidate workflows here.
            </p>
          ) : (
            <div id="workflow-path-stack" className="space-y-3 pr-1">
              {allCandidateStatus.map((c) => (
                <WorkflowPath
                  key={c.candidateId}
                  stages={stages}
                  agentStatus={c.status}
                  title={c.name && c.name !== 'Unknown candidate' ? displayName(c.name, demo.state.enabled) : c.candidateId.slice(0, 8)}
                  onSelect={setSelectedAgent}
                />
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>}
    </>
  );
}

function AgentStatusRow({ agentLog }: { agentLog: CandidateAgentLog }) {
  const icon = agentLog.status === 'running' ? (
    <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
  ) : agentLog.status === 'complete' ? (
    <Check className="h-3 w-3 text-emerald-600" />
  ) : (
    <X className="h-3 w-3 text-rose-500" />
  );

  return (
    <li className="flex items-center gap-2 text-[11px]">
      {icon}
      <span className={cn(
        'truncate',
        agentLog.status === 'running' && 'text-amber-700 dark:text-amber-400',
        agentLog.status === 'complete' && 'text-emerald-700 dark:text-emerald-400',
        agentLog.status === 'failed' && 'text-rose-600',
      )}>
        {agentLog.agent}
      </span>
      <span className="ml-auto font-mono text-[9px] text-muted-foreground/50">
        {new Date(agentLog.timestamp).toLocaleTimeString()}
      </span>
    </li>
  );
}
