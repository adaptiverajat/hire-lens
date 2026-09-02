'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Gauge, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';

export function CandidateActions({
  candidateId,
  candidateName,
  parseStatus,
  jobParsed,
  hasAnalysis,
}: {
  candidateId: string;
  candidateName: string;
  parseStatus: string;
  jobParsed: boolean;
  hasAnalysis: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'parse' | 'analyse' | 'delete' | null>(null);
  const [, startTransition] = useTransition();

  async function run(kind: 'parse' | 'analyse', path: string, success: string) {
    setBusy(kind);
    try {
      await api.post(path);
      toast.success(success);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Delete "${candidateName}"? All their data — resume, analysis, interviews, evaluations, and flags — will be permanently removed. This cannot be undone.`
      )
    ) {
      return;
    }
    setBusy('delete');
    try {
      await api.delete(`/candidates/${candidateId}`);
      toast.success('Candidate deleted');
      router.push('/candidates');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Delete failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        disabled={busy !== null}
        onClick={() =>
          run('parse', `/candidates/${candidateId}/parse`, 'Resume re-parsed')
        }
      >
        {busy === 'parse' ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
        {parseStatus === 'complete' ? 'Re-parse resume' : 'Parse resume'}
      </Button>

      <Button
        disabled={busy !== null || !jobParsed || parseStatus !== 'complete'}
        title={
          !jobParsed
            ? 'Parse the job description first'
            : parseStatus !== 'complete'
              ? 'Parse the resume first'
              : undefined
        }
        onClick={() =>
          run(
            'analyse',
            `/candidates/${candidateId}/analyze`,
            'Match analysis complete and question set generated'
          )
        }
      >
        {busy === 'analyse' ? <Loader2 className="animate-spin" aria-hidden /> : <Gauge aria-hidden />}
        {hasAnalysis ? 'Re-analyse' : 'Analyse candidate'}
      </Button>

      <Button
        variant="destructive"
        disabled={busy !== null}
        onClick={handleDelete}
      >
        {busy === 'delete' ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
        Delete
      </Button>
    </>
  );
}
