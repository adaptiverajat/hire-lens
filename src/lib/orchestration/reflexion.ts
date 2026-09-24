import type { ValidationIssue } from '@/lib/orchestration/validation';
import { writeAgentMemory, type AgentName } from '@/lib/orchestration/memory';

/**
 * Wraps an agent call with a reflexion retry loop.
 *
 * 1. Call the agent.
 * 2. Validate the output.
 * 3. If validation produces errors, feed them back into the agent's context
 *    and retry, up to `maxAttempts` times.
 * 4. Return the first valid output, or throw if all attempts fail.
 *
 * On exhaustion, writes a bias_warning to shared agent memory so the agent
 * can be warned on future runs. If `fallback` is provided, its sanitized
 * output is returned instead of throwing — useful when partially valid output
 * is acceptable (e.g. dropping ungrounded red flags keeps only verified ones).
 *
 * The `retry` callback receives the accumulated validation errors so the agent
 * can adjust its output. It should inject the feedback into the prompt.
 */
export async function withReflexion<T>(params: {
  maxAttempts: number;
  run: (attempt: number, feedback: string[]) => Promise<T>;
  validate: (output: T) => ValidationIssue[];
  agentName: AgentName;
  /** Called with the last output and errors when all attempts fail. If it
   *  returns a value, that value is used instead of throwing. */
  fallback?: (output: T, errors: string[]) => T;
  /** Optional context for the memory write-back on failure. */
  jobId?: string | null;
  candidateId?: string | null;
  runId?: string | null;
}): Promise<T> {
  const { maxAttempts, run, validate, agentName } = params;
  let lastErrors: string[] = [];
  let lastOutput: T | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const output = await run(attempt, lastErrors);
    const issues = validate(output);
    const errors = issues.filter((i) => i.severity === 'error');

    if (errors.length === 0) {
      if (attempt > 1) {
        console.log(
          `[reflexion] ${agentName} succeeded on attempt ${attempt}/${maxAttempts}`,
        );
      }
      return output;
    }

    lastOutput = output;
    lastErrors = errors.map((e) => e.message);
    console.warn(
      `[reflexion] ${agentName} attempt ${attempt}/${maxAttempts} failed validation: ${lastErrors.join('; ')}`,
    );
  }

  // Write a bias warning to shared agent memory so future runs can learn
  // from this systematic failure pattern.
  await writeAgentMemory({
    agentName,
    noteType: 'bias_warning',
    source: 'validation_failure',
    content: `Failed validation after ${maxAttempts} attempts. Recurring errors: ${lastErrors.join('; ')}`,
    confidence: 0.7,
    jobId: params.jobId ?? null,
    candidateId: params.candidateId ?? null,
    runId: params.runId ?? null,
    metadata: { errors: lastErrors, maxAttempts },
  });

  if (params.fallback && lastOutput !== undefined) {
    console.warn(`[reflexion] ${agentName} exhausted retries — using sanitized fallback output`);
    return params.fallback(lastOutput, lastErrors);
  }

  throw new Error(
    `${agentName} failed validation after ${maxAttempts} attempts: ${lastErrors.join('; ')}`,
  );
}
