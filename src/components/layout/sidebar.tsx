'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookOpen,
  Briefcase,
  Info,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MessageSquareText,
  ScanSearch,
  Settings,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/candidates', label: 'Candidates', icon: Users },
  { href: '/questions', label: 'Question Library', icon: ListChecks },
  { href: '/transcripts', label: 'Transcripts', icon: MessageSquareText },
  { href: '/review', label: 'Review Queue', icon: ShieldAlert },
  { href: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/about', label: 'About', icon: Info },
] as const;

export function Sidebar({
  user,
  openFlagCount,
}: {
  user: { email: string; fullName: string | null };
  openFlagCount: number;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r bg-muted/30">
      <div className="flex items-center gap-2 px-5 py-5">
        <ScanSearch className="size-6 text-primary" aria-hidden />
        <span className="text-lg font-semibold tracking-tight">HireLens</span>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3" aria-label="Main">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-background font-medium text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
            >
              <Icon className="size-4" aria-hidden />
              <span className="flex-1">{label}</span>
              {href === '/review' && openFlagCount > 0 && (
                <span className="rounded-full bg-destructive px-1.5 py-0.5 text-xs font-medium text-white">
                  {openFlagCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <div className="px-2 pb-2">
          <p className="truncate text-sm font-medium">{user.fullName ?? user.email}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
          <LogOut className="size-4" aria-hidden />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
