'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ButtonLink } from '@/components/shared/button-link';

export interface AddCandidateJobOption {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
}

export function AddCandidateDialog({ jobs }: { jobs: AddCandidateJobOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const choose = (jobId: string) => {
    setOpen(false);
    router.push(`/jobs/${jobId}/candidates/new`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <UserPlus data-icon="inline-start" aria-hidden />
        Add candidate
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add candidate</DialogTitle>
          <DialogDescription>
            Choose the open position this candidate is applying for.
          </DialogDescription>
        </DialogHeader>
        {jobs.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No open positions. Create a job before adding candidates.
            </p>
            <ButtonLink href="/jobs/new" size="sm" onClick={() => setOpen(false)}>
              <Briefcase data-icon="inline-start" aria-hidden />
              Create job
            </ButtonLink>
          </div>
        ) : (
          <ScrollArea className="max-h-80">
            <ul className="divide-y overflow-hidden rounded-md border">
              {jobs.map((job) => (
                <li key={job.id}>
                  <button
                    type="button"
                    onClick={() => choose(job.id)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-blue-200 dark:hover:bg-blue-950/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{job.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[job.department, job.location].filter(Boolean).join(' · ') ||
                          'No details set'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
