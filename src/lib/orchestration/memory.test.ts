import { describe, expect, it, vi } from 'vitest';

// Mock the supabase server module so we don't need env vars in tests.
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { formatAgentMemory, type AgentMemoryNote } from './memory';

describe('formatAgentMemory', () => {
  it('returns empty string for no notes', () => {
    expect(formatAgentMemory([])).toBe('');
  });

  it('formats notes with type, confidence, and age', () => {
    const notes: AgentMemoryNote[] = [
      {
        id: '1',
        agent_name: 'Red Flag Agent',
        note_type: 'calibration',
        content: 'Over-flagged seniority for undersold candidates.',
        confidence: 0.9,
        source: 'reviewer_override',
        job_id: null,
        candidate_id: null,
        run_id: null,
        metadata: {},
        created_at: new Date(Date.now() - 5 * 86400000).toISOString(), // 5 days ago
      },
      {
        id: '2',
        agent_name: 'Red Flag Agent',
        note_type: 'bias_warning',
        content: 'Tends to miss timeline inconsistencies.',
        confidence: 0.7,
        source: 'validation_failure',
        job_id: null,
        candidate_id: null,
        run_id: null,
        metadata: {},
        created_at: new Date(Date.now() - 30 * 86400000).toISOString(), // ~30 days ago
      },
    ];

    const result = formatAgentMemory(notes);
    expect(result).toContain('Note 1 (calibration, 90% confidence, 5 days ago)');
    expect(result).toContain('Over-flagged seniority for undersold candidates.');
    expect(result).toContain('Note 2 (bias_warning, 70% confidence');
    expect(result).toContain('Tends to miss timeline inconsistencies.');
  });

  it('handles today as age label', () => {
    const notes: AgentMemoryNote[] = [
      {
        id: '1',
        agent_name: 'Gap Analysis Agent',
        note_type: 'insight',
        content: 'Transferable skills undercounted.',
        confidence: 1,
        source: 'agent_insight',
        job_id: null,
        candidate_id: null,
        run_id: null,
        metadata: {},
        created_at: new Date().toISOString(),
      },
    ];

    const result = formatAgentMemory(notes);
    expect(result).toContain('today');
  });
});
