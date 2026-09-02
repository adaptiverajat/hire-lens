import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { AddCandidateForm } from '@/components/candidates/add-candidate-form';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';

type Props = { params: Promise<{ jobId: string }> };

export const metadata = { title: 'Add candidate - HireLens' };

export default async function NewCandidatePage({ params }: Props) {
  const { jobId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: job } = await createSupabaseAdminClient()
    .from('jobs')
    .select('id, title, parse_status')
    .eq('id', jobId)
    .eq('created_by', user!.id)
    .maybeSingle();

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
