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
        Recruitment intelligence that uses agentic AI to support evidence-based hiring.
      </p>

      <Card id="about-what-it-does-card">
        <CardHeader>
          <CardTitle>What HireLens does</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-muted-foreground">
          <p>
            HireLens turns job descriptions and resumes into structured, comparable profiles, then
            runs a reproducible, multi-agent workflow to help recruiters make better decisions.
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
              <strong>Evidence-based matching</strong> — computes a deterministic weighted coverage
              score and uses an LLM to add qualitative gap analysis with cited reasoning.
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
              <strong>Review synthesis</strong> — assembles match, evaluation, and flags into a
              decision packet for a human reviewer.
            </li>
            <li>
              <strong>Learning knowledge base</strong> — stores past evaluations and interview
              assessments for RAG-driven grounding of future recommendations.
            </li>
          </ul>
          <p>
            Every AI output is advisory. A human always makes the final call, and every override
            becomes retrievable precedent.
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
            outputs validated by Zod schemas.
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
                (knowledge entries and evaluations). Downstream agents use this evidence to ground
                recommendations in what happened before, not just the current candidate.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground">Gap Analysis Agent</h3>
              <p className="text-sm">
                Compares a job&apos;s requirements against the candidate&apos;s profile. Produces a
                match score, verdict, strong skills, missing skills, partial matches, and areas to
                validate, anchored to a deterministic weighted-coverage signal.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground">Question Agent</h3>
              <p className="text-sm">
                Generates a tailored interview question set for a specific candidate and job.
                Includes screening, deep-technical, gap-validation, and experience-validation
                questions, each with expected signals and rationale.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground">Transcript Evaluation Agent</h3>
              <p className="text-sm">
                Evaluates an interview transcript against the planned question set. Scores technical
                and communication separately, records signals hit and missed, and requires every
                judgement to cite a direct quote.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground">Red Flag Agent</h3>
              <p className="text-sm">
                Scans for inconsistencies between the resume and the interview, such as seniority
                mismatches, project-depth issues, contradictions, unrealistic claims, and timeline
                problems. Returns GREEN, YELLOW, or RED levels. Advisory only.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-foreground">Human Review Agent</h3>
              <p className="text-sm">
                Synthesises the match analysis, transcript evaluation, and red flags into a decision
                packet for a human reviewer. Recommends advance, hold, or reject, with a headline,
                key evidence, open questions, and comparable historical cases.
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
            The main lifecycle is modelled as three LangGraph workflows:
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
              <strong>Candidate analysis</strong> — load job and candidate → retrieve evidence → gap
              analysis → persist analysis → generate questions → persist questions.
            </li>
            <li>
              <strong>Transcript review</strong> — load transcript → retrieve evidence → evaluate
              transcript → persist evaluation → detect red flags → persist flags → synthesise review
              → add to knowledge base.
            </li>
          </ol>
          <p className="text-sm">
            Vector indexes for job descriptions, resumes, questions, and evaluations feed the
            Evidence Retrieval Agent, giving the system an explicit memory of past decisions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
