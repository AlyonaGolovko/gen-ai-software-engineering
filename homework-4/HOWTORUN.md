# How to Run — Homework 4

This document covers how to run the sample app, the tests, and the full
six-agent pipeline.

---

## 1. Prerequisites

- **Node.js 18+** (the tests use the built-in `node:test` runner and
  `node:assert/strict`).
- **Claude Code CLI** installed and authenticated.
  - Verify with `claude --version` and `claude /login` if you have not signed in.
- Run all commands from the `homework-4/` directory.

No third-party npm dependencies are required for the app itself.

---

## 2. Run the App

```bash
npm start
```

This executes `node src/index.js` — a tiny demo that exercises `applyCoupon`,
`cartTotal`, and `verifyToken`.

---

## 3. Run the Tests

```bash
npm test
```

This runs `node --test`, which auto-discovers every `*.test.js` file under the
project. Expected after a pipeline run: **24 pass / 0 fail**.

---

## 4. Run the Full Pipeline (one command)

```bash
npm run pipeline
```

…which is equivalent to:

```bash
bash run-pipeline.sh          # uses default bug id "001"
bash run-pipeline.sh 002      # for a different bug id, if you add one
```

### What the script does

1. **Installs agents & skills** into `.claude/` so the Claude CLI can discover
   them:
   - copies every `agents/*.agent.md` into `.claude/agents/`
   - rewrites every `skills/*.md` as `.claude/skills/<name>/SKILL.md`
2. **Runs the six phases in order**, each as a separate `claude -p` call:
   1. **Bug Researcher** → writes `context/bugs/$BUG/research/codebase-research.md`
   2. **Research Verifier** → writes `context/bugs/$BUG/research/verified-research.md`
   3. **Bug Planner** → writes `context/bugs/$BUG/implementation-plan.md`
   4. **Bug Fixer** → edits files in `src/`, runs `npm test`, writes `context/bugs/$BUG/fix-summary.md`
   5. **Security Verifier** → writes `context/bugs/$BUG/security-report.md`
   6. **Unit Test Generator** → creates tests under `tests/`, runs `npm test`, writes `context/bugs/$BUG/test-report.md`
3. **Echoes** where the outputs landed at the end.

Each phase is invoked with:

```text
--permission-mode acceptEdits --allowedTools Read,Edit,Write,Grep,Glob,Bash
```

If a phase ever hangs on a permission prompt, you can temporarily switch the
`PERM` variable in `run-pipeline.sh` to `--dangerously-skip-permissions` — but
only on a throwaway/local repo. It bypasses all permission checks.

---

## 5. Where Outputs Land

After a successful run, look under `context/bugs/001/`:

```
context/bugs/001/
├── bug-context.md                  ← input (the bug you fed in)
├── research/
│   ├── codebase-research.md        ← phase 1
│   └── verified-research.md        ← phase 2 (with quality rating)
├── implementation-plan.md          ← phase 3
├── fix-summary.md                  ← phase 4 (also: real edits in src/)
├── security-report.md              ← phase 5
└── test-report.md                  ← phase 6 (also: real tests in tests/)
```

---

## 6. Before / After Expectations

Use these to confirm the pipeline actually changed behaviour:

| Check                                     | Before pipeline                                | After pipeline                         |
| ----------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| `applyCoupon(100, "SAVE10")` formatted    | `$15.00` (wrong — used raw percent)            | `$23.50`\* (correct — 10% off applied) |
| `cartTotal` over a 3-item cart, formatted | `-$135.00` (wrong — off-by-one + bad discount) | `$21.15`\* (correct)                   |
| Test suite                                | **1 passing** (baseline only)                  | **24 passing / 0 failing**             |
| `require('./src/auth').API_KEY`           | the secret string                              | `undefined` (no longer exported)       |
| `verifyToken(0)`                          | truthy (loose `==` bypass)                     | `false` (strict `===`)                 |

\* The exact formatted values come from the demo flow in `src/index.js` —
verify by running `npm start` before and after the pipeline.

To re-run safely, you can blow away the artifact directory and start fresh:

```bash
rm -rf context/bugs/001/research context/bugs/001/fix-summary.md \
       context/bugs/001/implementation-plan.md \
       context/bugs/001/security-report.md \
       context/bugs/001/test-report.md
rm -f tests/store.bug001.test.js tests/auth.bug001.test.js
git checkout -- src/   # revert the seeded bugs
npm run pipeline
```

---

## 7. Troubleshooting

- **`claude: command not found`** — install/sign in to the Claude Code CLI.
- **A phase hangs waiting for permission** — temporarily switch `PERM` in
  `run-pipeline.sh` to `--dangerously-skip-permissions` (local repo only).
- **Tests fail after phase 4** — read `context/bugs/001/fix-summary.md`; the
  Bug Fixer is required to stop and document on failure rather than improvise.
- **`.claude/` looks stale** — it is regenerated on every pipeline run; safe
  to delete.
