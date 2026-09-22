import { cookies } from 'next/headers';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface DemoPromptOverride {
  system: string;
  user: string;
}

export interface DemoServerContext {
  enabled: boolean;
  openaiKey: string | undefined;
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  supabaseServiceKey: string | undefined;
  prompts: Record<string, DemoPromptOverride>;
}

const demoStore = new AsyncLocalStorage<DemoServerContext>();

export function runWithDemo<T>(context: DemoServerContext, fn: () => Promise<T>): Promise<T> {
  return demoStore.run(context, fn);
}

export function getDemoContext(): DemoServerContext | undefined {
  return demoStore.getStore();
}

export async function getDemoEnabled(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get('hirelens_demo')?.value === 'true';
}

export function parseDemoHeaders(headers: Headers): DemoServerContext {
  const enabled = headers.get('x-demo-enabled') === 'true';

  let prompts: Record<string, DemoPromptOverride> = {};
  const rawPrompts = headers.get('x-demo-prompts');
  if (rawPrompts) {
    try {
      prompts = JSON.parse(rawPrompts) as Record<string, DemoPromptOverride>;
    } catch {
      prompts = {};
    }
  }

  return {
    enabled,
    openaiKey: headers.get('x-demo-openai-key') || undefined,
    supabaseUrl: headers.get('x-demo-supabase-url') || undefined,
    supabaseAnonKey: headers.get('x-demo-supabase-anon-key') || undefined,
    supabaseServiceKey: headers.get('x-demo-supabase-service-key') || undefined,
    prompts,
  };
}
