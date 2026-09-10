# HireLens — Product Requirements Document

## 1. Overview

HireLens is a recruitment intelligence platform that uses an adaptive multi-agent AI system to support evidence-based hiring. It parses job descriptions and resumes into structured profiles, runs reproducible LangGraph workflows with supervisor routing, reflexion loops, and shared agent memory, and produces interview question sets, transcript evaluations, red-flag detection, and decision packets for human reviewers.

Every AI output is advisory. A human always makes the final call. Every override becomes calibration data that makes the agents smarter over time.

## 2. Goals

- **Evidence-based hiring**: every agent recommendation is grounded in cited evidence from the source documents, not speculation.
- **Adaptive analysis**: the supervisor routes analysis depth based on candidate profile signals, avoiding wasted work on clear cases and adding depth where needed.
- **Self-correcting agents**: reflexion loops retry agents on validation failure with feedback, and systematic failures are recorded as bias warnings in shared memory.
- **Organizational learning**: reviewer overrides and validation failures are persisted as calibration notes that agents read before each run, so the platform gets smarter with every decision.
- **Cross-candidate reasoning**: the Gap Analysis Agent sees a summary of the candidate pool so questions differentiate between similarly-matched candidates.
- **Human-in-the-loop**: agents recommend, humans decide. No agent can reject a candidate.
- **Observability**: every agent run, task, artifact, and token is tracked and visible in the Under the Hood panel.
- **Shared workspace**: all authenticated users see and manage all jobs, candidates, and related data.

## 3. Target users

- **Recruiters** — create jobs, upload candidate resumes, run analysis, review interview transcripts, and make hiring decisions.
- **Hiring managers** — compare candidates in a pipeline, review agent recommendations, and override with reasoning.
- **Demo viewers** — explore the platform with demo mode enabled, which masks sensitive candidate information.

## 4. Architecture

### 4.1 Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui |
| Backend | Supabase (Postgres + pgvector), Supabase Auth, Row Level Security |
| AI | LangChain, @langchain/openai, LangGraph, OpenAI structured outputs, LangSmith tracing |
| Models | gpt-4.1 (reasoning tier), gpt-4.1-mini (fast tier), text-embedding-3-small |
| Parsing | unpdf (PDF), mammoth (DOCX) |
| Testing | Vitest |

### 4.2 Database schema

16 migrations (0001–0016) covering:

- **Identity**: users, profiles
- **Jobs**: jobs, job_skills
- **Candidates**: candidates, candidate_skills
- **Analysis**: match_analyses
- **Questions**: question_sets, questions
- **Interviews**: interviews, transcripts, evaluations
- **Review**: flags, feedback
- **Knowledge**: knowledge_entries, embeddings (pgvector)
- **Observability**: agent_runs
- **Orchestration**: agent_tasks, agent_artifacts, agent_events
- **Memory**: agent_memory
- **Prompts**: prompt_overrides
- **Storage**: resume and JD file buckets

### 4.3 Row Level Security

- Migrations 0010 established per-user RLS policies.
- Migration 0014 replaced them with shared-workspace policies: any authenticated user can read and write all job-related data. `created_by` is retained for audit trail but no longer gates access.
- Migrations 0015 and 0016 apply the same authenticated-user pattern to orchestration and memory tables.

## 5. Agents

### 5.1 Agent roster

| Agent | Model tier | Role |
|---|---|---|
| JD Agent | fast (gpt-4.1-mini) | Parse raw job descriptions into structured requirements |
| Resume Agent | fast | Parse raw resumes into structured candidate profiles |
| Evidence Retrieval Agent | embedding | Vector search over pgvector for comparable historical cases |
| Gap Analysis Agent | reasoning (gpt-4.1) | Compare job requirements vs candidate profile, produce match score and gap analysis |
| Question Agent | reasoning | Generate candidate-specific interview questions with expected signals |
| Transcript Evaluation Agent | reasoning | Score interview transcript for technical depth and communication |
| Red Flag Agent | fast | Detect inconsistencies between resume and interview |
| Human Review Agent | reasoning | Synthesise all agent outputs into a decision packet |

### 5.2 Agent enhancements

#### Supervisor routing

The `route_analysis` node in the candidate-analysis graph inspects coverage signals and candidate seniority before analysis to decide depth:

- **Minimal** (coverage >= 80 AND years >= 8): skip evidence retrieval entirely. Senior, well-matched candidates don't need historical grounding.
- **Standard**: normal flow with 4 evidence chunks and 3 gap-evidence chunks.
- **Deep** (coverage < 40 OR years < 3): retrieve 6 gap-evidence chunks instead of 3. Junior or weakly-matched candidates need more grounding.

#### Reflexion loops

The `withReflexion` utility wraps agent calls with a retry loop:

1. Call the agent.
2. Validate the output (transcript quotes must appear in the source; red flags must have evidence and consistent severity).
3. If validation fails, feed the error messages back into the agent's prompt as `VALIDATION FEEDBACK` and retry (max 2 attempts).
4. If all attempts fail, throw and write a `bias_warning` note to shared agent memory.

#### Shared agent memory

A persistent, cross-run calibration store (`agent_memory` table):

- **Read**: each agent fetches its calibration notes before running, scoped to the job when possible. Notes are injected into the prompt as `CALIBRATION NOTES (from past runs — adjust your behavior accordingly)`.
- **Write-back on override**: when a human reviewer overrides an agent recommendation, a `calibration` note is written to the relevant agent with the reviewer's reasoning.
- **Write-back on failure**: when the reflexion loop exhausts all attempts, a `bias_warning` note is written with the recurring error messages.

Note types: `calibration`, `bias_warning`, `outcome`, `insight`.
Sources: `reviewer_override`, `validation_failure`, `post_hire_outcome`, `agent_insight`, `cross_agent`.

#### Cross-candidate reasoning

The `load_peer_context` node fetches up to 5 other candidates' match analyses for the same job (match score, verdict, strong/missing skills) and builds a summary string. This is fed into the Gap Analysis Agent's prompt so it can prioritise questions that reveal whether this candidate stands out in areas where others are weak.

#### Iterative evidence retrieval (agentic RAG)

The `retrieve_gap_evidence` node runs after gap analysis. It constructs a query from the identified missing skills, partial skills, and areas to validate, then retrieves targeted historical evidence. This gives the Question Agent context on how similar gaps were validated in past interviews.

## 6. Workflows

### 6.1 JD intake

```
load → extract structured JD → persist → index vectors
```

### 6.2 Resume intake

```
load → extract structured resume → persist → index vectors
```

### 6.3 Candidate analysis

```
load → route_analysis (supervisor) → load_peer_context → retrieve_evidence
    → gap_analysis → retrieve_gap_evidence (agentic RAG) → persist_analysis
    → question_generation → persist_questions
```

### 6.4 Transcript review

```
load → retrieve_evidence
    → [evaluate_transcript (reflexion) || detect_red_flags (reflexion)]  (parallel)
    → persist_evaluation + persist_flags
    → synthesise_review → persist_knowledge
```

Transcript Evaluation and Red Flag Detection run in parallel after evidence retrieval. Both use reflexion loops with validation. `persist_flags` waits for both to complete.

## 7. Durable task orchestration

Migration 0015 added three tables for durable orchestration:

- **`agent_tasks`** — status (pending/running/complete/failed/blocked), dependency_ids, input_artifact_ids, output_artifact_id, idempotency_key (unique), attempt, max_attempts, leased_until.
- **`agent_artifacts`** — typed payloads with status (produced/validated/rejected), evidence claims, warnings, confidence, content_hash, schema_version.
- **`agent_events`** — event log per run/task for observability and replay.

The orchestrator (`src/lib/orchestration/orchestrator.ts`) provides a single typed entry point with overloads for each workflow.

### Validation

- **Transcript Evaluation**: every evidence quote must appear in the source transcript (case-insensitive substring match). Missing or unsupported quotes are errors.
- **Red Flags**: every flag must have at least one evidence item. The top-level severity must match the highest individual flag severity.

## 8. Features

### 8.1 Job management

- Create jobs from raw job descriptions (paste text, upload PDF/DOCX).
- Edit job details (title, department, location, status, priority, deadline).
- Delete jobs with cascade to candidates, interviews, and evaluations.
- Urgent priority flag for time-sensitive roles.
- Parse status tracking (pending, processing, complete, failed).

### 8.2 Candidate management

- Add candidates to a job (paste resume text, upload PDF/DOCX).
- Parse resumes into structured profiles.
- Delete candidates with cascade to all associated data.
- Candidate status pipeline: new → screening → interviewing → on_hold → hired/rejected.

### 8.3 Analysis

- Deterministic weighted coverage score (keyword matching with partial/fuzzy matching).
- LLM gap analysis with match score, verdict, strong/missing/partial skills, areas to validate.
- Supervisor routing based on coverage and seniority.
- Iterative evidence retrieval targeted at identified gaps.
- Cross-candidate reasoning with peer context.

### 8.4 Interview preparation

- Question sets with four categories: screening, deep technical, gap validation, experience validation.
- Each question has expected signals, rationale, target skill, and difficulty.
- Questions are indexed for future retrieval.

### 8.5 Interview evaluation

- Transcript upload with participant detection.
- Technical and communication scores (0-10) with evidence quotes.
- Answer breakdown per planned question.
- Signals hit and missed.
- Reflexion loop with quote validation.

### 8.6 Red flag detection

- Categories: seniority_mismatch, project_depth_mismatch, contradiction, unrealistic_claim, timeline_inconsistency.
- Levels: GREEN, YELLOW, RED.
- Advisory only — never auto-rejects.
- Reflexion loop with evidence validation.

### 8.7 Review synthesis

- Decision packet with recommendation (advance, hold, reject, hire), confidence, headline, key evidence, open questions, and comparable historical cases.
- GREEN flag optimization: skip the LLM call when there are no red flags.
- Hard guardrail: an unresolved RED flag can never yield advance/hire.

### 8.8 Human review

- Review queue with open flags across all candidates.
- Accept or override agent recommendations.
- Override reasoning is required (minimum 10 characters).
- Overrides write calibration notes to shared agent memory.
- Flags are resolved on decision.

### 8.9 Exports

- **Pre-interview export PDF**: per-candidate printable report with match analysis, strong areas, gaps, interview questions, and "look for" signals.
- **Post-interview email export**: multi-candidate selection across jobs, generates formatted HTML email with final decisions, reasoning, agent ratings, and red flags. Colour-coded decisions (green/Selected, red/Rejected, orange/On Hold). Copied to clipboard or opened via `mailto:`.

### 8.10 Candidate comparison

- Side-by-side comparison of all candidates in a job pipeline.
- Columns: candidate, match score/verdict, interview ratings, technical and communication scores, flags, and decision.
- Ranked by interview rating then match score.
- Demo-mode name masking is respected.

### 8.11 Shared workspace

- All authenticated users see and manage all jobs, candidates, and related data.
- `created_by` is retained for audit trail but no longer gates access.
- RLS policies allow any authenticated user to read and write all job-related data.

### 8.12 Demo mode

- Masks candidate names and transcript participant names.
- Camel-cased masked names for realistic-looking demo data.
- Under the Hood panel visible on every page.

### 8.13 Observability

- **Agent runs per candidate**: stacked workflow view with live status.
- **Token usage**: per-agent prompt, completion, and total tokens. Aggregated per candidate and per agent.
- **Prompt editor**: view and override system and user prompts at runtime.
- **Durable tasks**: task lifecycle, artifacts, and events tracked in the database.

## 9. Token optimization

- `gpt-4.1-mini` for JD, Resume, and Red Flag agents (fast tier).
- `gpt-4.1` for Gap Analysis, Question, Transcript Evaluation, and Review agents (reasoning tier).
- Parse-result caching to avoid re-parsing.
- Reduced input truncation lengths.
- Per-agent `maxTokens` settings.
- GREEN flag optimization: skip the Review Agent LLM call when there are no red flags.
- Supervisor routing: skip evidence retrieval for minimal-depth analyses.

## 10. Security and privacy

- Supabase Auth with SSR sessions.
- Row Level Security on all tables.
- Shared workspace model: any authenticated user can access all job-related data.
- Service-role server client for admin operations.
- No secrets exposed in client-side code.
- Demo mode masks sensitive candidate information.

## 11. Testing

- Vitest with `src/**/*.test.ts` include pattern.
- Validation tests: transcript quote verification, red flag evidence and severity consistency.
- Reflexion tests: first-pass success, retry-then-succeed, exhaust-all-attempts, feedback propagation.
- Memory tests: empty notes, formatted output, age labels.

## 12. Roadmap

### Implemented

- Supervisor routing (minimal/standard/deep)
- Reflexion retry loops with validation feedback
- Iterative evidence retrieval (agentic RAG)
- Cross-candidate reasoning with peer context
- Shared agent memory (calibration store with read + write-back)
- Durable task orchestration (tasks, artifacts, events)
- Parallel agent execution (transcript evaluation + red flags)
- Output validation (quote verification, evidence checks)
- Structured agent communication (typed artifacts with evidence claims)
- Candidate comparison
- Shared workspace access
- Pre-interview and post-interview exports
- Token usage tracking
- Demo mode with name masking

### Not yet implemented

- Human-in-the-loop checkpoints (LangGraph `interrupt()` with UI integration)
- Streaming partial results (events table could support it; no streaming endpoint yet)
- Tool-enabled agents (no `bindTools()` calls; agents are pure structured-output LLM calls)

## 13. File structure

```
src/
  app/
    (app)/                    # Authenticated app routes
      about/                  # About page
      candidates/             # Candidate list and detail
      dashboard/              # Dashboard with metrics
      jobs/                   # Job list, detail, and new candidate
      knowledge/             # Knowledge base explorer
      questions/              # Question library
      review/                 # Human review queue
      settings/               # Settings
      transcripts/            # Transcript list
    api/                      # API routes
      candidates/             # Candidate CRUD, parse, analyze
      dashboard/              # Dashboard metrics
      flags/                  # Flag queue
      interviews/             # Interview transcripts
      jobs/                   # Job CRUD, parse
      knowledge/              # Knowledge search
      questions/              # Question library
      review/                 # Human review submission
      transcripts/            # Transcript evaluation
  components/                 # React components
  lib/
    agents/                   # Agent implementations
    ai/                       # Structured output, token usage, vector store
    api/                      # API handler, auth context
    demo/                     # Demo mode
    domain/                   # Domain logic (matching, skills, format)
    graphs/                   # LangGraph workflows
    orchestration/            # Orchestrator, contracts, validation, reflexion, memory
    supabase/                 # Supabase clients
  types/                      # TypeScript types
supabase/
  migrations/                  # 16 SQL migrations (0001–0016)
```
