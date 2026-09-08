import { AsyncLocalStorage } from 'node:async_hooks';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AgentTokenUsage {
  agent: string;
  usage: TokenUsage;
}

class TokenUsageContext {
  private entries: Map<string, TokenUsage> = new Map();

  record(agent: string, usage: TokenUsage): void {
    const existing = this.entries.get(agent);
    if (existing) {
      existing.promptTokens += usage.promptTokens;
      existing.completionTokens += usage.completionTokens;
      existing.totalTokens += usage.totalTokens;
    } else {
      this.entries.set(agent, { ...usage });
    }
  }

  getAll(): AgentTokenUsage[] {
    return Array.from(this.entries.entries()).map(([agent, usage]) => ({ agent, usage }));
  }

  toRecord(): Record<string, TokenUsage> {
    const record: Record<string, TokenUsage> = {};
    for (const [agent, usage] of this.entries.entries()) {
      record[agent] = { ...usage };
    }
    return record;
  }
}

const storage = new AsyncLocalStorage<TokenUsageContext>();

/**
 * Runs a function with a fresh token-usage context. After the function
 * completes, returns the accumulated per-agent usage.
 */
export async function withTokenUsage<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; usage: Record<string, TokenUsage> }> {
  const ctx = new TokenUsageContext();
  const result = await storage.run(ctx, fn);
  return { result, usage: ctx.toRecord() };
}

/**
 * Records token usage for an agent in the current async context.
 * Safe to call outside a context — does nothing if no context is active.
 */
export function recordTokenUsage(agent: string, usage: TokenUsage): void {
  const ctx = storage.getStore();
  if (ctx) {
    ctx.record(agent, usage);
  }
}

/**
 * Sums the total tokens across all agents in a usage record.
 */
export function totalTokensFromUsage(usage: Record<string, TokenUsage> | null | undefined): number {
  if (!usage) return 0;
  return Object.values(usage).reduce((sum, u) => sum + u.totalTokens, 0);
}
