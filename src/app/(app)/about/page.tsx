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
        Privacy-aware recruitment intelligence powered by adaptive, observable agentic AI.
        HireLens combines deterministic scoring, evidence-grounded models, reflexion, shared
        memory, and human review without sending candidate PII to model providers.
      </p>

      <Card id="about-what-it-does-card">
        <CardHeader>
          <CardTitle>What HireLens does</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-muted-foreground">
          <p>
            HireLens turns job descriptions, resumes, and interview transcripts into structured
            evidence. Original source content remains available to authorised recruiters, while
            privacy-filtered copies cross AI and embedding boundaries. LangGraph coordinates
            specialised agents, deterministic scoring, retrieval, validation, and human review.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Job intake</strong> — parses raw job descriptions into structured
              requirements, importance scores, categories, and minimum years of experience.
            </li>
            <li>
              <strong>Privacy-aware candidate intake</strong> — extracts contact details locally,
              removes candidate identity, contact, location, URLs, and education institutions before
              AI processing, then builds a normalised skills, employment, and project profile.
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
              <strong>Observable orchestration</strong> — every LangGraph workflow has a persisted
              run record, while transcript evaluation and red-flag work use durable typed tasks,
              idempotency keys, events, and validated artifacts.
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
              <strong>Optional token usage tracking</strong> — captures per-agent prompt,
              completion, and total token counts. The display is off by default and can be enabled
              from Settings for candidate and agent-level cost visibility.
            </li>
          </ul>
          <p>
            Every AI output is advisory. A human always makes the final call, while validated
            feedback and overrides become calibration data for future runs. Candidate PII remains
            available to authorised application users but is excluded at outbound AI boundaries.
          </p>
        </CardContent>
      </Card>

      <Card id="about-privacy-card" className="border-emerald-500/20">
        <CardHeader>
          <CardTitle>Candidate privacy and AI boundaries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-muted-foreground">
          <p>
            Candidate PII is kept inside the application and removed before content reaches an
            external chat or embedding model. The control is enforced centrally rather than relying
            only on individual agent prompts.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Central outbound sanitisation</strong> — system prompts, user templates, and
              nested model inputs pass through the same privacy filter before every structured LLM
              invocation.
            </li>
            <li>
              <strong>Identity and contact redaction</strong> — known candidate names, email
              addresses, phone numbers, locations, participant names, addresses, and URLs are
              replaced with non-identifying placeholders.
            </li>
            <li>
              <strong>Education privacy</strong> — college, university, institute, school, and
              academy references are redacted, and education sections are removed from resume text
              sent to AI models.
            </li>
            <li>
              <strong>Local contact preservation</strong> — name, email, and phone extraction occurs
              locally so authorised recruiters can still use those fields without asking the Resume
              Agent to process them.
            </li>
            <li>
              <strong>Demo-safe document previews</strong> — when Demo mode is enabled, uploaded
              resumes and transcripts are redacted before appearing in editable text areas. The
              original extracted values are retained separately and saved for authorised future
              retrieval; outbound AI processing still applies the central privacy boundary.
            </li>
            <li>
              <strong>Privacy-filtered vector search</strong> — document chunks and semantic-search
              queries are sanitised before embedding. Candidate embedding text is anonymous and does
              not include education history.
            </li>
            <li>
              <strong>Transcript protection</strong> — candidate and participant identities plus
              known education institutions are removed before transcript evaluation and red-flag
              analysis.
            </li>
          </ul>
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
                <li>Next.js 16 (App Router)</li>
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
                <li>OpenAI structured outputs and privacy-filtered embeddings</li>
                <li>Central PII sanitisation before model-provider boundaries</li>
                <li>LangSmith tracing of already-sanitised model calls</li>
                <li>Workflow run logging plus durable transcript tasks and artifacts</li>
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
            The platform is built around specialised agents coordinated by LangGraph. LLM agents
            produce Zod-validated structured outputs, retrieval agents use privacy-filtered
            embeddings, supervisor nodes choose execution depth, and reflexion loops retry invalid
            evidence. Shared memory carries calibration between runs, while deterministic checks and
            human review remain outside the model boundary.
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
                Receives a privacy-filtered resume after contact fields are extracted locally.
                Captures skills with evidence and proficiency, employment and project history,
                inferred technologies, and total experience without receiving the candidate&apos;s
                identity, contact details, location, or education institutions.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground">Evidence Retrieval Agent</h3>
              <p className="text-sm">
                Performs vector search over pgvector to retrieve comparable historical cases
                (knowledge entries and evaluations). Candidate analysis can retrieve calibration
                evidence before gap analysis, unless the supervisor selects the minimal route, and
                then performs a gap-targeted retrieval pass after analysis. Transcript review also
                retrieves evidence before its evaluation branches. Downstream agents use this
                history to ground recommendations in prior outcomes.
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
              <strong>Resume intake</strong> — load → extract contact fields locally → redact PII →
              extract a structured profile → persist → index privacy-filtered vectors.
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
            Privacy-filtered vector indexes for job descriptions, anonymous candidate profiles,
            questions, and evaluations feed the Evidence Retrieval Agent, giving the system an
            explicit evidence memory without sending candidate PII to the embedding provider.
          </p>
        </CardContent>
      </Card>

      <Card id="about-orchestration-card">
        <CardHeader>
          <CardTitle>Run logging and durable tasks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-muted-foreground">
          <p>
            Every LangGraph execution is recorded as a workflow run with status, current node,
            timings, output, and errors. Transcript evaluation and red-flag branches add durable
            typed tasks and validated artifacts where replayable agent-level tracking is needed.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Workflow lifecycle</strong> — JD intake, resume intake, candidate analysis,
              and transcript review each persist run status and node timings.
            </li>
            <li>
              <strong>Durable transcript tasks</strong> — Transcript Evaluation and Red Flag tasks
              track pending, running, complete, or failed state, attempts, and output artifacts.
            </li>
            <li>
              <strong>Typed artifacts</strong> — validated transcript evaluations and red-flag
              outputs persist evidence claims, warnings, confidence scores, and schema versions
              independently from domain rows.
            </li>
            <li>
              <strong>Output validation</strong> — transcript evaluation quotes are verified against
              the source transcript; red flags must have evidence and consistent severity levels.
            </li>
            <li>
              <strong>Event log</strong> — transcript evaluation and red-flag task starts and
              completions are recorded as typed events for observability.
            </li>
            <li>
              <strong>Idempotency</strong> — durable transcript tasks use unique idempotency keys so
              retries do not create duplicate task records.
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
            Demo mode makes the agentic system explainable without changing production decisions.
            It enables a persistent running-agent history near the page content and places the{' '}
            <strong>Under the Hood</strong> panel after a clear visual break, exposing both individual
            run explanations and the wider workflow mechanics.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Persistent running-agent history</strong> — Demo-only, newest-first cards retain
              every captured run with status, timestamp, candidate context, current stage, AI
              involvement, and orchestration details. Only the active request stage is presented as
              running; other participating agents are recorded when the workflow confirms completion.
              The compact feed shows roughly one and a half cards, keeps older runs scrollable across
              navigation and reloads, remains open until closed, and clears only by manual Reset.
            </li>
            <li>
              <strong>Activity-scoped status checks</strong> — agent-status requests begin when a
              user action starts an AI workflow, continue only while a server-side run is active,
              and stop when the run finishes or no active run is returned.
            </li>
            <li>
              <strong>Current workflow</strong> — shows each specialised agent in lifecycle order
              with running, complete, and failed states.
            </li>
            <li>
              <strong>Agent runs per candidate</strong> — an independent Settings toggle controls
              the separate stacked candidate workflow history without hiding Under the Hood itself.
            </li>
            <li>
              <strong>Optional token visibility</strong> — token totals are captured per agent but
              hidden by default; recruiters can opt in from Settings to see candidate and agent-level
              prompt, completion, and total usage.
            </li>
            <li>
              <strong>Prompt editor</strong> — displays and overrides agent system and user templates
              at runtime for controlled prompt-engineering demonstrations. Outbound values still pass
              through the central PII filter.
            </li>
            <li>
              <strong>Developer display control</strong> — the Next.js bottom-left development menu
              is hidden by default and can be shown with a development-only Settings flag.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
