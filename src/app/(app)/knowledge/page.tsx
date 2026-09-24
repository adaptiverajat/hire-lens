import { PageHeader } from '@/components/shared/page-header';
import { KnowledgeExplorer } from '@/components/knowledge/knowledge-explorer';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import type { KnowledgeEntryRow } from '@/types/domain';

export const metadata = { title: 'Knowledge base - HireLens' };

export default async function KnowledgePage() {
  const db = createSupabaseAdminClient();

  const [{ data: entries }, { data: jobs }, { count: vectorCount }] = await Promise.all([
    db
      .from('knowledge_entries')
      .select('id, kind, title, content, outcome, created_at, jobs(title), candidates(full_name)')
      .order('created_at', { ascending: false })
      .limit(100),
    db.from('jobs').select('id, title').order('created_at', { ascending: false }),
    db
      .from('embeddings')
      .select('id', { count: 'exact', head: true }),
  ]);

  return (
    <>
      <PageHeader
        title="Knowledge base"
        description="Organisational memory. Every decision, assessment and note is embedded and retrieved as precedent before future recommendations."
      />
      <KnowledgeExplorer
        entries={(entries ?? []) as unknown as KnowledgeEntryRow[]}
        jobs={(jobs ?? []) as Array<{ id: string; title: string }>}
        vectorCount={vectorCount ?? 0}
      />
    </>
  );
}
