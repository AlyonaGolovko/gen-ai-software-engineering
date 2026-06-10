# Research Quality Measurement

**Purpose**: Define the quality levels the Research Verifier uses to rate the Bug Researcher's findings when producing `context/bugs/XXX/research/verified-research.md`.

## Quality Levels

| Level    | Criteria                                                                                                       |
|----------|----------------------------------------------------------------------------------------------------------------|
| **High**   | Every `file:line` reference is correct, all code snippets match the source verbatim, zero discrepancies found. |
| **Medium** | Mostly correct; only minor discrepancies (e.g. off-by-one line numbers, trivial snippet formatting); no wrong conclusions. |
| **Low**    | Several incorrect `file:line` references or unsupported claims; conclusions may still be partially usable but require rework. |
| **Failed** | Research is unreliable — major references wrong, snippets fabricated, or conclusions contradicted by source. Do **not** proceed to planning. |

## How to use this skill

The Research Verifier MUST:

1. Record the chosen quality level in the **Verification Summary** section of `verified-research.md` (e.g. `Research Quality: Medium`).
2. Include a dedicated **Research Quality Assessment** section in `verified-research.md` that states the level plus the reasoning behind it (which checks passed, which discrepancies drove the rating, and whether downstream agents may proceed).
