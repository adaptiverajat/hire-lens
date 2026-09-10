import { describe, expect, it, vi } from 'vitest';
import { withReflexion } from './reflexion';

// Mock writeAgentMemory so we don't hit the database in tests.
vi.mock('@/lib/orchestration/memory', () => ({
  writeAgentMemory: vi.fn().mockResolvedValue(null),
}));

describe('withReflexion', () => {
  it('returns the output on the first attempt when validation passes', async () => {
    const run = vi.fn().mockResolvedValue('ok');
    const result = await withReflexion({
      maxAttempts: 3,
      run,
      validate: () => [],
      agentName: 'Red Flag Agent',
    });
    expect(result).toBe('ok');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('retries when validation fails and returns the first valid output', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce('bad')
      .mockResolvedValueOnce('good');
    const validate = (output: string) =>
      output === 'good'
        ? []
        : [{ code: 'bad_output', severity: 'error' as const, message: 'Output was bad' }];

    const result = await withReflexion({
      maxAttempts: 3,
      run,
      validate,
      agentName: 'Red Flag Agent',
    });
    expect(result).toBe('good');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting all attempts', async () => {
    const run = vi.fn().mockResolvedValue('bad');
    const validate = () => [
      { code: 'always_bad', severity: 'error' as const, message: 'Always fails' },
    ];

    await expect(
      withReflexion({ maxAttempts: 2, run, validate, agentName: 'Red Flag Agent' }),
    ).rejects.toThrow('Red Flag Agent failed validation after 2 attempts');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('passes accumulated feedback to the retry attempt', async () => {
    const run = vi
      .fn()
      .mockImplementation((_attempt: number, feedback: string[]) =>
        feedback.length === 0 ? 'bad' : 'good',
      );
    const validate = (output: string) =>
      output === 'good'
        ? []
        : [{ code: 'bad_output', severity: 'error' as const, message: 'Fix the output' }];

    const result = await withReflexion({
      maxAttempts: 3,
      run,
      validate,
      agentName: 'Red Flag Agent',
    });
    expect(result).toBe('good');
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(1, 1, []);
    expect(run).toHaveBeenNthCalledWith(2, 2, ['Fix the output']);
  });
});
