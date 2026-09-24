'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
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

export function EditCandidateDialog({
  candidateId,
  fullName,
  headline,
  email,
  phone,
  location,
}: {
  candidateId: string;
  fullName: string;
  headline?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);

  const [editFullName, setEditFullName] = useState(fullName);
  const [editHeadline, setEditHeadline] = useState(headline ?? '');
  const [editEmail, setEditEmail] = useState(email ?? '');
  const [editPhone, setEditPhone] = useState(phone ?? '');
  const [editLocation, setEditLocation] = useState(location ?? '');

  // Reset local form fields whenever dialog opens with updated values
  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setEditFullName(fullName);
      setEditHeadline(headline ?? '');
      setEditEmail(email ?? '');
      setEditPhone(phone ?? '');
      setEditLocation(location ?? '');
    }
    setOpen(nextOpen);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editFullName.trim()) {
      toast.error('Candidate name is required');
      return;
    }

    setPending(true);
    try {
      const body: Record<string, unknown> = {
        full_name: editFullName.trim(),
        headline: editHeadline.trim() || null,
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
        location: editLocation.trim() || null,
      };

      await api.patch(`/candidates/${candidateId}`, body);
      toast.success('Candidate details updated');
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not update candidate');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" aria-label="Edit candidate details">
            <Pencil aria-hidden />
            Edit
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit candidate details</DialogTitle>
          <DialogDescription>
            Update candidate name and contact information.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-candidate-name">Candidate name</Label>
            <Input
              id="edit-candidate-name"
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
              placeholder="e.g. Alex Morgan"
              required
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-candidate-headline">Headline</Label>
            <Input
              id="edit-candidate-headline"
              value={editHeadline}
              onChange={(e) => setEditHeadline(e.target.value)}
              placeholder="e.g. Senior Full-Stack Engineer"
              maxLength={300}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-candidate-email">Email</Label>
              <Input
                id="edit-candidate-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="alex@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-candidate-phone">Phone</Label>
              <Input
                id="edit-candidate-phone"
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+1 555-0123"
                maxLength={50}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-candidate-location">Location</Label>
            <Input
              id="edit-candidate-location"
              value={editLocation}
              onChange={(e) => setEditLocation(e.target.value)}
              placeholder="e.g. New York, NY / Remote"
              maxLength={120}
            />
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
