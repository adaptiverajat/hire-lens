import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { serverEnv } from '@/lib/env';
import { getDemoContext } from '@/lib/demo/server-store';

/**
 * LangSmith reads configuration from process.env, so we mirror our validated
 * env onto the variables the tracer expects. Called before any chain runs.
 */
let tracingConfigured = false;

export function configureTracing() {
  if (tracingConfigured) return;
  const env = serverEnv();

  if (env.LANGSMITH_TRACING && env.LANGSMITH_API_KEY) {
    process.env.LANGSMITH_TRACING = 'true';
    process.env.LANGSMITH_API_KEY = env.LANGSMITH_API_KEY;
    process.env.LANGSMITH_PROJECT = env.LANGSMITH_PROJECT;
    process.env.LANGSMITH_ENDPOINT = env.LANGSMITH_ENDPOINT;
  } else {
    process.env.LANGSMITH_TRACING = 'false';
  }

  tracingConfigured = true;
}

type ModelTier = 'reasoning' | 'fast';

/**
 * Chat model factory. `useResponsesApi` routes calls through the OpenAI
 * Responses API rather than Chat Completions.
 */
export function chatModel(tier: ModelTier = 'reasoning', temperature = 0.2, maxTokens?: number) {
  configureTracing();
  const env = serverEnv();
  const demo = getDemoContext();

  const apiKey = (demo?.enabled && demo.openaiKey ? demo.openaiKey : undefined) ?? env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('No OpenAI API key available. Add OPENAI_API_KEY to .env.local.');
  }

  return new ChatOpenAI({
    apiKey,
    model: tier === 'fast' ? env.OPENAI_FAST_MODEL : env.OPENAI_CHAT_MODEL,
    temperature,
    maxTokens,
    useResponsesApi: true,
    maxRetries: 2,
  });
}

export function embeddingModel() {
  configureTracing();
  const env = serverEnv();
  const demo = getDemoContext();

  const apiKey = (demo?.enabled && demo.openaiKey ? demo.openaiKey : undefined) ?? env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('No OpenAI API key available. Add OPENAI_API_KEY to .env.local.');
  }

  return new OpenAIEmbeddings({
    apiKey,
    model: env.OPENAI_EMBEDDING_MODEL,
    maxRetries: 2,
  });
}

export function embeddingModelName() {
  return serverEnv().OPENAI_EMBEDDING_MODEL;
}
