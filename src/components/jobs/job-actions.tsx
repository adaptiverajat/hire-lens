'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MoreHorizontal, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function JobActions({
  jobId,
  status,
  parseStatus,
}: {
  jobId: string;
  status: string;
  parseStatus: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          run(
            () => api.post(`/jobs/${jobId}/parse`),
            'Requirements re-extracted from the description'
          )
        }
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
        {parseStatus === 'complete' ? 'Re-parse JD' : 'Parse JD'}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="icon" aria-label="More job actions">
              <MoreHorizontal aria-hidden />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {(['open', 'on_hold', 'closed', 'draft'] as const)
            .filter((s) => s !== status)
            .map((s) => (
              <DropdownMenuItem
                key={s}
                onClick={() =>
                  run(
                    () => api.patch(`/jobs/${jobId}`, { status: s }),
                    `Job marked ${s.replace('_', ' ')}`
                  )
                }
              >
                Mark as {s.replace('_', ' ')}
              </DropdownMenuItem>
            ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              if (
                !window.confirm(
                  'Delete this job? Its candidates, interviews and evaluations will also be deleted. This cannot be undone.'
                )
              ) {
                return;
              }
              run(async () => {
                await api.delete(`/jobs/${jobId}`);
                router.push('/jobs');
              }, 'Job deleted');
            }}
          >
            Delete job
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
