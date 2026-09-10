import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { DemoProvider } from '@/lib/demo/store';
import { getDemoEnabled } from '@/lib/demo/server-store';
import { UnderTheHood } from '@/components/demo/under-the-hood';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already gates this, but a server component must never assume.
  if (!user) redirect('/login');

  const db = createSupabaseAdminClient();

  const [{ data: profile }, { data: jobs }] = await Promise.all([
    db.from('users').select('full_name').eq('id', user.id).maybeSingle(),
    db.from('jobs').select('id'),
  ]);

  let openFlagCount = 0;
  const jobIds = (jobs ?? []).map((j) => j.id);
  if (jobIds.length > 0) {
    const { count } = await db
      .from('flags')
      .select('id', { count: 'exact', head: true })
      .in('job_id', jobIds)
      .eq('status', 'open');
    openFlagCount = count ?? 0;
  }

  const demoEnabled = await getDemoEnabled();

  return (
    <DemoProvider initialEnabled={demoEnabled}>
      <div className="flex min-h-screen">
        <Sidebar
          user={{ email: user.email ?? '', fullName: profile?.full_name ?? null }}
          openFlagCount={openFlagCount}
        />
        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto max-w-6xl px-8 py-8">
            {children}
            <UnderTheHood />
          </div>
        </main>
      </div>
    </DemoProvider>
  );
}
