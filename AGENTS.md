# Everything Claude Code (ECC) — Agent Instructions

This is a **production-ready AI coding plugin** providing 32 specialized agents, 116 skills, 68 commands, and automated hook workflows for software development.

**Version:** 2.2.2

## Core Principles

1. **Agent-First** — Delegate to specialized agents for domain tasks
2. **Test-Driven** — Write tests before implementation, 80%+ coverage required
3. **Security-First** — Never compromise on security; validate all inputs
4. **Immutability** — Always create new objects, never mutate existing ones
5. **Plan Before Execute** — Plan complex features before writing code

## Available Agents

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design and scalability | Architectural decisions |
| code-architect | Feature architecture blueprints | Designing a feature from existing codebase conventions |
| code-explorer | Codebase tracing and mapping | Understanding execution paths before new development |
| tdd-guide | Test-driven development | New features, bug fixes |
| code-reviewer | Code quality and maintainability | After writing/modifying code |
| code-simplifier | Clarity/consistency refactoring | Simplifying recently modified code without changing behavior |
| typescript-reviewer | TypeScript/JavaScript code review | TypeScript/JavaScript projects |
| react-reviewer | React/JSX code review | Hook correctness, render perf, server/client boundaries, a11y |
| react-build-resolver | React build errors | Vite/webpack/Next.js/CRA/Parcel/esbuild/Bun build failures |
| php-reviewer | PHP code review | PSR-12, type system, Doctrine ORM, security, performance |
| database-reviewer | MySQL specialist | Query optimization, schema design, security, performance |
| security-reviewer | Vulnerability detection | Before commits, sensitive code |
| a11y-architect | Accessibility (WCAG 2.2) | Design systems, UI components, inclusive UX audits |
| seo-specialist | SEO audits and remediation | Technical SEO, structured data, Core Web Vitals |
| network-architect | Enterprise network design | Multi-site/enterprise network architecture |
| network-config-reviewer | Network config review | Router/switch config security and correctness |
| network-troubleshooter | Network diagnostics | Connectivity, routing, DNS, interface issues |
| performance-optimizer | Performance analysis | Bottlenecks, bundle size, runtime, memory leaks |
| build-error-resolver | Fix build/type errors | When build fails |
| refactor-cleaner | Dead code cleanup | Code maintenance |
| silent-failure-hunter | Silent failure detection | Swallowed errors, bad fallbacks, missing propagation |
| type-design-analyzer | Type design review | Encapsulation, invariants, enforcement |
| comment-analyzer | Comment quality review | Accuracy, completeness, comment-rot risk |
| pr-test-analyzer | PR test coverage review | Behavioral coverage, real bug prevention |
| doc-updater | Documentation and codemaps | Updating docs |
| docs-lookup | Documentation lookup via Context7 | API/docs questions |
| spec-miner | Brownfield spec extraction | Onboarding brownfield projects to spec-driven development |
| conversation-analyzer | Hook candidate discovery | Finding behaviors worth preventing via hooks (`/hookify`) |
| agent-evaluator | Agent output quality scoring | 5-axis rubric after non-trivial tasks |
| harness-optimizer | Harness config tuning | Reliability, cost, throughput |
| loop-operator | Autonomous loop execution | Run loops safely, monitor stalls, intervene |

## Agent Orchestration

Use agents proactively without user prompt:
- Complex feature requests → **ecc:planner**
- Code just written/modified → **ecc:code-reviewer**
- Bug fix or new feature → **ecc:tdd-guide**
- Architectural decision → **ecc:architect**
- Security-sensitive code → **ecc:security-reviewer**
- Brownfield project onboarding → **ecc:spec-miner**
- Autonomous loops / loop monitoring → **ecc:loop-operator**
- Harness config reliability and cost → **ecc:harness-optimizer**

Use parallel execution for independent operations — launch multiple agents simultaneously.

## Security Guidelines

**Before ANY commit:**
- No hardcoded secrets (API keys, passwords, tokens)
- All user inputs validated
- SQL injection prevention (parameterized queries)
- XSS prevention (sanitized HTML)
- CSRF protection enabled
- Authentication/authorization verified
- Rate limiting on all endpoints
- Error messages don't leak sensitive data

**Secret management:** NEVER hardcode secrets. Use environment variables or a secret manager. Validate required secrets at startup. Rotate any exposed secrets immediately.

**If security issue found:** STOP → use security-reviewer agent → fix CRITICAL issues → rotate exposed secrets → review codebase for similar issues.

## Coding Style

**Immutability (CRITICAL):** Always create new objects, never mutate. Return new copies with changes applied.

**File organization:** Many small files over few large ones. 200-400 lines typical, 800 max. Organize by feature/domain, not by type. High cohesion, low coupling.

**Error handling:** Handle errors at every level. Provide user-friendly messages in UI code. Log detailed context server-side. Never silently swallow errors.

**Input validation:** Validate all user input at system boundaries. Use schema-based validation. Fail fast with clear messages. Never trust external data.

**Code quality checklist:**
- Functions small (<50 lines), files focused (<800 lines)
- No deep nesting (>4 levels)
- Proper error handling, no hardcoded values
- Readable, well-named identifiers

## Testing Requirements

**Minimum coverage: 80%**

Test types (all required):
1. **Unit tests** — Individual functions, utilities, components
2. **Integration tests** — API endpoints, database operations
3. **E2E tests** — Critical user flows

**TDD workflow (mandatory):**
1. Write test first (RED) — test should FAIL
2. Write minimal implementation (GREEN) — test should PASS
3. Refactor (IMPROVE) — verify coverage 80%+

Troubleshoot failures: check test isolation → verify mocks → fix implementation (not tests, unless tests are wrong).

## Development Workflow

1. **Plan** — Use ecc:planner agent, identify dependencies and risks, break into phases
2. **TDD** — Use ecc:tdd-guide agent, write tests first, implement, refactor
3. **Review** — Use ecc:code-reviewer agent immediately, address CRITICAL/HIGH issues
4. **Capture knowledge in the right place**
   - Personal debugging notes, preferences, and temporary context → auto memory
   - Team/project knowledge (architecture decisions, API changes, runbooks) → the project's existing docs structure
   - If the current task already produces the relevant docs or code comments, do not duplicate the same information elsewhere
   - If there is no obvious project doc location, ask before creating a new top-level file
5. **Commit** — Conventional commits format, comprehensive PR summaries

## Workflow Surface Policy

- `skills/` is the canonical workflow surface.
- New workflow contributions should land in `skills/` first.
- `commands/` is a legacy slash-entry compatibility surface and should only be added or updated when a shim is still required for migration or cross-harness parity.

## Git Workflow

**Commit format:** `<type>: <description>` — Types: feat, fix, refactor, docs, test, chore, perf, ci

**PR workflow:** Analyze full commit history → draft comprehensive summary → include test plan → push with `-u` flag.

## Architecture Patterns

**API response format:** Consistent envelope with success indicator, data payload, error message, and pagination metadata.

**Repository pattern:** Encapsulate data access behind standard interface (findAll, findById, create, update, delete). Business logic depends on abstract interface, not storage mechanism.

**Skeleton projects:** Search for battle-tested templates, evaluate with parallel agents (security, extensibility, relevance), clone best match, iterate within proven structure.

## Performance

**Context management:** Avoid last 20% of context window for large refactoring and multi-file features. Lower-sensitivity tasks (single edits, docs, simple fixes) tolerate higher utilization.

**Build troubleshooting:** Use build-error-resolver agent → analyze errors → fix incrementally → verify after each fix.

## Project Structure

```
agents/          — 32 specialized subagents
skills/          — 116 workflow skills and domain knowledge
commands/        — 68 slash commands
hooks/           — Trigger-based automations
rules/           — Always-follow guidelines (common + per-language)
scripts/         — Cross-platform Node.js utilities
mcp-configs/     — 14 MCP server configurations
tests/           — Test suite
```

`commands/` remains in the repo for compatibility, but the long-term direction is skills-first.

## Success Metrics

- All tests pass with 80%+ coverage
- No security vulnerabilities
- Code is readable and maintainable
- Performance is acceptable
- User requirements are met
