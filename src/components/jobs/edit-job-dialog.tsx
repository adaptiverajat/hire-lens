'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function EditJobDialog({
  jobId,
  title,
  department,
  location,
  deadlineDate,
  priority,
  descriptionRaw,
}: {
  jobId: string;
  title: string;
  department: string | null;
  location: string | null;
  deadlineDate: string | null;
  priority: 'normal' | 'urgent';
  descriptionRaw: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);

  const [editTitle, setEditTitle] = useState(title);
  const [editDepartment, setEditDepartment] = useState(department ?? '');
  const [editLocation, setEditLocation] = useState(location ?? '');
  const [editDeadline, setEditDeadline] = useState(
    deadlineDate ? deadlineDate.split('T')[0] : ''
  );
  const [editUrgent, setEditUrgent] = useState(priority === 'urgent');
  const [editDescription, setEditDescription] = useState(descriptionRaw ?? '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const body: Record<string, unknown> = {
        title: editTitle.trim(),
        department: editDepartment.trim() || null,
        location: editLocation.trim() || null,
        deadline_date: editDeadline ? new Date(editDeadline).toISOString() : null,
        priority: editUrgent ? 'urgent' : 'normal',
      };

      // Only send description_raw if it changed — updating it resets
      // parse_status to 'pending' and clears the structured extraction.
      if (editDescription.trim() !== (descriptionRaw ?? '').trim()) {
        body.description_raw = editDescription.trim();
      }

      await api.patch(`/jobs/${jobId}`, body);
      toast.success(
        body.description_raw
          ? 'Job updated. Re-parse to extract new requirements.'
          : 'Job updated'
      );
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not update the job');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" aria-label="Edit job">
            <Pencil aria-hidden />
            Edit
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit job</DialogTitle>
          <DialogDescription>
            Update the role details. Editing the description resets parsing — run Re-parse after saving.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Job title</Label>
            <Input
              id="edit-title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Job description</Label>
            <Textarea
              id="edit-description"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={8}
              placeholder="Paste the full job description..."
              className="max-h-64 overflow-y-auto text-sm"
            />
            {editDescription.trim() !== (descriptionRaw ?? '').trim() && (
              <p className="text-xs text-amber-600">
                Saving will reset the parsed requirements. Use Re-parse after saving.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-department">Department</Label>
              <Input
                id="edit-department"
                value={editDepartment}
                onChange={(e) => setEditDepartment(e.target.value)}
                placeholder="Engineering"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-location">Location</Label>
              <Input
                id="edit-location"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder="Remote / Bengaluru"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-deadline">Application deadline</Label>
            <Input
              id="edit-deadline"
              type="date"
              value={editDeadline}
              onChange={(e) => setEditDeadline(e.target.value)}
            />
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="edit-urgent"
              checked={editUrgent}
              onCheckedChange={(checked) => setEditUrgent(checked === true)}
            />
            <div>
              <Label htmlFor="edit-urgent" className="font-medium leading-none">
                Mark as urgent
              </Label>
              <p className="text-xs text-muted-foreground">
                Urgent jobs are highlighted on the dashboard and prioritised in the pipeline.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
