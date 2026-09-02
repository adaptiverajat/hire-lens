import { SupabaseClient } from '@supabase/supabase-js';
import { PROMPTS, type AgentPrompt } from './prompts';

/**
 * Loads the merged prompt catalog:
 * hard-coded defaults from src/lib/demo/prompts.ts with DB overrides on top.
 */
export async function getMergedPrompts(
  db: SupabaseClient
): Promise<Record<string, AgentPrompt>> {
  const { data, error } = await db.from('prompts').select('agent, system_prompt, user_prompt');
  if (error) {
    throw new Error(`Failed to load prompts: ${error.message}`);
  }

  const merged = { ...PROMPTS };
  for (const row of data ?? []) {
    merged[row.agent] = { system: row.system_prompt, user: row.user_prompt };
  }
  return merged;
}

export async function getPrompt(
  db: SupabaseClient,
  agent: string
): Promise<AgentPrompt | undefined> {
  const merged = await getMergedPrompts(db);
  return merged[agent];
}

export async function setPrompt(
  db: SupabaseClient,
  agent: string,
  prompt: AgentPrompt,
  userId?: string
): Promise<void> {
  const { error } = await db.from('prompts').upsert(
    {
      agent,
      system_prompt: prompt.system,
      user_prompt: prompt.user,
      created_by: userId,
    },
    { onConflict: 'agent' }
  );
  if (error) {
    throw new Error(`Failed to save prompt: ${error.message}`);
  }
}

export async function resetPrompt(db: SupabaseClient, agent: string): Promise<void> {
  const { error } = await db.from('prompts').delete().eq('agent', agent);
  if (error) {
    throw new Error(`Failed to reset prompt: ${error.message}`);
  }
}
