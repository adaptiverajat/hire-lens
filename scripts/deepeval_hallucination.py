"""Run DeepEval hallucination detection against agent outputs.

Input JSONL records must contain:
  {"id": "...", "input": "...", "actual_output": "...", "context": ["..."]}

The context should be the exact source material supplied to the agent. This
script intentionally runs only DeepEval's HallucinationMetric; it does not
perform retrieval evaluation or use a second fallback judge.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from deepeval.metrics import HallucinationMetric
from deepeval.test_case import LLMTestCase


def load_cases(path: Path) -> list[LLMTestCase]:
    cases: list[LLMTestCase] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            record = json.loads(line)
            context = record.get("context") or record.get("retrieval_context")
            if not isinstance(context, list) or not context:
                raise ValueError("context must be a non-empty JSON array")
            cases.append(
                LLMTestCase(
                    input=str(record.get("input", "")),
                    actual_output=str(record["actual_output"]),
                    context=[str(item) for item in context],
                    name=str(record.get("id", f"case-{line_number}")),
                )
            )
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise ValueError(f"Invalid case on line {line_number}: {error}") from error
    return cases


def main() -> int:
    parser = argparse.ArgumentParser(description="Detect hallucinations with DeepEval only")
    parser.add_argument("input", type=Path, help="Input JSONL file")
    parser.add_argument("--threshold", type=float, default=0.5)
    args = parser.parse_args()

    try:
        cases = load_cases(args.input)
        if not cases:
            raise ValueError("Input file contains no evaluation cases")

        metric = HallucinationMetric(
            threshold=args.threshold,
            include_reason=True,
        )
        for case in cases:
            metric.measure(case)
            score = getattr(metric, "score", None)
            reason = getattr(metric, "reason", None)
            print(
                json.dumps(
                    {
                        "id": getattr(case, "name", None),
                        "metric": "HallucinationMetric",
                        "score": score,
                        "threshold": args.threshold,
                        "passed": score is not None and score <= args.threshold,
                        "reason": reason,
                    },
                    ensure_ascii=True,
                )
            )
        return 0
    except Exception as error:  # DeepEval/provider errors should fail CI clearly.
        print(f"DeepEval hallucination evaluation failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
