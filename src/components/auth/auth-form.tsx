'use client';

import { useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ScanSearch } from 'lucide-react';
import Image from 'next/image';
import HireLens from '@/app/HireLens.jpg';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function AuthForm({
  mode,
  footer,
}: {
  mode: 'login' | 'signup';
  footer: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createSupabaseBrowserClient();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isSignup = mode === 'signup';

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);

    try {
      if (isSignup) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (signUpError) throw signUpError;

        // Supabase returns no session when email confirmation is enabled.
        if (!data.session) {
          setNotice('Check your inbox to confirm your email, then sign in.');
          setPending(false);
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }

      // Full navigation so middleware picks up the fresh session cookies.
      const next = searchParams.get('next') ?? '/dashboard';
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setPending(false);
    }
  }

  return (
    <div className="relative grid min-h-screen lg:grid-cols-[1fr_420px_420px]">
      <div className="pointer-events-none absolute inset-0 z-0">
        <Image
          src={HireLens}
          alt=""
          fill
          priority
          className="object-cover opacity-20"
          sizes="100vw"
        />
      </div>
      <div className="pointer-events-none absolute inset-0 z-0 bg-background/60" />

      <div className="relative z-10 flex items-center justify-center px-6 py-12 lg:justify-end lg:pr-2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2">
            <ScanSearch className="size-7 text-primary" aria-hidden />
            <span className="text-2xl font-semibold tracking-tight">HireLens</span>
          </div>

          <Card id={`auth-${mode}-card`}>
            <CardHeader>
              <CardTitle>{isSignup ? 'Create your account' : 'Sign in'}</CardTitle>
              <CardDescription>
                {isSignup
                  ? 'Start analysing candidates with evidence, not gut feel.'
                  : 'Welcome back to your recruitment workspace.'}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {notice && (
                  <Alert>
                    <AlertDescription>{notice}</AlertDescription>
                  </Alert>
                )}

                {isSignup && (
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Full name</Label>
                    <Input
                      id="full_name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      autoComplete="name"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                  />
                  {isSignup && (
                    <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" aria-hidden />}
                  {isSignup ? 'Create account' : 'Sign in'}
                </Button>

                <p className="text-center text-sm text-muted-foreground">{footer}</p>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-center px-6 py-12 lg:justify-start lg:pl-2">
      {/*  <div className="relative h-100 w-full max-w-sm overflow-hidden rounded-xl ring-1 ring-foreground/10">
           <Image
            src={HireLens}
            alt="HireLens"
            fill
            priority
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 420px"
          /> 
        </div>*/}
      </div>

      <aside className="relative z-10 hidden flex-col justify-center gap-6 bg-muted/40 px-10 lg:flex">
        <h2 className="text-lg font-semibold">What HireLens does</h2>
        <ul className="space-y-4 text-sm text-muted-foreground">
          {[
            ['Parses JDs and resumes', 'Structured skills, projects and requirements - not keyword soup.'],
            ['Finds matches and gaps', 'Weighted, reproducible match scores with cited evidence.'],
            ['Writes the interview', 'Question sets targeted at this candidate, with expected signals.'],
            ['Evaluates transcripts', 'Technical and communication assessment grounded in quotes.'],
            ['Flags inconsistencies', 'Advisory only. A human always makes the call.'],
            ['Learns from decisions', 'Every override becomes retrievable precedent.'],
          ].map(([title, body]) => (
            <li key={title}>
              <p className="font-medium text-foreground">{title}</p>
              <p>{body}</p>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
