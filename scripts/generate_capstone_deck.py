"""Fill the CAAE02 capstone template with HireLens content.

Keeps the template's layouts, fonts (Roboto Slab headings, minor theme body),
colors (#4A4C55 headings), diagram skeletons, and slide numbering. Only text
is replaced/added; template instruction "Note:" boxes are removed.

Usage: python scripts/generate_capstone_deck.py
Output: documentation/HireLens_Capstone_Final_Submission.pptx
"""

from copy import deepcopy
from datetime import date
from pathlib import Path

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / 'documentation' / 'CAAE02_Certified Agentic AI Engineer_Capstone Project_Final Submission_Your Name.pptx'
OUT = ROOT / 'documentation' / 'HireLens_Capstone_Final_Submission.pptx'

HEADING_COLOR = RGBColor(0x4A, 0x4C, 0x55)
BODY_COLOR = RGBColor(0x33, 0x33, 0x33)
HEADING_FONT = 'Roboto Slab'


def set_shape_text(shape, text):
    """Replace a shape's text, preserving the first run's formatting."""
    tf = shape.text_frame
    para = tf.paragraphs[0]
    if para.runs:
        para.runs[0].text = text
        for r in para.runs[1:]:
            r.text = ''
        for p in list(tf.paragraphs[1:]):
            p._p.getparent().remove(p._p)
    else:
        tf.text = text


def shape_by_name(slide, name):
    for sh in slide.shapes:
        if sh.name == name:
            return sh
    raise KeyError(f'{name} not found')


def remove_note_boxes(slide):
    for sh in list(slide.shapes):
        if sh.has_text_frame and sh.text_frame.text.strip().startswith('Note:'):
            sh._element.getparent().remove(sh._element)


def add_text(slide, left, top, width, height, blocks):
    """Add a textbox. blocks = list of (text, kind) where kind is
    'h' (Roboto Slab heading), 'b' (bullet), or 'p' (plain paragraph)."""
    box = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tf = box.text_frame
    tf.word_wrap = True
    first = True
    for text, kind in blocks:
        para = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        run = para.add_run()
        run.text = ('•  ' + text) if kind == 'b' else text
        if kind == 'h':
            run.font.name = HEADING_FONT
            run.font.size = Pt(15)
            run.font.bold = True
            run.font.color.rgb = HEADING_COLOR
            para.space_before = Pt(10)
        elif kind == 'b':
            run.font.size = Pt(12.5)
            run.font.color.rgb = BODY_COLOR
            para.space_after = Pt(4)
        else:
            run.font.size = Pt(12.5)
            run.font.color.rgb = BODY_COLOR
            para.space_after = Pt(6)
    return box


def main():
    prs = Presentation(str(TEMPLATE))
    slides = prs.slides

    # ---------- Slide 1: Cover ----------
    s = slides[0]
    set_shape_text(shape_by_name(s, 'Text 28'), 'Project Title:  HireLens — Agentic Recruitment Intelligence')
    set_shape_text(shape_by_name(s, 'Text 29'), 'Participant(s): Rajat Srivastava')
    set_shape_text(shape_by_name(s, 'Text 30'), 'Organisation: HireLens')
    set_shape_text(shape_by_name(s, 'Text 32'), f'Submission Date:  {date.today():%d %B %Y}')

    # ---------- Slide 2: Agenda ----------
    s = slides[1]
    agenda = {
        'TextBox 29': '01. Problem, Context & Personas',
        'TextBox 31': '02. Current Process and Pain Points',
        'TextBox 32': '03. Project Objectives',
        'TextBox 34': '04. Agentic Workflow & System Architecture',
        'TextBox 36': '05. Data, Tools & Technology Stack',
        'TextBox 42': '06. Implementation and Demo',
        'TextBox 33': '07. Testing and Validation',
        'TextBox 37': '08. Analysis and Results',
        'TextBox 38': '09. Business Impact',
        'TextBox 40': '10. Conclusion and Future Scope',
        'TextBox 41': '11. References',
    }
    for name, text in agenda.items():
        set_shape_text(shape_by_name(s, name), text)

    # ---------- Slide 3: Problem Statement and Context ----------
    s = slides[2]
    set_shape_text(shape_by_name(s, 'TextBox 1'),
                   'Who is affected | What is broken today | Why agentic AI, why now')
    remove_note_boxes(s)
    add_text(s, 0.5, 1.75, 6.1, 4.6, [
        ('Personas & stakeholders', 'h'),
        ('Recruiters / talent partners — screen every resume manually against loosely structured JDs.', 'b'),
        ('Hiring managers — receive inconsistent, unverifiable interview feedback.', 'b'),
        ('Reviewers — make final calls with no audit trail of how AI reached them.', 'b'),
        ('Candidates — personal data is often pasted wholesale into external AI tools.', 'b'),
        ('Why this topic', 'h'),
        ('Hiring quality and compliance pressure demand evidence, consistency, and privacy — '
         'agentic AI can deliver all three while humans keep the final decision.', 'p'),
    ])
    add_text(s, 6.9, 1.75, 6.0, 4.6, [
        ('Problem statement', 'h'),
        ('Resume screening and interview evaluation are slow, subjective, and hard to audit. '
         'Keyword filters miss qualified candidates; generic AI tools produce ungrounded claims '
         'and leak candidate PII to model providers.', 'p'),
        ('Pain points today', 'h'),
        ('Manual JD and resume reading does not scale and varies by reviewer.', 'b'),
        ('Keyword matching cannot weigh requirement importance or cite evidence.', 'b'),
        ('Interview feedback is unstructured — quotes, signals, and flags are lost.', 'b'),
        ('Existing AI features are black boxes: no provenance, no reviewability.', 'b'),
    ])

    # ---------- Slide 4: Project Objectives ----------
    s = slides[3]
    remove_note_boxes(s)
    tf = shape_by_name(s, 'TextBox 3').text_frame
    tf.clear()
    objectives = [
        'Automate structured extraction of weighted job requirements and anonymised candidate '
        'profiles, filtering PII before any content reaches a model provider.',
        'Generate evidence-grounded match analyses and tailored interview plans using '
        'intent-driven Agentic RAG over a privacy-filtered case knowledge base.',
        'Evaluate interview transcripts with quote-grounded scoring and case-grounded '
        'red-flag detection, keeping a human reviewer in control of every outcome.',
        'Reduce screening and evaluation effort per candidate while improving consistency, '
        'auditability, and reviewer trust in AI recommendations.',
    ]
    for i, text in enumerate(objectives):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        run = para.add_run()
        run.text = f'{i + 1}.  {text}'
        run.font.size = Pt(14)
        run.font.color.rgb = RGBColor(0, 0, 0)
        para.space_after = Pt(12)

    # ---------- Slide 5: Current Vs Proposed Approach ----------
    s = slides[4]
    set_shape_text(shape_by_name(s, 'TextBox 6'),
                   'The manual pipeline vs. the HireLens agentic workflow.')
    remove_note_boxes(s)
    add_text(s, 0.6, 1.8, 5.7, 4.4, [
        ('Current approach', 'h'),
        ('Recruiter reads each JD and resume by hand.', 'b'),
        ('Keyword search and gut feel decide shortlists.', 'b'),
        ('Interviews produce free-text notes; no scoring rubric.', 'b'),
        ('Flags and inconsistencies surface only if a human spots them.', 'b'),
        ('No memory — every requisition starts from zero.', 'b'),
        ('PII pasted into generic AI chat tools for summaries.', 'b'),
    ])
    add_text(s, 6.5, 1.8, 0.5, 0.5, [('→', 'h')])
    add_text(s, 7.0, 1.8, 5.8, 4.4, [
        ('Proposed: HireLens agentic workflow', 'h'),
        ('JD and Resume Agents extract weighted, structured profiles.', 'b'),
        ('Evidence match score: deterministic coverage anchored, LLM-reasoned.', 'b'),
        ('Transcript evaluation scores technical + communication with direct quotes.', 'b'),
        ('Red Flag Agent only flags when a quote AND a retrieved case support it.', 'b'),
        ('Reviewer decisions and verified gaps feed memory and RAG precedent.', 'b'),
        ('Central PII filter strips identity before any model call or embedding.', 'b'),
    ])

    # ---------- Slide 6: System Architecture (TRIGGER→OBSERVE) ----------
    s = slides[5]
    set_shape_text(shape_by_name(s, 'TextBox 6'),
                   'End-to-end HireLens pipeline — one candidate evaluation lifecycle.')
    remove_note_boxes(s)
    set_shape_text(shape_by_name(s, 'Text 7'), 'HireLens — Candidate Analysis & Transcript Review')
    set_shape_text(shape_by_name(s, 'Text 12'),
                   'Recruiter uploads a JD, resume, or interview transcript in the app.')
    set_shape_text(shape_by_name(s, 'Text 18'),
                   'Structured extraction of requirements and anonymised profile; '
                   'privacy-filtered embeddings and historical cases retrieved via pgvector.')
    set_shape_text(shape_by_name(s, 'Text 24'),
                   'Supervisor routes depth; Evidence Retrieval plans 2–4 semantic queries; '
                   'Gap Analysis reconciles LLM judgment with a deterministic coverage anchor.')
    set_shape_text(shape_by_name(s, 'Text 30'),
                   'Persist match analysis, question sets, evaluations, red flags; '
                   'index verified outcomes; assemble the reviewer decision packet.')
    set_shape_text(shape_by_name(s, 'Text 36'),
                   'Validators check every quote and case ID; reflexion retries failures; '
                   'human review decides; overrides and verified gaps feed memory and RAG.')

    # ---------- Slide 7: Agentic Workflow ----------
    s = slides[6]
    remove_note_boxes(s)
    set_shape_text(shape_by_name(s, 'Text 11'),
                   'JD, resume, and transcript uploads; deterministic parsing, PII redaction, '
                   'and privacy-filtered vector indexing.')
    set_shape_text(shape_by_name(s, 'Text 16'),
                   'Supervisor picks minimal/standard/deep depth; a retrieval planner resolves '
                   'intent into semantic queries; agents reason over deduplicated cases.')
    set_shape_text(shape_by_name(s, 'Text 21'),
                   'Agents write match analyses, question sets, transcript evaluations, red flags, '
                   'and decision packets to Postgres; verified results index back into pgvector.')
    set_shape_text(shape_by_name(s, 'Text 26'),
                   'Mechanical validators verify quotes and case IDs; reflexion retries invalid '
                   'output; humans approve decisions; feedback becomes calibration memory.')
    # Gray out RL — not used by HireLens.
    rl = shape_by_name(s, 'Text 47')
    for para in rl.text_frame.paragraphs:
        for run in para.runs:
            run.font.color.rgb = RGBColor(0xB0, 0xB0, 0xB0)

    # ---------- Slide 8: Implementation and Demo ----------
    s = slides[7]
    set_shape_text(shape_by_name(s, 'TextBox 6'),
                   'Live walkthrough of the working application.')
    remove_note_boxes(s)
    add_text(s, 0.5, 1.75, 12.3, 4.6, [
        ('Demo flow', 'h'),
        ('Dashboard — open/closed positions, expandable candidate rows, pipeline stats.', 'b'),
        ('Job intake — JD Agent extracts weighted requirements; candidate added via job picker.', 'b'),
        ('Candidate analysis — evidence match score, gaps, peer context, generated questions.', 'b'),
        ('Transcript review — evaluation scores with quotes; red flags grounded in retrieved cases.', 'b'),
        ('Under the Hood (Demo mode) — live agent runs, workflow path, prompt overrides.', 'b'),
        ('Settings → Tokens usage — per-agent and per-candidate token and cost metrics.', 'b'),
        ('Human review — decision packet, overrides, and expert-verified gap capture.', 'b'),
    ])

    # ---------- Slide 9: Testing and Validation ----------
    s = slides[8]
    set_shape_text(shape_by_name(s, 'TextBox 6'),
                   'Use cases, edge cases, and validation metrics. Values are design targets '
                   'from pilot runs, not production measurements.')
    remove_note_boxes(s)
    metrics = {
        'Text 17': 'Screening time per candidate',
        'Text 19': '~20–30 min manual',
        'Text 21': '~2–3 min automated',
        'Text 23': '~85–90% faster',
        'Text 25': 'Interview evaluation turnaround',
        'Text 27': 'Hours to days',
        'Text 29': 'Minutes after upload',
        'Text 31': 'Near real-time',
        'Text 33': 'Ungrounded AI claims in flags',
        'Text 35': 'Uncontrolled',
        'Text 37': 'Quote + case ID required',
        'Text 39': '100% mechanically checked',
        'Text 41': 'Candidate PII sent to models',
        'Text 43': 'Full documents',
        'Text 45': 'Filtered at boundary',
        'Text 47': '0 PII by design',
        'Text 49': 'Reviewer effort per decision',
        'Text 51': 'Assemble manually',
        'Text 53': 'Pre-built packet',
        'Text 55': 'Single review step',
    }
    for name, text in metrics.items():
        set_shape_text(shape_by_name(s, name), text)

    # ---------- Slide 10: Analysis and Results ----------
    s = slides[9]
    set_shape_text(shape_by_name(s, 'TextBox 6'),
                   'What we validated, what the evidence shows, and how feedback loops back.')
    remove_note_boxes(s)
    add_text(s, 0.5, 1.75, 12.3, 4.6, [
        ('Validation coverage', 'h'),
        ('Schema validation on every structured output; quote verification against source '
         'documents; retrieved case IDs checked against what was actually fetched.', 'b'),
        ('Reflexion loops recover invalid outputs; systematic failures are written to shared '
         'agent memory as bias warnings.', 'b'),
        ('Edge cases exercised: missing sections, weak resumes, contradictory transcripts, '
         'duplicate skill phrasing, PII-heavy documents.', 'b'),
        ('Results', 'h'),
        ('Deterministic coverage anchor keeps LLM scores within a fixed tolerance, preventing '
         'score drift between runs.', 'b'),
        ('Red flags without both a direct quote and a retrieved case ID are rejected by '
         'validators — no unsupported claims reach reviewers.', 'b'),
        ('Expert-verified gaps become embedded precedent, measurably improving subsequent '
         'retrieval relevance.', 'b'),
    ])

    # ---------- Slide 11: Suggestions and Conclusions ----------
    s = slides[10]
    set_shape_text(shape_by_name(s, 'TextBox 4'), 'Insights  |  Next steps  |  Future scope')
    remove_note_boxes(s)
    add_text(s, 0.5, 1.75, 6.0, 4.6, [
        ('Insights', 'h'),
        ('Grounding AI claims in quotes and retrieved cases is what makes reviewers trust '
         'the system.', 'b'),
        ('A deterministic anchor plus LLM reasoning beats either approach alone.', 'b'),
        ('Privacy filtering at a central boundary is simpler to audit than per-agent rules.', 'b'),
        ('Observability (run history, workflow path, token metrics) turned AI behavior into '
         'something recruiters can inspect and correct.', 'b'),
    ])
    add_text(s, 6.9, 1.75, 6.0, 4.6, [
        ('Next steps & future scope', 'h'),
        ('Calendar and ATS integrations for end-to-end pipeline coverage.', 'b'),
        ('Calibration analytics: track override rates per agent to tune prompts and thresholds.', 'b'),
        ('Richer knowledge base: outcome data (hired/not) as retrieval precedent.', 'b'),
        ('Role-based access and per-team workspaces on top of the shared model.', 'b'),
    ])

    # ---------- Slide 12: Annexure ----------
    s = slides[11]
    set_shape_text(shape_by_name(s, 'TextBox 4'),
                   'References | Codebase | Documentation')
    remove_note_boxes(s)
    add_text(s, 0.5, 1.75, 12.3, 4.6, [
        ('Codebase & artefacts', 'h'),
        ('HireLens application — Next.js 16, React 19, LangChain/LangGraph, Supabase + pgvector, '
         'OpenAI chat and embedding models.', 'b'),
        ('Project documentation — PRD, multi-agent architecture notes, token usage optimisation '
         'plan, knowledge-base usage guide (documentation/ folder).', 'b'),
        ('References', 'h'),
        ('LangGraph and LangChain documentation — agent orchestration and structured output.', 'b'),
        ('OpenAI API documentation — chat models, embeddings, structured outputs.', 'b'),
        ('Supabase documentation — Postgres, pgvector similarity search, Auth with RLS.', 'b'),
    ])

    # ---------- Slide 13: Closing ----------
    s = slides[12]
    add_text(s, 0.5, 3.0, 12.3, 1.2, [
        ('Thank you — questions welcome', 'h'),
        ('HireLens: privacy-aware, evidence-grounded agentic recruitment intelligence.', 'p'),
    ])

    prs.save(str(OUT))
    print(f'Saved: {OUT}')


if __name__ == '__main__':
    main()
