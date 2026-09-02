import { PageHeader } from '@/components/shared/page-header';
import { ProfileForm } from '@/components/settings/profile-form';
import { DemoSettings } from '@/components/demo/demo-settings';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Settings - HireLens' };

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const db = createSupabaseAdminClient();

  const [{ data: profile }, { count: vectorCount }, { count: runCount }] = await Promise.all([
    db.from('users').select('full_name, role, created_at').eq('id', user!.id).maybeSingle(),
    db.from('embeddings').select('id', { count: 'exact', head: true }).eq('owner_user_id', user!.id),
    db.from('agent_runs').select('id', { count: 'exact', head: true }).eq('created_by', user!.id),
  ]);

  // Model names are server config, safe to surface read-only.
  const config = [
    ['Reasoning model', process.env.OPENAI_CHAT_MODEL ?? 'gpt-4.1'],
    ['Fast model', process.env.OPENAI_FAST_MODEL ?? 'gpt-4.1-mini'],
    ['Embedding model', process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small'],
    ['Vector dimensions', '1536'],
    ['LangSmith tracing', process.env.LANGSMITH_TRACING === 'true' ? 'Enabled' : 'Disabled'],
    ['LangSmith project', process.env.LANGSMITH_PROJECT ?? 'hirelens'],
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
