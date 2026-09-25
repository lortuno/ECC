# Commands Quick Reference

> 68 slash commands installed globally. Type `/` in any Claude Code session to invoke.

---

## Core Workflow

| Command | What it does |
|---------|-------------|
| `/plan` | Restate requirements, assess risks, write step-by-step implementation plan — **waits for your confirm before touching code** |
| `/feature-dev` | Guided feature development with codebase understanding and architecture focus |
| `/code-review` | Code review — local uncommitted changes or GitHub PR (pass PR number/URL for PR mode) |
| `/review-pr` | Comprehensive PR review using specialized agents |
| `/build-fix` | Detect and fix build errors — delegates to the right build-resolver agent automatically |
| `/quality-gate` | Run the ECC formatter quality gate for a single file and report remediation steps |

---

## Testing

| Command | What it does |
|---------|-------------|
| `/test-coverage` | Analyze coverage, identify gaps, and generate missing tests toward the target threshold |
| `/react-test` | TDD for React (React Testing Library, Vitest or Jest, coverage targets) |

---

## Code Review

| Command | What it does |
|---------|-------------|
| `/code-review` | Code review — local uncommitted changes or GitHub PR (pass PR number/URL for PR mode) |
| `/react-review` | React/JSX — hook correctness, render performance, server/client boundaries, accessibility (runs alongside the TypeScript reviewer on TSX/JSX changes) |

---

## Build Fixers

| Command | What it does |
|---------|-------------|
| `/build-fix` | Detect and fix build errors — delegates to the right build-resolver agent automatically |
| `/react-build` | Fix React build failures (Vite, webpack, Next.js, CRA, Parcel, esbuild, Bun) |

---

## Orchestrated Feature Workflows

| Command | What it does |
|---------|-------------|
| `/orch-add-feature` | Build a brand-new feature end to end — research, plan, TDD, review, gated commit |
| `/orch-build-mvp` | Bootstrap a working MVP from a design/spec doc — ingest, slice, scaffold, TDD, review, gated commit |
| `/orch-change-feature` | Alter an existing feature to new desired behavior — update tests to the new spec, change impl, review, gated commit |
| `/orch-fix-defect` | Fix a bug — reproduce it as a failing regression test, fix to green, review, gated commit |
| `/orch-refine-code` | Behavior-preserving refactor — confirm tests green, restructure, keep green, review, gated commit |
| `/orch-review` | Run the orch-review native Workflow over a diff (local changes or a GitHub PR) and report blocking vs advisory findings |

---

## PRP Workflow

| Command | What it does |
|---------|-------------|
| `/prp-prd` | Interactive PRD generator — problem-first, hypothesis-driven, back-and-forth questioning |
| `/prp-plan` | Create a comprehensive feature implementation plan with codebase analysis and pattern extraction |
| `/prp-implement` | Execute an implementation plan with rigorous validation loops |
| `/prp-commit` | Quick commit with natural language file targeting |
| `/prp-pr` | Alias of `/pr` for the PRP workflow series |

---

## Epic Coordination (GitHub-native)

| Command | What it does |
|---------|-------------|
| `/epic-decompose` | Break an epic into task children without creating task branches |
| `/epic-validate` | Validate epic readiness, dependencies, and coordination policy |
| `/epic-claim` | Claim an epic issue, stamp coordination state, and sync local ownership |
| `/epic-sync` | Sync epic issue bodies, labels, and local coordination snapshots from GitHub |
| `/epic-review` | Mark epic review requested, approved, or changes requested |
| `/epic-publish` | Publish a validated epic update back to the issue and local cache |
| `/epic-unblock` | Sweep blocked epic issues and reopen anything whose dependencies are closed |

---

## Planning & Architecture

| Command | What it does |
|---------|-------------|
| `/plan` | Restate requirements, assess risks, write step-by-step implementation plan — **waits for your confirm before touching code** |
| `/multi-plan` | Create a multi-model implementation plan without modifying production code |
| `/multi-workflow` | Run a full multi-model development workflow with research, planning, execution, optimization, and review |
| `/multi-backend` | Run a backend-focused multi-model workflow for APIs, algorithms, data, and business logic |
| `/multi-frontend` | Run a frontend-focused multi-model workflow for components, layouts, animation, and UI polish |
| `/multi-execute` | Execute a multi-model implementation plan while preserving Claude as the only filesystem writer |

---

## Session Management

| Command | What it does |
|---------|-------------|
| `/save-session` | Save current session state to `~/.claude/session-data/` |
| `/resume-session` | Load the most recent saved session from the canonical session store and resume from where you left off |
| `/sessions` | Browse, search, and manage session history with aliases from `~/.claude/session-data/` (with legacy reads from `~/.claude/sessions/`) |
| `/checkpoint` | Create, verify, or list workflow checkpoints after running verification checks |
| `/aside` | Answer a quick side question without losing current task context |

---

## Cross-Harness Memory CLI

These are `ecc` CLI commands, not slash commands. They back the `unified-memory`
skill with one inspectable Markdown vault.

| Command | What it does |
|---------|-------------|
| `ecc memory init` | Create project, team, or user vault directories |
| `ecc memory save` | Create an unreviewed context, decision, fact, lesson, note, preference, or runbook |
| `ecc memory handoff` | Transfer bounded work state from one harness to another |
| `ecc memory search` | Search memories by text, scope, kind, or target harness |
| `ecc memory read` | Read a memory and its backlinks by stable ID |
| `ecc memory doctor` | Report malformed files, duplicate IDs, broken links, and skipped symlinks |
| `ecc-memory-mcp` | Start the optional local stdio MCP server |

Pass memory bodies with `--stdin` or `--body-file`; they are intentionally not
accepted as command-line values. Recalled memories are untrusted context, not
executable instructions or policy.

---

## Install Health & Feedback CLI

These lifecycle commands are also available through the `ecc` CLI.

| Command | What it does |
|---------|-------------|
| `ecc list-installed` | Show installs recorded in ECC's managed state |
| `ecc doctor` | Diagnose missing or drifted managed files and point failures to the short problem form |
| `ecc repair` | Restore missing or drifted managed files |
| `ecc uninstall` | Remove only install-state-managed files and optionally show the 20-second exit-feedback route |
| `ecc feedback` | Show the public problem, quick-feedback, and feature routes without reading files or uploading diagnostics |

---

## Learning & Improvement

| Command | What it does |
|---------|-------------|
| `/learn` | Extract reusable patterns from the current session |
| `/learn-eval` | Extract patterns + self-evaluate quality before saving |
| `/evolve` | Analyse learned instincts, suggest evolved skill structures |
| `/promote` | Promote project-scoped instincts to global scope |
| `/prune` | Delete pending instincts older than 30 days that were never promoted |
| `/instinct-status` | Show all learned instincts (project + global) with confidence scores |
| `/instinct-export` | Export instincts to a file |
| `/instinct-import` | Import instincts from a file or URL |
| `/skill-create` | Analyse local git history → generate a reusable skill |
| `/skill-health` | Skill portfolio health dashboard with analytics |

---

## Refactoring & Cleanup

| Command | What it does |
|---------|-------------|
| `/refactor-clean` | Safely identify and remove dead code with verification after each change |

---

## Docs & Research

| Command | What it does |
|---------|-------------|
| `/ecc-guide` | Navigate ECC's current agents, skills, commands, hooks, install profiles, and docs from the live repository surface |
| `/update-docs` | Sync documentation from source-of-truth files such as scripts, schemas, routes, and exports |
| `/update-codemaps` | Regenerate codemaps for the codebase |

---

## Loops & Automation

| Command | What it does |
|---------|-------------|
| `/loop-start` | Start a managed autonomous loop pattern with safety defaults and explicit stop conditions |
| `/loop-status` | Inspect active loop state, progress, failure signals, and recommended intervention |

---

## Project & Infrastructure

| Command | What it does |
|---------|-------------|
| `/projects` | List known projects and their instinct statistics |
| `/project-init` | Detect a project's stack and produce a dry-run ECC onboarding plan |
| `/harness-audit` | Audit the agent harness configuration for reliability and cost |
| `/model-route` | Route a task to the right model (Haiku / Sonnet / Opus) |
| `/setup-pm` | Configure package manager (npm / pnpm / yarn / bun) |
| `/auto-update` | Pull the latest ECC repo changes and reinstall the current managed targets |
| `/cost-report` | Generate a local Claude Code cost report from the ECC cost-tracker metrics log |
| `/security-scan` | Run AgentShield against agent, hook, MCP, permission, and secret surfaces |
| `/jira` | Retrieve a Jira ticket, analyze requirements, update status, or add comments |
| `/pr` | Create a GitHub PR from current branch with unpushed commits |
| `/hookify` | Create hooks to prevent unwanted behaviors from conversation analysis or explicit instructions |
| `/hookify-configure` | Enable or disable hookify rules interactively |
| `/hookify-list` | List all configured hookify rules |
| `/hookify-help` | Get help with the hookify system |

---

## Retired Commands

These slash commands were retired in favor of skills — invoke the skill directly instead:

| Retired command | Use this skill instead |
|---|---|
| `/tdd` | `tdd-workflow` |
| `/eval` | `eval-harness` |
| `/verify` | `verification-loop` |
| `/e2e` | `e2e-testing` |
| `/docs` | `documentation-lookup` |
| `/context-budget` | `context-budget` |
| `/prompt-optimize` | `prompt-optimizer` |
| `/rules-distill` | `rules-distill` |
| `/agent-sort` | `agent-sort` |

---

## Quick Decision Guide

```
Starting a new feature?         → /plan first, then TDD via the tdd-workflow skill
Code just written?              → /code-review
Build broken?                   → /build-fix
Need live docs?                 → the documentation-lookup skill
Session about to end?           → /save-session or /learn-eval
Resuming next day?              → /resume-session
Context getting heavy?          → the context-budget skill
Want to extract what you learned? → /learn-eval then /evolve
Running repeated tasks?         → /loop-start
```