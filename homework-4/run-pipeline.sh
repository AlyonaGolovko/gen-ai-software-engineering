#!/usr/bin/env bash
set -euo pipefail

BUG=${1:-001}

# If a phase hangs on a permission prompt, switch PERM to:
#   '--dangerously-skip-permissions'
# (Only do this on a throwaway/local repo — it bypasses ALL permission checks.)
PERM='--permission-mode acceptEdits --allowedTools Read,Edit,Write,Grep,Glob,Bash'

echo "=== Installing agents and skills into .claude/ ==="

mkdir -p .claude/agents
for f in agents/*.agent.md; do
  base=$(basename "$f")
  cp "$f" ".claude/agents/$base"
  echo "  installed agent: .claude/agents/$base"
done

mkdir -p .claude/skills
for f in skills/*.md; do
  name=$(basename "$f" .md)
  mkdir -p ".claude/skills/$name"
  cp "$f" ".claude/skills/$name/SKILL.md"
  echo "  installed skill: .claude/skills/$name/SKILL.md"
done

echo
echo "=== Phase 1: Bug Researcher ==="
claude -p "Use the bug-researcher subagent for bug $BUG. You MUST write its full findings to context/bugs/$BUG/research/codebase-research.md. Create directories if needed. Do not just summarize in chat — the file must exist on disk when you finish." $PERM

echo
echo "=== Phase 2: Bug Research Verifier ==="
claude -p "Use the research-verifier subagent for bug $BUG. It MUST read context/bugs/$BUG/research/codebase-research.md and write context/bugs/$BUG/research/verified-research.md to disk. The output file must exist when you finish." $PERM

echo
echo "=== Phase 3: Bug Planner ==="
claude -p "Use the bug-planner subagent for bug $BUG. It MUST read context/bugs/$BUG/research/verified-research.md and write context/bugs/$BUG/implementation-plan.md to disk. The output file must exist when you finish." $PERM

echo
echo "=== Phase 4: Bug Fixer ==="
claude -p "Use the bug-fixer subagent for bug $BUG. It MUST read context/bugs/$BUG/implementation-plan.md, APPLY the code changes to the files in src/, run npm test, and write context/bugs/$BUG/fix-summary.md to disk. Actually edit the source files." $PERM

echo
echo "=== Phase 5: Security Verifier ==="
claude -p "Use the security-verifier subagent for bug $BUG. It MUST read context/bugs/$BUG/fix-summary.md and the changed files, then write context/bugs/$BUG/security-report.md to disk." $PERM

echo
echo "=== Phase 6: Unit Test Generator ==="
claude -p "Use the unit-test-generator subagent for bug $BUG. It MUST read context/bugs/$BUG/fix-summary.md, create test files under tests/, run npm test, and write context/bugs/$BUG/test-report.md to disk." $PERM

echo
echo "Pipeline complete. Outputs are under: context/bugs/$BUG/"
