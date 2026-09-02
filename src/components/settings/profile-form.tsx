'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ProfileForm({
  initialFullName,
  role,
}: {
  initialFullName: string;
  role: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [fullName, setFullName] = useState(initialFullName);
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Not signed in');

      // RLS restricts this to the caller's own row.
      const { error } = await supabase
        .from('users')
        .update({ full_name: fullName.trim() || null })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Profile updated');
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="full_name">Full name</Label>
        <Input
          id="full_name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <Label>Role</Label>
        <div>
          <Badge variant="secondary">{role.replace('_', ' ')}</Badge>
        </div>
      </div>

      <Button type="submit" disabled={saving || fullName === initialFullName}>
        {saving && <Loader2 className="animate-spin" aria-hidden />}
        Save changes
      </Button>
    </form>
  );
}
