import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv } from '@/lib/env';

/**
 * Request-scoped client bound to the user's auth cookies. Use this in server
 * components, server actions and route handlers to read the session.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a server component render, where cookies are
            // read-only. `middleware.ts` refreshes the session instead.
          }
        },
      },
    }
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedAdminClient: SupabaseClient<any, 'public', any> | null = null;

/**
 * Service-role client. Bypasses RLS, so every query made with it MUST be
 * explicitly scoped to the authenticated user (see `withAuth` in lib/api).
 * Caches a singleton to reuse HTTP connections across queries.
 */
export function createSupabaseAdminClient() {
  if (!cachedAdminClient) {
    cachedAdminClient = createClient(
      publicEnv.NEXT_PUBLIC_SUPABASE_URL,
      serverEnv().SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
  }
  return cachedAdminClient;
}
