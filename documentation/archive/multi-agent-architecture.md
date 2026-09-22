# HireLens Multi-Agent Architecture

HireLens uses a deterministic orchestrator around specialized agents. Agents
communicate through typed artifacts rather than passing unversioned prose
between model calls.

## Workflow execution

The shared entry point is `runOrchestratedWorkflow` in
`src/lib/orchestration/orchestrator.ts`. LangGraph remains responsible for
stateful workflow execution. Each important agent task can emit an artifact,
event, and task status in Supabase.

Transcript review fans out after shared context and evidence preparation:

1. Transcript Evaluation Agent evaluates the interview using transcript quotes.
2. Red Flag Agent independently checks resume and transcript inconsistencies.
3. The graph joins both validated artifacts before Human Review synthesis.

The Red Flag Agent deliberately does not consume evaluation scores. This keeps
the parallel branches independent and prevents one agent's interpretation from
being silently treated as evidence by the other.

## Durable handoffs

The `agent_tasks`, `agent_artifacts`, and `agent_events` tables provide:

- retry and idempotency metadata;
- per-agent lifecycle events;
- versioned, evidence-bearing JSON artifacts;
- task-to-artifact relationships for audit and replay.

The existing domain tables remain the UI-facing projection of the workflow.

## Hallucination detection

Hallucination detection is intentionally implemented with DeepEval only. The
offline evaluator is `scripts/deepeval_hallucination.py` and consumes JSONL:

```json
{
  "id": "evaluation-1",
  "input": "...",
  "actual_output": "...",
  "context": ["exact source text"]
}
```

Run it with:

```bash
python -m pip install -r requirements-deepeval.txt
python scripts/deepeval_hallucination.py evaluations.jsonl
```

The `context` must be the exact source material supplied to the agent. The
script runs `HallucinationMetric` only. It does not fall back to another model,
RAGAS, or a heuristic score when DeepEval is unavailable.
