import { readFileSync } from 'fs';
import { join } from 'path';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

const version = (JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8')
) as { version: string }).version;

export const metadata = { title: 'About - HireLens' };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">HireLens</h1>
        <Badge variant="secondary">v{version}</Badge>
      </div>

      <p className="text-lg text-muted-foreground">
        Recruitment intelligence that uses an adaptive multi-agent system to support
        evidence-based hiring with reflexion, shared memory, and cross-candidate reasoning.
      </p>

      <Card id="about-what-it-does-card">
        <CardHeader>
          <CardTitle>What HireLens does</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-muted-foreground">
          <p>
            HireLens turns job descriptions and resumes into structured, comparable profiles, then
            runs a reproducible, multi-agent workflow with supervisor routing, reflexion loops,
            and shared agent memory to help recruiters make better decisions.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Job intake</strong> — parses raw job descriptions into structured
              requirements, importance scores, categories, and minimum years of experience.
            </li>
            <li>
              <strong>Candidate intake</strong> — extracts a normalised skill profile, employment
              history, projects, and contact details from resumes.
            </li>
            <li>
              <strong>Supervisor routing</strong> — inspects candidate coverage and seniority before
              analysis to decide depth: minimal (skip evidence retrieval for senior, well-matched
              candidates), standard, or deep (extra evidence retrieval for junior or weakly-matched
              candidates).
            </li>
            <li>
              <strong>Evidence-based matching</strong> — computes a deterministic weighted coverage
              score and uses an LLM to add qualitative gap analysis with cited reasoning.
            </li>
            <li>
              <strong>Iterative evidence retrieval (agentic RAG)</strong> — runs a second vector
              search pass after gap analysis, targeted at the specific missing and partial skills
              identified, so interview questions are grounded in how similar gaps were validated
              historically.
            </li>
            <li>
              <strong>Cross-candidate reasoning</strong> — fetches a summary of other candidates in
              the same job pipeline and feeds it into the Gap Analysis Agent so questions
              differentiate between similarly-matched candidates.
            </li>
            <li>
              <strong>Interview preparation</strong> — generates candidate-specific and role-specific
              question sets (screening, deep technical, gap validation, experience validation).
            </li>
            <li>
              <strong>Interview evaluation</strong> — scores transcripts for technical depth and
              communication, checks answers against expected signals, and grounds findings in direct
              quotes.
            </li>
            <li>
              <strong>Red-flag detection</strong> — surfaces inconsistencies between the resume and
              the interview (advisory only; never auto-rejects).
            </li>
            <li>
              <strong>Reflexion loops</strong> — when an agent&apos;s output fails validation, it
              gets a second attempt with feedback describing what went wrong. Systematic failures
              are written to shared agent memory as bias warnings.
            </li>
            <li>
              <strong>Shared agent memory</strong> — a persistent, cross-run calibration store. When
              a human reviewer overrides an agent recommendation, a calibration note is written so
              the agent adjusts its behavior on future runs. Agents read their own notes before
              each run.
            </li>
            <li>
              <strong>Review synthesis</strong> — assembles match, evaluation, and flags into a
              decision packet for a human reviewer.
            </li>
            <li>
              <strong>Durable task orchestration</strong> — every agent run is tracked as typed
              tasks with idempotency keys, dependency graphs, and persisted artifacts with evidence
              claims, warnings, and confidence scores.
            </li>
            <li>
              <strong>Learning knowledge base</strong> — stores past evaluations and interview
              assessments for RAG-driven grounding of future recommendations.
            </li>
            <li>
              <strong>Pre-interview export</strong> — generates a printable PDF report per candidate
              with match analysis, strong areas, gaps, interview questions, and &quot;look for&quot;
              signals before the interview.
            </li>
            <li>
              <strong>Post-interview email export</strong> — selects multiple candidates across jobs
              and generates a formatted email report with final decisions, reasoning, agent ratings,
              and red flags. Colour-coded decisions (green/Selected, red/Rejected, orange/On Hold)
              with HTML formatting copied to clipboard.
            </li>
            <li>
              <strong>Candidate comparison</strong> — side-by-side comparison of all candidates in a
              job pipeline, ranked by interview rating and match score, with technical and
              communication scores, flags, and decisions.
            </li>
            <li>
              <strong>Candidate deletion</strong> — permanently removes a candidate and all
              associated data (resume, analysis, interviews, evaluations, flags) when a profile was
              uploaded to the wrong job.
            </li>
            <li>
              <strong>Shared workspace</strong> — all authenticated users see and manage all jobs,
              candidates, and related data. The <code>created_by</code> field is retained for audit
              trail but no longer gates access.
            </li>
            <li>
              <strong>Token usage tracking</strong> — captures per-agent OpenAI token usage
              (prompt, completion, total) for every LLM call and displays it in the Under the Hood
              section, aggregated per candidate and per agent.
            </li>
          </ul>
          <p>
            Every AI output is advisory. A human always makes the final call, and every override
            becomes calibration data that makes the agents smarter over time.
          </p>
        </CardContent>
      </Card>

      <Card id="about-tech-stack-card">
        <CardHeader>
          <CardTitle>Technology stack</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-muted-foreground">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-1 font-medium text-foreground">Frontend</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                <li>Next.js 15 (App Router)</li>
                <li>React 19</li>
                <li>TypeScript 5</li>
                <li>Tailwind CSS 4</li>
                <li>shadcn/ui + @base-ui/react</li>
                <li>Lucide icons, Recharts, Sonner, date-fns</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-1 font-medium text-foreground">Backend & data</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                <li>Supabase (Postgres + pgvector)</li>
                <li>Supabase Auth with SSR sessions</li>
                <li>Row Level Security (shared workspace)</li>
                <li>Zod for schema validation</li>
                <li>OpenAI chat and embedding models</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-1 font-medium text-foreground">AI / orchestration</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                <li>LangChain and @langchain/openai</li>
                <li>LangGraph state-machine workflows</li>
                <li>OpenAI structured outputs / Responses API</li>
                <li>LangSmith tracing</li>
                <li>Durable task lifecycle (idempotency, artifacts, events)</li>
                <li>Reflexion retry loops with validation feedback</li>
                <li>Shared agent memory (calibration store)</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-1 font-medium text-foreground">Parsing & tooling</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                <li>unpdf for PDF text extraction</li>
                <li>mammoth for DOCX files</li>
                <li>pgvector for embedding storage and RAG</li>
                <li>Vitest, ESLint, tsx</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id="about-agentic-ai-card" className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-primary">Agentic AI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-muted-foreground">
          <p>
            The platform is built around a set of specialised agents that run inside LangGraph
            workflows. Each agent is responsible for one narrow task and uses OpenAI structured
            outputs validated by Zod schemas. Agents read calibration notes from shared memory
            before running, and validation failures or reviewer overrides write new notes back.
          </p>

          <Separator />

          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-foreground">JD Agent</h3>
              <p className="text-sm">
                Reads a raw job description and extracts a precise, structured requirement profile.
                Splits compound requirements, assigns 0-100 importance, categorises skills,
                technologies, experience, certifications, and domains, and marks required vs.
                nice-to-have items.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground">Resume Agent</h3>
              <p className="text-sm">
                Reads a raw resume and extracts a structured candidate profile. Captures skills with
                evidence and proficiency, employment and project history, inferred technologies, and
                total years of experience from the timeline.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground">Evidence Retrieval Agent</h3>
              <p className="text-sm">
                Performs vector search over pgvector to retrieve comparable historical cases
                (knowledge entries and evaluations). Runs in two passes during candidate analysis:
                once before gap analysis for calibration, and once after for gap-targeted evidence
                (agentic RAG). Downstream agents use this evidence to ground recommendations in what
                happened before, not just the current candidate.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground">Gap Analysis Agent</h3>
              <p className="text-sm">
                Compares a job&apos;s requirements against the candidate&apos;s profile and produces a
                match score, verdict, strong skills, missing skills, partial matches, and areas to
                validate. Receives peer context (other candidates in the pipeline) so it can
                differentiate between similarly-matched candidates. Reads calibration notes from
                shared agent memory before running.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground">Question Agent</h3>
              <p className="text-sm">
                Generates a tailored interview question set based on the gap analysis and
                gap-targeted evidence. Produces screening, deep technical, gap validation, and
                experience validation questions with expected signals and rationale.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground">Transcript Evaluation Agent</h3>
              <p className="text-sm">
                Evaluates an interview transcript against the planned question set. Scores technical
                and communication separately, records signals hit and missed, and requires every
                judgement to cite a direct quote. Uses reflexion: if validation fails (e.g. a quote
                is not found in the transcript), the agent retries with feedback. Reads calibration
                notes from shared agent memory before running.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground">Red Flag Agent</h3>
              <p className="text-sm">
                Scans for inconsistencies between the resume and the interview, such as seniority
                mismatches, project-depth issues, contradictions, unrealistic claims, and timeline
                problems. Returns GREEN, YELLOW, or RED levels. Advisory only. Uses reflexion: if
                validation fails (e.g. a flag has no evidence), the agent retries with feedback.
                Reads calibration notes from shared agent memory before running.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground">Human Review Agent</h3>
              <p className="text-sm">
                Synthesises the match analysis, transcript evaluation, and red flags into a decision
                packet for a human reviewer. Recommends advance, hold, or reject, with a headline,
                key evidence, open questions, and comparable historical cases. Reads calibration
                notes from shared agent memory before running.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id="about-workflow-card">
        <CardHeader>
          <CardTitle>How the workflow fits together</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-muted-foreground">
          <p className="text-sm">
            The main lifecycle is modelled as four LangGraph workflows:
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>
              <strong>JD intake</strong> — load → extract structured JD → persist → index vectors.
            </li>
            <li>
              <strong>Resume intake</strong> — load → extract structured resume → persist → index
              vectors.
            </li>
            <li>
              <strong>Candidate analysis</strong> — load → route analysis (supervisor) → load peer
              context → retrieve evidence → gap analysis → retrieve gap evidence (agentic RAG) →
              persist analysis → generate questions → persist questions.
            </li>
            <li>
              <strong>Transcript review</strong> — load → retrieve evidence → [evaluate transcript
              <code> || </code>detect red flags] (parallel, both with reflexion) → persist evaluation +
              persist flags → synthesise review → add to knowledge base.
            </li>
          </ol>
          <p className="text-sm">
            The supervisor node inspects coverage signals and candidate seniority before analysis to
            decide depth (minimal, standard, or deep). Cross-candidate reasoning feeds a summary of
            the candidate pool into the Gap Analysis Agent. Reflexion loops retry agents on
            validation failure with feedback. Shared agent memory persists calibration notes from
            reviewer overrides and validation failures, which agents read before each run.
          </p>
          <p className="text-sm">
            Vector indexes for job descriptions, resumes, questions, and evaluations feed the
            Evidence Retrieval Agent, giving the system an explicit memory of past decisions.
          </p>
        </CardContent>
      </Card>

      <Card id="about-orchestration-card">
        <CardHeader>
          <CardTitle>Durable task orchestration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-muted-foreground">
          <p>
            Every agent run is tracked as typed tasks with idempotency keys, dependency graphs, and
            persisted artifacts. This provides:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Task lifecycle</strong> — each agent invocation is a task with status
              (pending, running, complete, failed, blocked), attempt count, and max attempts.
            </li>
            <li>
              <strong>Typed artifacts</strong> — agent outputs are persisted as artifacts with
              evidence claims, warnings, confidence scores, and schema versions, independent from
              domain rows.
            </li>
            <li>
              <strong>Output validation</strong> — transcript evaluation quotes are verified against
              the source transcript; red flags must have evidence and consistent severity levels.
            </li>
            <li>
              <strong>Event log</strong> — every agent start and completion is recorded as a typed
              event for observability and replay.
            </li>
            <li>
              <strong>Idempotency</strong> — tasks use unique idempotency keys so retries are safe.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card id="about-observability-card">
        <CardHeader>
          <CardTitle>Under the Hood: observability</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-muted-foreground">
          <p>
            The <strong>Under the Hood</strong> panel (visible on every page when demo mode is
            enabled) provides real-time visibility into the agentic AI pipeline.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Agent Runs per candidate</strong> — one stacked workflow per candidate, showing each
              agent in lifecycle order with live status (running, complete, failed). Completed
              agents turn green with check marks; running agents show spinners.
            </li>
            <li>
              <strong>Agent runs by candidate</strong> — a per-candidate breakdown of every agent
              that has run, with timestamps and status indicators.
            </li>
            <li>
              <strong>Token usage</strong> — each agent row shows its OpenAI token consumption
              (prompt, completion, total). Each candidate header shows the aggregate token total
              across all agents. Token data is captured via LangChain callbacks and flows through
              the API response to the UI without changing any agent or graph function signatures.
            </li>
            <li>
              <strong>Prompt editor</strong> — view and override the system and user prompts for
              each agent at runtime, so you can experiment with prompt engineering without
              redeploying.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
