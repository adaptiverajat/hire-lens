import { describe, expect, it } from 'vitest';
import { parseTranscript } from './transcript';

describe('parseTranscript metadata cleanup', () => {
  it('removes WEBVTT cue identifiers and timing lines from evaluation text', () => {
    const parsed = parseTranscript(`WEBVTT

cue_00001
00:00:01.200 --> 00:00:04.500
<v Alice Chen>I shipped 12 APIs in 2024.</v>

cue_00002
00:00:05.000 --> 00:00:08.000
<v Jordan Lee>Our p95 latency was 250 ms.</v>`);

    expect(parsed.normalisedText).toBe(
      'Alice Chen: I shipped 12 APIs in 2024.\n\nJordan Lee: Our p95 latency was 250 ms.'
    );
    expect(parsed.normalisedText).not.toMatch(/00:00|cue_0000/);
    expect(parsed.wordCount).toBe(parsed.normalisedText.split(/\s+/).length);
  });

  it('strips line-leading timestamps and opaque IDs but preserves spoken numbers', () => {
    const parsed = parseTranscript(
      '[00:01:02.500] Alice Chen: I led 3 teams and delivered 40% growth in 2025.\n' +
        '00:01:08.000\n' +
        '550e8400-e29b-41d4-a716-446655440000\n' +
        'Jordan Lee: The build is version 2.4.1.'
    );

    expect(parsed.normalisedText).toBe(
      'Alice Chen: I led 3 teams and delivered 40% growth in 2025.\n\nJordan Lee: The build is version 2.4.1.'
    );
    expect(parsed.turns[0].timestamp).toBe('00:01:02.500');
  });

  it('does not remove timestamp-looking values inside spoken sentences', () => {
    const parsed = parseTranscript('Alice Chen: We met at 10:30 and the score was 4:2.');

    expect(parsed.normalisedText).toBe('Alice Chen: We met at 10:30 and the score was 4:2.');
  });

  it('drops standalone cue timing ranges in non-VTT transcript text', () => {
    const parsed = parseTranscript(
      '00:00:01.200 --> 00:00:04.500\nAlice Chen: I shipped the feature.'
    );

    expect(parsed.normalisedText).toBe('Alice Chen: I shipped the feature.');
  });
});
