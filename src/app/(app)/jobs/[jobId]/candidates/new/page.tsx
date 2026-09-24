import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { AddCandidateForm } from '@/components/candidates/add-candidate-form';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

type Props = { params: Promise<{ jobId: string }> };

export const metadata = { title: 'Add candidate - HireLens' };

export default async function NewCandidatePage({ params }: Props) {
  const { jobId } = await params;

  const { data: rawJob } = await createSupabaseAdminClient()
    .from('jobs')
    .select('id, title, parse_status')
    .eq('id', jobId)
    .maybeSingle();

  const job = rawJob as { id: string; title: string; parse_status: string | null } | null;
  if (!job) notFound();

  return (
    <>
      <PageHeader
        title="Add candidate"
        description={`Applying for ${job.title}. Upload a resume or paste the text; the Resume Agent extracts a structured profile.`}
      />
      <AddCandidateForm jobId={jobId} jobParsed={job.parse_status === 'complete'} />
    </>
  );
}
