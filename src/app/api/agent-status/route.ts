import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/handler';

export const GET = withAuth(async (ctx, request: Request) => {
  const url = new URL(request.url);
  const candidateId = url.searchParams.get('candidateId');
  const jobId = url.searchParams.get('jobId');
  const staleBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: tasks, error } = await ctx.db
    .from('agent_tasks')
    .select('id, agent_name, task_type, started_at, run_id')
    .eq('status', 'running')
    .gte('started_at', staleBefore)
    .order('started_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const taskRunIds = (tasks ?? []).map((task) => task.run_id);
  if (taskRunIds.length > 0) {
    const { data: runs, error: runError } = await ctx.db
      .from('agent_runs')
      .select('id, candidate_id, job_id')
      .in('id', taskRunIds);

    if (runError) {
      return NextResponse.json({ error: runError.message }, { status: 500 });
    }

    const matchingTask = (tasks ?? []).find((task) => {
      const run = (runs ?? []).find((candidateRun) => candidateRun.id === task.run_id);
      return Boolean(run && (!candidateId || run.candidate_id === candidateId) && (!jobId || run.job_id === jobId));
    });

    if (matchingTask) {
      const run = (runs ?? []).find((candidateRun) => candidateRun.id === matchingTask.run_id);
      return NextResponse.json({
        ...matchingTask,
        candidate_id: run?.candidate_id ?? null,
        job_id: run?.job_id ?? null,
      });
    }
  }

  let runQuery = ctx.db
    .from('agent_runs')
    .select('id, workflow, current_node, candidate_id, job_id, started_at')
    .eq('status', 'running')
    .gte('started_at', staleBefore);

  if (candidateId) runQuery = runQuery.eq('candidate_id', candidateId);
  if (jobId) runQuery = runQuery.eq('job_id', jobId);

  const { data: runs, error: runError } = await runQuery
    .order('started_at', { ascending: false })
    .limit(1);

  if (runError) {
    return NextResponse.json({ error: runError.message }, { status: 500 });
  }

  const run = runs?.[0];
  if (!run) return NextResponse.json(null);

  const workflowAgent: Record<string, string> = {
    jd_intake: 'JD Agent',
    resume_intake: 'Resume Agent',
    candidate_analysis: 'Candidate Analysis',
    transcript_review: 'Transcript Review',
  };

  return NextResponse.json({
    id: run.id,
    agent_name: run.current_node || workflowAgent[run.workflow] || run.workflow,
    task_type: run.workflow,
    started_at: run.started_at,
    candidate_id: run.candidate_id,
    job_id: run.job_id,
  });
});