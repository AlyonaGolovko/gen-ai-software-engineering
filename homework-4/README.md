# Homework 4 — 4-Agent Bug-Fixing Pipeline

> **Student Name**: Alona Holovko
> **Date Submitted**: 2026-06-10
> **AI Tools Used**: Claude Code (multi-model: Claude Opus + Claude Sonnet)

---

## 📋 Overview

This homework builds a **single-command, six-agent bug-fixing pipeline** on top of
Claude Code subagents and skills. The pipeline operates on a small Node.js demo
app (`src/`) that ships with intentionally seeded bugs and a security issue. One
command — `npm run pipeline` — invokes all six agents in the correct order,
auto-loads their skills, and produces a full paper trail of artifacts under
`context/bugs/001/`.

The pipeline mixes **two Claude models** by role: **Opus** for careful
reasoning/verification work (research verification, planning, security review)
and **Sonnet** for execution work (research, code edits, test scaffolding). This
"Architect / Editor" split keeps the slow, expensive thinking where it pays off
and the fast model where the work is mechanical.

---

## 🔁 The Pipeline

**Run order** (each phase is a separate `claude -p` call from `run-pipeline.sh`):

| #   | Agent                 | Produces                                              |
| --- | --------------------- | ----------------------------------------------------- |
| 1   | Bug Researcher        | `context/bugs/001/research/codebase-research.md`      |
| 2   | Bug Research Verifier | `context/bugs/001/research/verified-research.md`      |
| 3   | Bug Planner           | `context/bugs/001/implementation-plan.md`             |
| 4   | Bug Fixer             | edits in `src/` + `context/bugs/001/fix-summary.md`   |
| 5   | Security Verifier     | `context/bugs/001/security-report.md`                 |
| 6   | Unit Test Generator   | tests in `tests/` + `context/bugs/001/test-report.md` |

Each downstream agent reads the previous agent's artifact, so the chain is
strictly file-mediated — no hidden conversational state between phases.

---

## 🤖 Agents & Model Choices

| Agent                 | Model  | Why this model                                                                                          |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| `bug-researcher`      | Sonnet | Mechanical evidence gathering (grep, read, record file:line) — speed matters more than deep reasoning.  |
| `research-verifier`   | Opus   | Adversarial fact-checking of every reference; quality is the whole point of this step.                  |
| `bug-planner`         | Opus   | Architect role — decides the fix shape and writes the before/after plan; reasoning errors here cascade. |
| `bug-fixer`           | Sonnet | Executes the plan verbatim — no design judgement required. Fast and cheap is correct here.              |
| `security-verifier`   | Opus   | Threat modelling, severity rating, remediation framing — high-reasoning work on sensitive code.         |
| `unit-test-generator` | Sonnet | Generates straightforward unit tests following the FIRST skill; pattern-following, not reasoning.       |

Each agent's `model:` is declared in its frontmatter under `agents/*.agent.md`.

---

## 🧩 Skills

| Skill                                    | Used by               | Purpose                                                                                                             |
| ---------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `skills/research-quality-measurement.md` | `research-verifier`   | Defines the levels/labels used when rating research quality in `verified-research.md`.                              |
| `skills/unit-tests-FIRST.md`             | `unit-test-generator` | Defines FIRST (Fast, Independent, Repeatable, Self-validating, Timely); every generated test is checked against it. |

Skills are installed into `.claude/skills/<name>/SKILL.md` by `run-pipeline.sh`
so the CLI auto-discovers them at run time.

---

## ✅ Results (real numbers from `context/bugs/001/`)

**Bugs fixed by the pipeline** (see `fix-summary.md`):

| #   | File              | Bug                                                                      | Effect                                                       |
| --- | ----------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| 1   | `src/store.js:18` | `applyCoupon` multiplied price by raw percent instead of `percent / 100` | `applyCoupon(100, "SAVE10")` now returns `90` (was `-900`)   |
| 2   | `src/store.js:29` | `cartTotal` loop bound was `i < items.length - 1` (skipped last item)    | `cartTotal` of 3 items now returns `60` (was `30`)           |
| 3   | `src/auth.js:11`  | `verifyToken` used loose `==` (type-coercion bypass)                     | Strict `===`; `verifyToken(0)` now correctly returns `false` |
| 4   | `src/auth.js:23`  | `API_KEY` was exported from the module                                   | `API_KEY` no longer in `module.exports`                      |

**Security findings** (see `security-report.md`, overall risk **MEDIUM**):

- **HIGH** — Hardcoded credential literal in `src/auth.js:3` (placeholder, but
  still a hardcoded-secret anti-pattern; remediation: env var + secret manager).
- **MEDIUM** — Non-constant-time token comparison in `verifyToken`; remediate
  with `crypto.timingSafeEqual`.
- **LOW** — Missing `typeof` guard in `verifyToken`.
- **INFO** — No input validation on `applyCoupon` (`price`, `code`).

**Tests generated** (see `test-report.md`):

- Pre-pipeline: **1** passing baseline test (`tests/store.test.js`).
- Post-pipeline: **24 passing / 0 failing** (`tests/store.bug001.test.js` +
  `tests/auth.bug001.test.js` + the retained baseline).
- All generated tests verified against the FIRST skill — full suite runs in ~400 ms.

---

## ▶️ How to Run

See **[HOWTORUN.md](./HOWTORUN.md)** for the full run guide.

Quick start:

```bash
npm install            # (no runtime deps; sets up node_modules dir)
npm test               # run baseline + generated tests
npm run pipeline       # run the full 6-agent pipeline
```

---

## 📁 Project Structure

```
homework-4/
├── README.md                ← this file
├── HOWTORUN.md              ← run instructions
├── TASKS.md                 ← assignment spec
├── package.json             ← exposes "pipeline" script
├── run-pipeline.sh          ← single-command pipeline driver
│
├── agents/                  ← 6 subagent definitions (model in frontmatter)
│   ├── bug-researcher.agent.md
│   ├── research-verifier.agent.md
│   ├── bug-planner.agent.md
│   ├── bug-fixer.agent.md
│   ├── security-verifier.agent.md
│   └── unit-test-generator.agent.md
│
├── skills/                  ← skills loaded by the pipeline
│   ├── research-quality-measurement.md
│   └── unit-tests-FIRST.md
│
├── src/                     ← sample mini-app (operated on by the pipeline)
│   ├── index.js
│   ├── store.js
│   └── auth.js
│
├── tests/                   ← baseline + agent-generated unit tests
│   ├── store.test.js            (baseline, kept)
│   ├── store.bug001.test.js     (generated by unit-test-generator)
│   └── auth.bug001.test.js      (generated by unit-test-generator)
│
├── context/bugs/001/        ← artifact trail from the pipeline run
│   ├── bug-context.md
│   ├── research/
│   │   ├── codebase-research.md
│   │   └── verified-research.md
│   ├── implementation-plan.md
│   ├── fix-summary.md
│   ├── security-report.md
│   └── test-report.md
│
├── docs/screenshots/        ← submission screenshots
│
└── .claude/                 ← generated by run-pipeline.sh (gitignored)
    ├── agents/                  ← copies of agents/ so the CLI can discover them
    └── skills/<name>/SKILL.md   ← skills rewrapped for the CLI loader
```

---

## 🛠 AI Tools Used

- **Claude Code (CLI)** — orchestrated all six subagents via `claude -p` with
  scoped permissions (`--permission-mode acceptEdits --allowedTools ...`).
- **Claude Opus 4.x** — used for the three reasoning-heavy roles:
  research-verifier, bug-planner, security-verifier. Example: producing the
  HIGH/MEDIUM/LOW/INFO ratings in `security-report.md` with concrete
  remediation snippets (e.g. `crypto.timingSafeEqual`).
- **Claude Sonnet 4.x** — used for the three execution-heavy roles:
  bug-researcher, bug-fixer, unit-test-generator. Example: applying the four
  edits verbatim from the plan and running `npm test` after each change.
- **Skills** — `research-quality-measurement` and `unit-tests-FIRST` were
  authored once and reused across runs; the verifier and the test generator
  both reference them explicitly in their output.

---

<div align="center">

**AI-Assisted Development Course** · Homework 4

</div>
