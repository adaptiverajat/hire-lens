import { normaliseWhitespace } from '@/lib/documents/extract';

export interface TranscriptTurn {
  speaker: string;
  text: string;
  timestamp?: string;
}

export interface ParsedTranscript {
  turns: TranscriptTurn[];
  participants: string[];
  wordCount: number;
  normalisedText: string;
}

// WEBVTT cue timing line: 00:00:12.480 --> 00:00:15.720
const VTT_TIMING = /^(\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->\s*(\d{2}:)?\d{2}:\d{2}[.,]\d{3}/;

// Teams inline speaker tag: <v Jane Doe>Hello there</v>
const VTT_VOICE = /<v\s+([^>]+)>([\s\S]*?)<\/v>/i;

// "Jane Doe: Hello there" or "[00:12] Jane Doe: Hello there"
const SPEAKER_PREFIX = /^\s*(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+)?([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3})\s*:\s*(.+)$/;

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, '').trim();
}

/**
 * Parses a Microsoft Teams transcript into speaker turns.
 * Handles the WEBVTT export, the "Name: text" plain-text copy/paste form, and
 * falls back to a single unattributed turn so evaluation never hard-fails.
 */
export function parseTranscript(raw: string): ParsedTranscript {
  const text = normaliseWhitespace(raw);
  const isVtt = /^\s*WEBVTT/i.test(raw);

  const turns = isVtt ? parseVtt(raw) : parsePlainText(text);

  const merged = mergeConsecutive(turns);
  const participants = [...new Set(merged.map((t) => t.speaker))].filter(
    (s) => s && s !== 'Unknown'
  );

  const normalisedText = merged.length
    ? merged.map((t) => `${t.speaker}: ${t.text}`).join('\n\n')
    : text;

  return {
    turns: merged,
    participants,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    normalisedText,
  };
}

function parseVtt(raw: string): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  let timestamp: string | undefined;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^WEBVTT/i.test(trimmed) || /^NOTE\b/i.test(trimmed)) continue;

    const timing = trimmed.match(VTT_TIMING);
    if (timing) {
      timestamp = timing[0].split('-->')[0].trim();
      continue;
    }

    // Bare cue identifiers (numbers or GUIDs) carry no content.
    if (/^[\w-]+$/.test(trimmed) && !/\s/.test(trimmed) && !VTT_VOICE.test(trimmed)) continue;

    const voice = trimmed.match(VTT_VOICE);
    if (voice) {
      const speaker = voice[1].trim();
      const content = stripTags(voice[2]);
      if (content) turns.push({ speaker, text: content, timestamp });
      continue;
    }

    const prefixed = trimmed.match(SPEAKER_PREFIX);
    if (prefixed) {
      turns.push({
        speaker: prefixed[2].trim(),
        text: prefixed[3].trim(),
        timestamp: prefixed[1] ?? timestamp,
      });
      continue;
    }

    const content = stripTags(trimmed);
    if (!content) continue;

    // Continuation of the previous cue.
    if (turns.length > 0) {
      turns[turns.length - 1].text += ` ${content}`;
    } else {
      turns.push({ speaker: 'Unknown', text: content, timestamp });
    }
  }

  return turns;
}

function parsePlainText(text: string): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(SPEAKER_PREFIX);
    if (match) {
      turns.push({
        speaker: match[2].trim(),
        text: match[3].trim(),
        timestamp: match[1],
      });
    } else if (turns.length > 0) {
      turns[turns.length - 1].text += ` ${trimmed}`;
    } else {
      turns.push({ speaker: 'Unknown', text: trimmed });
    }
  }

  return turns;
}

/** Teams emits one cue every few seconds; collapse them back into utterances. */
function mergeConsecutive(turns: TranscriptTurn[]): TranscriptTurn[] {
  return turns.reduce<TranscriptTurn[]>((acc, turn) => {
    const previous = acc[acc.length - 1];
    if (previous && previous.speaker === turn.speaker) {
      previous.text = `${previous.text} ${turn.text}`.trim();
      return acc;
    }
    acc.push({ ...turn });
    return acc;
  }, []);
}
