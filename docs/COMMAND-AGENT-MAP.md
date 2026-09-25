# Command → Agent / Skill Map

This document lists each slash command and the primary agent(s) or skills it invokes, plus notable direct-invoke agents. Use it to discover which commands use which agents and to keep refactoring consistent.

| Command | Primary agent(s) | Notes |
|---------|------------------|--------|
| `/plan` | planner | Implementation planning before code |
| `/feature-dev` | architect, planner | Guided feature development with codebase understanding |
| `/code-review` | code-reviewer | Quality and security review |
| `/review-pr` | code-reviewer, security-reviewer, pr-test-analyzer | Comprehensive PR review using specialized agents |
| `/build-fix` | build-error-resolver | Fix build/type errors |
| `/react-build` | react-build-resolver | Fix React build failures |
| `/react-review` | react-reviewer, typescript-reviewer | React/JSX review (TS reviewer runs alongside on TSX/JSX) |
| `/react-test` | tdd-guide | React TDD workflow |
| `/refactor-clean` | refactor-cleaner | Dead code removal |
| `/update-docs` | doc-updater | Documentation sync |
| `/update-codemaps` | doc-updater | Codemaps / architecture docs |
| `/test-coverage` | pr-test-analyzer | Coverage gap analysis and test generation |
| `/harness-audit` | harness-optimizer | Harness scorecard |
| `/loop-start` | loop-operator | Start autonomous loop |
| `/loop-status` | loop-operator | Inspect loop status |
| `/quality-gate` | — | Quality pipeline (hook-like) |
| `/model-route` | — | Model recommendation (no agent) |
| `/orch-add-feature` | planner, tdd-guide, code-reviewer | Gated Research-Plan-TDD-Review-Commit pipeline |
| `/orch-build-mvp` | planner, tdd-guide, code-reviewer | MVP scaffold from a design/spec doc |
| `/orch-change-feature` | tdd-guide, code-reviewer | Update tests + implementation to new spec |
| `/orch-fix-defect` | tdd-guide, code-reviewer | Reproduce as failing test, fix to green |
| `/orch-refine-code` | code-reviewer | Behavior-preserving refactor |
| `/orch-review` | code-reviewer, security-reviewer | Diff/PR review workflow surface |
| `/multi-plan` | architect | Multi-model planning |
| `/multi-execute` | architect | Multi-model execution |
| `/multi-backend` | architect | Backend multi-model workflow |
| `/multi-frontend` | architect | Frontend multi-model workflow |
| `/multi-workflow` | architect | Full multi-model development workflow |
| `/prp-prd` | — | Interactive PRD generator |
| `/prp-plan` | architect, planner | Implementation plan with pattern extraction |
| `/prp-implement` | tdd-guide | Execute plan with validation loops |
| `/prp-commit` | — | Natural-language commit targeting |
| `/prp-pr` | — | Alias of `/pr` |
| `/pr` | — | Create a GitHub PR from unpushed commits |
| `/epic-claim` | — | Epic coordination (GitHub-native) |
| `/epic-decompose` | — | Epic coordination (GitHub-native) |
| `/epic-publish` | — | Epic coordination (GitHub-native) |
| `/epic-review` | — | Epic coordination (GitHub-native) |
| `/epic-sync` | — | Epic coordination (GitHub-native) |
| `/epic-unblock` | — | Epic coordination (GitHub-native) |
| `/epic-validate` | — | Epic coordination (GitHub-native) |
| `/learn` | — | continuous-learning-v2 skill, instincts |
| `/learn-eval` | — | continuous-learning-v2, evaluate then save |
| `/instinct-status` | — | continuous-learning-v2 |
| `/instinct-import` | — | continuous-learning-v2 |
| `/instinct-export` | — | continuous-learning-v2 |
| `/evolve` | — | continuous-learning-v2, cluster instincts |
| `/promote` | — | continuous-learning-v2 |
| `/prune` | — | continuous-learning-v2 |
| `/projects` | — | continuous-learning-v2 |
| `/project-init` | — | Stack detection, dry-run onboarding plan |
| `/skill-create` | — | skill-create-output script, git history |
| `/skill-health` | — | Skill portfolio health dashboard |
| `/checkpoint` | — | verification-loop skill |
| `/ecc-guide` | — | ecc-guide skill |
| `/cost-report` | — | ECC cost-tracker metrics log |
| `/auto-update` | — | Pull latest ECC changes, reinstall managed targets |
| `/test-coverage` | pr-test-analyzer | Coverage gap analysis |
| `/sessions` | — | Session history |
| `/save-session` / `/resume-session` | — | Session state persistence |
| `/setup-pm` | — | Package manager setup script |
| `/jira` | — | jira-integration skill (MCP or REST) |
| `/aside` | — | Quick side question without losing task context |
| `/hookify` / `/hookify-configure` / `/hookify-list` / `/hookify-help` | conversation-analyzer | Hook creation from conversation analysis |
| `/security-scan` | security-reviewer | AgentShield via security-scan skill |

## Non-Slash CLI Surfaces

| CLI surface | Primary skill/runtime | Notes |
|-------------|-----------------------|-------|
| `ecc memory init` | unified-memory / `scripts/memory.js` | Initialize project, team, or user Markdown vault scopes |
| `ecc memory save` | unified-memory / `scripts/memory.js` | Create unreviewed memory; body must come from stdin or a regular file |
| `ecc memory handoff` | unified-memory / `scripts/memory.js` | Create a targeted, cross-harness handoff |
| `ecc memory search` | unified-memory / `scripts/memory.js` | Bounded lexical search over selected vault scopes |
| `ecc memory read` | unified-memory / `scripts/memory.js` | Read one memory plus derived backlinks |
| `ecc memory doctor` | unified-memory / `scripts/memory.js` | Audit malformed files, duplicate IDs, broken links, and symlinks |
| `ecc-memory-mcp` | unified-memory / `scripts/memory-mcp.mjs` | Optional stdio MCP adapter; exposes save/search/read/doctor only |

## Direct-Use Agents

| Direct agent | Purpose | Scope | Notes |
|--------------|---------|-------|-------|
| `typescript-reviewer` | TypeScript/JavaScript code review | TypeScript/JavaScript projects | Invoke directly when a review needs TS/JS-specific findings and there is no dedicated slash command. |
| `php-reviewer` | PHP code review | PHP projects | PSR-12, type system, Doctrine ORM, security, performance. |
| `database-reviewer` | MySQL specialist | Schema/query/security/performance review | Invoke directly for SQL, migrations, or schema design. |
| `network-architect` / `network-config-reviewer` / `network-troubleshooter` | Network design, review, diagnostics | No dedicated slash command yet |
| `a11y-architect` / `seo-specialist` | Accessibility / SEO | No dedicated slash command yet |

## Skills referenced by commands

- **continuous-learning-v2**: `/learn`, `/learn-eval`, `/instinct-*`, `/evolve`, `/promote`, `/prune`, `/projects`
- **verification-loop**: `/checkpoint`
- **eval-harness**: referenced by the `orch-*` gated pipeline
- **security-scan**: `/security-scan` (runs AgentShield)
- **strategic-compact**: suggested at compaction points (hooks)
- **unified-memory**: `ecc memory ...` and the opt-in `ecc-memory-mcp` server
- **jira-integration**: `/jira`

## How to use this map

- **Discoverability:** Find which command triggers which agent (e.g. "use `/code-review` for code-reviewer").
- **Refactoring:** When renaming or removing an agent, search this doc and the command files for references.
- **CI/docs:** The catalog script (`node scripts/ci/catalog.js`) outputs agent/command/skill counts; this map complements it with command–agent relationships.
