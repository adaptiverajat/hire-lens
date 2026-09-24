import { headers } from 'next/headers';
import { Cpu, DollarSign, Gauge, Layers } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ProfileForm } from '@/components/settings/profile-form';
import { DemoSettings } from '@/components/demo/demo-settings';
import { StatCard } from '@/components/shared/indicators';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { totalTokensFromUsage, type TokenUsage } from '@/lib/ai/token-usage';
import { getDemoEnabled } from '@/lib/demo/server-store';
import { serverEnv } from '@/lib/env';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { maskName } from '@/lib/utils/mask';

export const metadata = { title: 'Settings - HireLens' };

const OPENAI_PRICING_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
};

const FAST_AGENTS = new Set(['JD Agent', 'Resume Agent', 'Evidence Retrieval Agent', 'Red Flag Agent']);

function pricingForModel(model: string) {
  return Object.entries(OPENAI_PRICING_USD_PER_MILLION)
    .sort(([a], [b]) => b.length - a.length)
    .find(([name]) => model === name || model.startsWith(`${name}-`))?.[1];
}

function estimatedOpenAiCost(agent: string, usage: TokenUsage, chatModel: string, fastModel: string) {
  const pricing = pricingForModel(FAST_AGENTS.has(agent) ? fastModel : chatModel);
  if (!pricing) return null;
  return (usage.promptTokens * pricing.input + usage.completionTokens * pricing.output) / 1_000_000;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: value < 0.01 ? 4 : 2,
  }).format(value);
}

export default async function SettingsPage() {
  const h = await headers();
  const userId = h.get('x-user-id');
  const userEmail = h.get('x-user-email');

  let user: { id: string; email?: string } | null = userId ? { id: userId, email: userEmail ?? '' } : null;
  if (!user) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  const db = createSupabaseAdminClient();
  const { OPENAI_CHAT_MODEL, OPENAI_FAST_MODEL } = serverEnv();

  const [
    demo,
    { data: rawProfile },
    { count: vectorCount },
    { count: runCount },
    { data: tokenRuns },
    { data: rawCandidates },
  ] = await Promise.all([
    getDemoEnabled(),
    db.from('users').select('full_name, role, created_at').eq('id', user!.id).maybeSingle(),
    db.from('embeddings').select('id', { count: 'exact', head: true }),
    db.from('agent_runs').select('id', { count: 'exact', head: true }),
    db.from('agent_runs').select('started_at, candidate_id, output').order('started_at', { ascending: false }).limit(200),
    db.from('candidates').select('id, full_name'),
  ]);

  const profile = rawProfile as { full_name: string | null; role: string; created_at: string } | null;
  const candidates = (rawCandidates ?? []) as Array<{ id: string; full_name: string }>;

  type RunRow = {
    started_at: string;
    candidate_id: string | null;
    output?: { token_usage?: Record<string, TokenUsage> } | null;
  };
  const runRows = (tokenRuns ?? []) as unknown as RunRow[];
  const candidateNames = new Map((candidates ?? []).map((candidate) => [candidate.id, candidate.full_name]));
  const byAgent = new Map<string, TokenUsage & { cost: number | null }>();
  const byCandidate = new Map<string, { tokens: number; cost: number | null }>();
  let totalTokenUsage = 0;
  let totalCost: number | null = 0;

  for (const run of runRows) {
    const usage = run.output?.token_usage;
    if (!usage) continue;
    const runTokens = totalTokensFromUsage(usage);
    totalTokenUsage += runTokens;
    let runCost: number | null = 0;

    for (const [agent, agentUsage] of Object.entries(usage)) {
      const cost = estimatedOpenAiCost(agent, agentUsage, OPENAI_CHAT_MODEL, OPENAI_FAST_MODEL);
      const existing = byAgent.get(agent) ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 };
      byAgent.set(agent, {
        promptTokens: existing.promptTokens + agentUsage.promptTokens,
        completionTokens: existing.completionTokens + agentUsage.completionTokens,
        totalTokens: existing.totalTokens + agentUsage.totalTokens,
        cost: existing.cost === null || cost === null ? null : existing.cost + cost,
      });
      runCost = runCost === null || cost === null ? null : runCost + cost;
    }

    totalCost = totalCost === null || runCost === null ? null : totalCost + runCost;
    if (run.candidate_id && runTokens > 0) {
      const existing = byCandidate.get(run.candidate_id) ?? { tokens: 0, cost: 0 };
      byCandidate.set(run.candidate_id, {
        tokens: existing.tokens + runTokens,
        cost: existing.cost === null || runCost === null ? null : existing.cost + runCost,
      });
    }
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const tokenUsageThisMonth = runRows
    .filter((run) => new Date(run.started_at) >= monthStart)
    .reduce((sum, run) => sum + totalTokensFromUsage(run.output?.token_usage), 0);
  const candidateUsage = [...byCandidate.values()];
  const avgTokenPerCandidate = candidateUsage.length > 0
    ? Math.round(candidateUsage.reduce((sum, usage) => sum + usage.tokens, 0) / candidateUsage.length)
    : 0;
  const avgCostPerCandidate = candidateUsage.length > 0 && candidateUsage.every((usage) => usage.cost !== null)
    ? candidateUsage.reduce((sum, usage) => sum + (usage.cost ?? 0), 0) / candidateUsage.length
    : null;

  // Model names are server config, safe to surface read-only.
  const config = [
    ['Reasoning model', process.env.OPENAI_CHAT_MODEL ?? 'gpt-4.1'],
    ['Fast model', process.env.OPENAI_FAST_MODEL ?? 'gpt-4.1-mini'],
    ['Embedding model', process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small'],
    ['Vector dimensions', '1536'],
  ] as const;

  return (
    <>
      <PageHeader title="Settings" description="Your profile and the platform configuration." />

      <div id="settings-grid" className="grid gap-6 lg:grid-cols-2">
        <Card id="settings-profile-card">
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>{user!.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              initialFullName={profile?.full_name ?? ''}
              role={profile?.role ?? 'recruiter'}
            />
          </CardContent>
        </Card>

        <Card id="settings-usage-card">
          <CardHeader>
            <CardTitle className="text-base">Your usage</CardTitle>
            <CardDescription>
              Member since{' '}
              {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'unknown'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Vectors indexed</dt>
                <dd className="font-medium tabular-nums">{(vectorCount ?? 0).toLocaleString()}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Agent workflow runs</dt>
                <dd className="font-medium tabular-nums">{(runCount ?? 0).toLocaleString()}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card id="settings-token-usage-card" className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Tokens usage</CardTitle>
            <CardDescription>
              Centralised prompt, completion, total-token, and estimated OpenAI cost metrics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Total token usage"
                value={totalTokenUsage.toLocaleString()}
                hint={`${runRows.length.toLocaleString()} workflow runs`}
                icon={<Cpu className="size-5" aria-hidden />}
              />
              <StatCard
                label="Tokens this month"
                value={tokenUsageThisMonth.toLocaleString()}
                hint={now.toLocaleString('default', { month: 'long' })}
                icon={<Layers className="size-5" aria-hidden />}
              />
              <StatCard
                label="Avg. tokens / candidate"
                value={avgTokenPerCandidate.toLocaleString()}
                hint={`${byCandidate.size} candidates with usage`}
                icon={<Gauge className="size-5" aria-hidden />}
              />
              <StatCard
                label="Estimated model cost"
                value={totalCost !== null ? formatUsd(totalCost) : 'Unavailable'}
                hint={avgCostPerCandidate !== null
                  ? `${formatUsd(avgCostPerCandidate)} avg. / candidate`
                  : 'Current model pricing unavailable'}
                icon={<DollarSign className="size-5" aria-hidden />}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="overflow-hidden rounded-md border">
                <div className="border-b bg-muted/40 px-4 py-3">
                  <h3 className="text-sm font-medium">Usage by agent</h3>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background text-xs text-muted-foreground">
                      <tr className="border-b">
                        <th className="px-4 py-2 text-left font-medium">Agent</th>
                        <th className="px-3 py-2 text-right font-medium">Prompt</th>
                        <th className="px-3 py-2 text-right font-medium">Completion</th>
                        <th className="px-4 py-2 text-right font-medium">Total / cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...byAgent.entries()]
                        .sort((a, b) => b[1].totalTokens - a[1].totalTokens)
                        .map(([agent, usage]) => (
                          <tr key={agent} className="border-b last:border-0">
                            <td className="px-4 py-2 font-medium">{agent}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs">{usage.promptTokens.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs">{usage.completionTokens.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right">
                              <span className="block font-mono text-xs font-semibold">{usage.totalTokens.toLocaleString()}</span>
                              <span className="text-[10px] text-muted-foreground">{usage.cost !== null ? formatUsd(usage.cost) : 'cost unavailable'}</span>
                            </td>
                          </tr>
                        ))}
                      {byAgent.size === 0 && (
                        <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No token usage recorded yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="overflow-hidden rounded-md border">
                <div className="border-b bg-muted/40 px-4 py-3">
                  <h3 className="text-sm font-medium">Usage by candidate</h3>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background text-xs text-muted-foreground">
                      <tr className="border-b">
                        <th className="px-4 py-2 text-left font-medium">Candidate</th>
                        <th className="px-3 py-2 text-right font-medium">Tokens</th>
                        <th className="px-4 py-2 text-right font-medium">Estimated cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...byCandidate.entries()]
                        .sort((a, b) => b[1].tokens - a[1].tokens)
                        .map(([candidateId, usage]) => (
                          <tr key={candidateId} className="border-b last:border-0">
                            <td className="px-4 py-2 font-medium">{maskName(candidateNames.get(candidateId) ?? candidateId.slice(0, 8), demo)}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs">{usage.tokens.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs">{usage.cost !== null ? formatUsd(usage.cost) : 'Unavailable'}</td>
                          </tr>
                        ))}
                      {byCandidate.size === 0 && (
                        <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">No candidate token usage recorded yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Costs use standard configured-model rates and exclude embeddings. Actual billed costs may differ.
            </p>
          </CardContent>
        </Card>

        <Card id="settings-model-config-card" className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Model configuration</CardTitle>
            <CardDescription>
              Set via environment variables in <code>.env.local</code>. Restart the dev server after
              changing them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              {config.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-2 text-sm">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>
                    <Badge variant="outline" className="font-mono font-normal">
                      {value}
                    </Badge>
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <DemoSettings />

        <Card id="settings-agents-card" className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Agents</CardTitle>
            <CardDescription>
              Eight agents, orchestrated by LangGraph across four workflows.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 text-sm sm:grid-cols-2">
              {[
                ['JD Agent', 'Extracts weighted requirements from a job description.'],
                ['Resume Agent', 'Extracts and normalises a candidate profile.'],
                ['Gap Analysis Agent', 'Scores the match against a deterministic anchor.'],
                ['Question Agent', 'Drafts targeted interview questions with expected signals.'],
                ['Transcript Evaluation Agent', 'Grades answers using transcript quotes.'],
                ['Evidence Retrieval Agent', 'Pulls comparable historical cases from pgvector.'],
                ['Red Flag Agent', 'Surfaces evidenced inconsistencies. Never rejects.'],
                ['Human Review Agent', 'Assembles the decision packet for a person.'],
              ].map(([name, description]) => (
                <li key={name}>
                  <p className="font-medium">{name}</p>
                  <p className="text-muted-foreground">{description}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
