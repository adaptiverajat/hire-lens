import type { z } from 'zod';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { chatModel } from '@/lib/ai/models';
import { getDemoContext } from '@/lib/demo/server-store';
import { recordTokenUsage, type TokenUsage } from '@/lib/ai/token-usage';
import { redactPii, sanitizeLlmInput, type PiiContext } from '@/lib/ai/pii';

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
  maxTokens,
  runName,
  pii,
}: {
  schema: T;
  schemaName: string;
  system: string;
  user: string;
  input: Record<string, unknown>;
  tier?: 'reasoning' | 'fast';
  temperature?: number;
  maxTokens?: number;
  runName?: string;
  pii?: PiiContext;
}): Promise<z.infer<T>> {
  const demo = getDemoContext();
  const activeRun = runName ?? schemaName;
  const resolvedSystem =
    demo?.enabled && demo.prompts[activeRun]?.system ? demo.prompts[activeRun].system : system;
  const resolvedUser =
    demo?.enabled && demo.prompts[activeRun]?.user ? demo.prompts[activeRun].user : user;
  const safeInput = sanitizeLlmInput(input, pii);

  // A demo prompt override can drop the {currentDate} placeholder, which makes
  // the model fall back to its training cutoff for date reasoning. Anchor every
  // system prompt to today when the placeholder is absent.
  const anchoredSystem = resolvedSystem.includes('{currentDate}')
    ? resolvedSystem
    : `${resolvedSystem}\n\nToday's date is ${new Date().toISOString().split('T')[0]}. Use this as the reference for any timeline or date-based analysis.`;

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', redactPii(anchoredSystem, pii)],
    ['human', redactPii(resolvedUser, pii)],
  ]);

  // Use includeRaw: true so we get the raw AIMessage alongside the parsed
  // structured output. The AIMessage carries usage_metadata with token counts.
  const model = chatModel(tier, temperature, maxTokens).withStructuredOutput(schema, {
    name: schemaName,
    strict: true,
    includeRaw: true,
  });

  const chain = prompt.pipe(model);

  const response = (await chain.invoke(safeInput, {
    runName: activeRun,
  })) as unknown as { raw: { usage_metadata?: { input_tokens: number; output_tokens: number; total_tokens: number } }; parsed: z.infer<T> };

  // Extract token usage from the raw AIMessage's usage_metadata.
  const usage = response.raw?.usage_metadata;
  if (usage) {
    const tokenUsage: TokenUsage = {
      promptTokens: usage.input_tokens ?? 0,
      completionTokens: usage.output_tokens ?? 0,
      totalTokens: usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
    };
    recordTokenUsage(activeRun, tokenUsage);
    console.log(`[token-usage] ${activeRun}: ${tokenUsage.promptTokens} prompt + ${tokenUsage.completionTokens} completion = ${tokenUsage.totalTokens} total`);
  } else {
    console.log(`[token-usage] ${activeRun}: no usage_metadata on raw message`);
  }

  return response.parsed;
}
