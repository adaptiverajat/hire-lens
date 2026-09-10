import { z } from 'zod';
import type {
  RedFlagAnalysis,
  ReviewSynthesis,
  TranscriptEvaluation,
} from '@/lib/agents/schemas';
import type { EvidenceItem } from '@/lib/agents/evidence-agent';

export const artifactStatusSchema = z.enum(['produced', 'validated', 'rejected']);
export type ArtifactStatus = z.infer<typeof artifactStatusSchema>;

export interface EvidenceClaim {
  sourceType: 'job' | 'resume' | 'transcript' | 'knowledge' | 'agent';
  sourceId: string;
  quote?: string;
  claim: string;
  confidence: number;
}

export interface AgentArtifact<T> {
  artifactId?: string;
  runId: string;
  taskId?: string;
  artifactType: string;
  schemaVersion: string;
  producer: string;
  consumer?: string;
  status: ArtifactStatus;
  payload: T;
  evidence: EvidenceClaim[];
  warnings: string[];
  confidence: number;
  createdAt: string;
}

export interface AgentMessage<T> {
  messageId: string;
  runId: string;
  taskId: string;
  sender: string;
  recipient: string;
  messageType: string;
  schemaVersion: string;
  artifactIds: string[];
  payload: T;
  createdAt: string;
}

export interface TranscriptReviewArtifacts {
  evidence: EvidenceItem[];
  evaluation: TranscriptEvaluation;
  redFlags: RedFlagAnalysis;
  review?: ReviewSynthesis;
}

export function createArtifact<T>(params: {
  runId: string;
  taskId?: string;
  artifactType: string;
  schemaVersion: string;
  producer: string;
  consumer?: string;
  payload: T;
  evidence?: EvidenceClaim[];
  warnings?: string[];
  confidence?: number;
}): AgentArtifact<T> {
  return {
    runId: params.runId,
    taskId: params.taskId,
    artifactType: params.artifactType,
    schemaVersion: params.schemaVersion,
    producer: params.producer,
    consumer: params.consumer,
    status: 'produced',
    payload: params.payload,
    evidence: params.evidence ?? [],
    warnings: params.warnings ?? [],
    confidence: Math.max(0, Math.min(1, params.confidence ?? 1)),
    createdAt: new Date().toISOString(),
  };
}
