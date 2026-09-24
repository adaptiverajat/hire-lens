import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { DemoProvider } from '@/lib/demo/store';
import { getDemoEnabled } from '@/lib/demo/server-store';
import { UnderTheHood } from '@/components/demo/under-the-hood';
import { RunningAgentSummary } from '@/components/demo/running-agent-summary';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const headerUserId = h.get('x-user-id');
  const headerUserEmail = h.get('x-user-email');

  let user: { id: string; email?: string } | null = null;
  if (headerUserId) {
    user = { id: headerUserId, email: headerUserEmail ?? '' };
  } else {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  // Middleware already gates this, but a server component must never assume.
  if (!user) redirect('/login');

  const db = createSupabaseAdminClient();

  const [{ data: rawProfile }, { count: openFlagCount }, demoEnabled] = await Promise.all([
    db.from('users').select('full_name').eq('id', user.id).maybeSingle(),
    db.from('flags').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    getDemoEnabled(),
  ]);

  const profile = rawProfile as { full_name: string | null } | null;

  return (
    <DemoProvider initialEnabled={demoEnabled}>
      <div className="flex min-h-screen">
        <Sidebar
          user={{ email: user.email ?? '', fullName: profile?.full_name ?? null }}
          openFlagCount={openFlagCount ?? 0}
        />
        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto max-w-6xl px-8 py-8">
            <RunningAgentSummary />
            {children}
            <UnderTheHood />
          </div>
        </main>
      </div>
    </DemoProvider>
  );
}
