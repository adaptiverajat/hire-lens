'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

export interface DemoCredentials {
  openaiKey: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
}

export interface PromptOverride {
  system: string;
  user: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CandidateAgentLog {
  agent: string;
  status: 'running' | 'complete' | 'failed';
  timestamp: number;
  tokenUsage?: TokenUsage;
}

export interface CandidateLogEntry {
  candidateId: string;
  name: string;
  agents: CandidateAgentLog[];
  updatedAt: number;
}

export interface DemoState {
  enabled: boolean;
  showUnderTheHood: boolean;
  showTokens: boolean;
  credentials: DemoCredentials;
  prompts: Record<string, PromptOverride>;
  completedAgents: string[];
  candidateLogs: Record<string, CandidateLogEntry>;
}

const STORAGE_KEY = 'hirelens_demo';

const DEFAULT_STATE: DemoState = {
  enabled: false,
  showUnderTheHood: true,
  showTokens: true,
  credentials: {
    openaiKey: '',
    supabaseUrl: '',
    supabaseAnonKey: '',
    supabaseServiceKey: '',
  },
  prompts: {},
  completedAgents: [],
  candidateLogs: {},
};

function loadState(): DemoState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed, credentials: { ...DEFAULT_STATE.credentials, ...parsed?.credentials }, prompts: parsed?.prompts ?? {}, completedAgents: parsed?.completedAgents ?? [], candidateLogs: parsed?.candidateLogs ?? {} };
  } catch {
    return DEFAULT_STATE;
  }
}

interface DemoContextValue {
  state: DemoState;
  loaded: boolean;
  setEnabled: (enabled: boolean) => void;
  setShowUnderTheHood: (show: boolean) => void;
  setShowTokens: (show: boolean) => void;
  setCredentials: (credentials: Partial<DemoCredentials>) => void;
  getPrompt: (agent: string) => PromptOverride | undefined;
  setPrompt: (agent: string, prompt: PromptOverride) => void;
  resetPrompt: (agent: string) => void;
  markAgentComplete: (agent: string) => void;
  resetCompletedAgents: () => void;
  logCandidateAgent: (candidateId: string, name: string, agent: string, status: 'running' | 'complete' | 'failed', tokenUsage?: TokenUsage) => void;
  setCandidateName: (candidateId: string, name: string) => void;
  removeCandidateLog: (candidateId: string) => void;
  clearCandidateLogs: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children, initialEnabled }: { children: ReactNode; initialEnabled?: boolean }) {
  const [state, setState] = useState<DemoState>({ ...DEFAULT_STATE, enabled: initialEnabled ?? DEFAULT_STATE.enabled });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setState(loadState());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, loaded]);

  const setEnabled = useCallback((enabled: boolean) => {
    setState((prev) => ({ ...prev, enabled }));
    document.cookie = `hirelens_demo=${enabled}; path=/; max-age=31536000`;
  }, []);

  const setShowUnderTheHood = useCallback((showUnderTheHood: boolean) => {
    setState((prev) => ({ ...prev, showUnderTheHood }));
    document.cookie = `hirelens_show_under_the_hood=${showUnderTheHood}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const setShowTokens = useCallback((showTokens: boolean) => {
    setState((prev) => ({ ...prev, showTokens }));
    document.cookie = `hirelens_show_tokens=${showTokens}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const setCredentials = useCallback((credentials: Partial<DemoCredentials>) => {
    setState((prev) => ({ ...prev, credentials: { ...prev.credentials, ...credentials } }));
  }, []);

  const getPrompt = useCallback(
    (agent: string) => state.prompts[agent],
    [state.prompts]
  );

  const setPrompt = useCallback((agent: string, prompt: PromptOverride) => {
    setState((prev) => ({
      ...prev,
      prompts: { ...prev.prompts, [agent]: prompt },
    }));
  }, []);

  const resetPrompt = useCallback((agent: string) => {
    setState((prev) => {
      const next = { ...prev.prompts };
      delete next[agent];
      return { ...prev, prompts: next };
    });
  }, []);

  const markAgentComplete = useCallback((agent: string) => {
    setState((prev) => {
      const LIFECYCLE = [
        'JD Agent', 'Resume Agent', 'Evidence Retrieval Agent',
        'Gap Analysis + Question Agent', 'Transcript Evaluation Agent',
        'Red Flag Agent', 'Human Review Agent',
      ];
      let completed = prev.completedAgents;
      if (!completed.includes(agent)) {
        completed = [...completed, agent];
      }
      // Dependency inference: if this agent completed, all prior lifecycle
      // agents must have run too. Force-mark them complete if not already.
      const idx = LIFECYCLE.indexOf(agent);
      if (idx > 0) {
        for (let i = 0; i < idx; i++) {
          if (!completed.includes(LIFECYCLE[i])) {
            completed = [...completed, LIFECYCLE[i]];
          }
        }
      }
      if (completed === prev.completedAgents) return prev;
      return { ...prev, completedAgents: completed };
    });
  }, []);

  const resetCompletedAgents = useCallback(() => {
    setState((prev) => ({ ...prev, completedAgents: [] }));
  }, []);

  const logCandidateAgent = useCallback(
    (candidateId: string, name: string, agent: string, status: 'running' | 'complete' | 'failed', tokenUsage?: TokenUsage) => {
      setState((prev) => {
        const existing = prev.candidateLogs[candidateId] ?? {
          candidateId,
          name: name || 'Unknown candidate',
          agents: [],
          updatedAt: Date.now(),
        };

        // Lifecycle order — each agent implicitly means all prior agents ran.
        const LIFECYCLE = [
          'JD Agent', 'Resume Agent', 'Evidence Retrieval Agent',
          'Gap Analysis + Question Agent', 'Transcript Evaluation Agent',
          'Red Flag Agent', 'Human Review Agent',
        ];

        // Replace any existing entry for the same agent, but accumulate token
        // usage across runs so re-parsing/re-analysing adds to the total.
        const priorAgentLog = existing.agents.find((a) => a.agent === agent);
        const agents = existing.agents.filter((a) => a.agent !== agent);
        const accumulatedUsage = priorAgentLog?.tokenUsage && tokenUsage
          ? {
              promptTokens: priorAgentLog.tokenUsage.promptTokens + tokenUsage.promptTokens,
              completionTokens: priorAgentLog.tokenUsage.completionTokens + tokenUsage.completionTokens,
              totalTokens: priorAgentLog.tokenUsage.totalTokens + tokenUsage.totalTokens,
            }
          : tokenUsage ?? priorAgentLog?.tokenUsage;
        agents.push({ agent, status, timestamp: Date.now(), tokenUsage: accumulatedUsage });

        // Dependency inference: if this agent completed, all prior lifecycle
        // agents must have run too. Force-mark them complete if not already.
        // E.g. Resume Agent completing implies JD Agent ran.
        if (status === 'complete') {
          const idx = LIFECYCLE.indexOf(agent);
          if (idx > 0) {
            const now = Date.now();
            for (let i = 0; i < idx; i++) {
              const prereq = LIFECYCLE[i];
              const has = agents.some((a) => a.agent === prereq);
              if (!has) {
                agents.push({ agent: prereq, status: 'complete', timestamp: now });
              }
            }
          }
        }

        const ordered = LIFECYCLE
          .map((a) => agents.find((x) => x.agent === a))
          .filter(Boolean) as CandidateAgentLog[];

        const entry: CandidateLogEntry = {
          candidateId,
          name: name || existing.name || 'Unknown candidate',
          agents: ordered,
          updatedAt: Date.now(),
        };
        return {
          ...prev,
          candidateLogs: { ...prev.candidateLogs, [candidateId]: entry },
        };
      });
    },
    []
  );

  const setCandidateName = useCallback((candidateId: string, name: string) => {
    setState((prev) => {
      const existing = prev.candidateLogs[candidateId];
      if (!existing) return prev;
      if (existing.name === name) return prev;
      return {
        ...prev,
        candidateLogs: {
          ...prev.candidateLogs,
          [candidateId]: { ...existing, name },
        },
      };
    });
  }, []);

  const removeCandidateLog = useCallback((candidateId: string) => {
    setState((prev) => {
      if (!prev.candidateLogs[candidateId]) return prev;
      const candidateLogs = { ...prev.candidateLogs };
      delete candidateLogs[candidateId];
      return { ...prev, candidateLogs };
    });
  }, []);

  const clearCandidateLogs = useCallback(() => {
    setState((prev) => ({ ...prev, candidateLogs: {} }));
  }, []);

  return (
    <DemoContext.Provider
      value={{ state, loaded, setEnabled, setShowUnderTheHood, setShowTokens, setCredentials, getPrompt, setPrompt, resetPrompt, markAgentComplete, resetCompletedAgents, logCandidateAgent, setCandidateName, removeCandidateLog, clearCandidateLogs }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemo must be used within a DemoProvider');
  return ctx;
}
