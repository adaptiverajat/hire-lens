import type { z } from 'zod';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { chatModel } from '@/lib/ai/models';
import { getDemoContext } from '@/lib/demo/server-store';

/**
 * Runs a prompt and validates the model's reply against a Zod schema using
 * OpenAI structured outputs. Returns typed data or throws - agents never have
 * to hand-parse JSON or guard against missing keys.
 */
export async function generateStructured<T extends z.ZodType>({
  schema,
  schemaName,
  system,
  user,
  input,
  tier = 'reasoning',
  temperature = 0.2,
  runName,
}: {
  schema: T;
  schemaName: string;
  system: string;
  user: string;
  input: Record<string, unknown>;
  tier?: 'reasoning' | 'fast';
  temperature?: number;
  runName?: string;
}): Promise<z.infer<T>> {
  const demo = getDemoContext();
  const activeRun = runName ?? schemaName;
  const resolvedSystem =
    demo?.enabled && demo.prompts[activeRun]?.system ? demo.prompts[activeRun].system : system;
  const resolvedUser =
    demo?.enabled && demo.prompts[activeRun]?.user ? demo.prompts[activeRun].user : user;

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', resolvedSystem],
    ['human', resolvedUser],
  ]);

  const model = chatModel(tier, temperature).withStructuredOutput(schema, {
    name: schemaName,
    strict: true,
  });

  const chain = prompt.pipe(model);

  return (await chain.invoke(input, {
    runName: activeRun,
  })) as z.infer<T>;
}
