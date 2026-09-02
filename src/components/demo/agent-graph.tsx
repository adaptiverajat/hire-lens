'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Check, Circle, ChevronRight, Loader2, X } from 'lucide-react';

export type AgentStatus = 'running' | 'complete' | 'failed';

export function WorkflowPath({
  stages,
  agentStatus,
  title,
  onSelect,
}: {
  stages: string[];
  agentStatus: Record<string, AgentStatus>;
  title?: string;
  onSelect: (key: string) => void;
}) {
  if (stages.length === 0) {
    return (
      <div id="workflow-path-empty" className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        No AI agents are active on this view. Open a job, candidate, question, transcript,
        review, or knowledge page to see the lifecycle.
      </div>
    );
  }

  return (
    <div id="workflow-path" className="overflow-x-auto rounded-lg border border-dashed border-border bg-muted/30 p-4">
      {title && (
        <p id="workflow-path-title" className="mb-3 text-sm font-semibold text-foreground">
          {title}
        </p>
      )}
      <div className="flex min-w-max items-center gap-2">
        {stages.map((stage, index) => {
          const status = agentStatus[stage];
          const isRunning = status === 'running';
          const isCompleted = status === 'complete';
          const isFailed = status === 'failed';

          return (
            <div key={stage} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelect(stage)}
                className={cn(
                  'group flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-all',
                  isRunning && !isCompleted && 'border-primary bg-primary/10 text-primary shadow-sm',
                  isCompleted && 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                  isFailed && 'border-rose-300 bg-rose-50 text-rose-900',
                  !isRunning && !isCompleted && !isFailed && 'border-border bg-background text-muted-foreground hover:bg-muted'
                )}
              >
                <span className="flex h-5 w-5 items-center justify-center">
                  {isRunning && !isCompleted ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isCompleted ? (
                    <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : isFailed ? (
                    <X className="h-4 w-4 text-rose-500" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </span>
                <span className="whitespace-nowrap">{stage}</span>
                {isRunning && !isCompleted && (
                  <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                )}
              </button>
              {index < stages.length - 1 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Click any stage to edit the prompt used by that agent.
      </p>
    </div>
  );
}
