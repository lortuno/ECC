# Everything Claude Code (ECC)

ECC is a Claude Code **plugin**: a curated collection of agents, skills, slash commands, hooks, rules, and Node.js scripts that add production-ready workflows (TDD, code review, planning, security review, install management, etc.) on top of Claude Code.

This document explains how the pieces fit together — which file calls which, when hooks fire, when MCP servers are used, how skills get picked, and what "installing" a skill actually means.

## Directory map

| Path | What it is |
|---|---|
| `agents/` | Specialized subagent prompts (Markdown + YAML frontmatter). Invoked explicitly via delegation, not by scripts. |
| `skills/` | Passive knowledge modules (`SKILL.md` per folder). Claude loads them by matching frontmatter to the task. |
| `commands/` | Slash commands (`/plan`, `/build-fix`, ...). Markdown instructions Claude follows; some shell out to `scripts/`. |
| `hooks/` | Event-driven automation wired into Claude Code's tool lifecycle (`hooks.json` + `hooks.metadata.json`). |
| `rules/` | Always-on guidelines loaded into context (security, style, testing). |
| `scripts/` | Node.js implementation: the `ecc` CLI, hook scripts (`scripts/hooks/`), and shared libraries (`scripts/lib/`). |
| `manifests/` | Machine-readable catalogs (`install-modules.json`, `install-profiles.json`) used by the selective installer. |
| `.claude-plugin/` | The actual Claude Code plugin manifest (`plugin.json`) and marketplace listing (`marketplace.json`). |
| `.mcp.json` | Local MCP server configuration (see [MCP servers](#mcp-servers)). |
| `docs/` | Architecture and policy documents referenced throughout this README. |

## Two separate entry points

It's easy to conflate these — they're unrelated:

1. **Claude Code plugin surface** — when ECC is loaded as a Claude Code plugin (via `.claude-plugin/plugin.json`, which declares `"skills": ["./skills/"]` and `"commands": ["./commands/"]`), Claude Code itself reads `skills/`, `commands/`, `agents/`, and `hooks/hooks.json` directly. Nothing needs to be "run" for these to be available.
2. **The `ecc` CLI** — a separate Node.js command-line tool (`scripts/ecc.js`, exposed as the `ecc` / `ecc-universal` binaries in `package.json`). This is what a human runs in a terminal to install, update, or inspect ECC itself — it is not invoked by Claude during a session.

### The `ecc` CLI dispatch table

`scripts/ecc.js` defines a `COMMANDS` map from subcommand name to a script under `scripts/`, e.g.:

```js
const COMMANDS = {
  setup:   { script: 'setup.js' },        // ecc setup
  install: { script: 'install-apply.js' },// ecc install
  plan:    { script: 'install-plan.js' }, // ecc plan
  catalog: { script: 'catalog.js' },      // ecc catalog
  doctor:  { script: 'doctor.js' },       // ecc doctor
  status:  { script: 'status.js' },       // ecc status
  ...
};
```

Running `ecc <command>` spawns the matching script. This is how a user installs, updates, repairs, or audits their local ECC setup — see [Skill and component installation](#skill-and-component-installation).

### Slash commands: mostly inline, sometimes scripted

`commands/*.md` files are prompts Claude follows directly when a user types `/name`. Most are self-contained — e.g. `commands/plan.md` explicitly states: *"Run inline by default. Do not call the Task tool or any subagent by default."* `commands/skill-create.md` runs `git log` itself and writes `SKILL.md` output directly.

A subset of commands do shell out to a specific script in `scripts/`:

- `/auto-update` → `node "$ECC_ROOT/scripts/auto-update.js"`
- `/epic-claim`, `/epic-sync`, `/epic-review` → `node scripts/github-coordination.js ...`
- `/harness-audit` → `node scripts/harness-audit.js`
- `/instinct-status`, `/instinct-import` → `python3 .../continuous-learning-v2/scripts/instinct-cli.py ...`

Agents (`agents/*.md`) are almost entirely self-contained instruction prompts too; only a handful (`agent-evaluator.md`, `doc-updater.md`, `harness-optimizer.md`) reference `scripts/` at all.

## Hooks

Hooks are the automation layer that reacts to Claude Code's tool lifecycle (`hooks/README.md`):

```
User request → Claude picks a tool → PreToolUse hook runs → Tool executes → PostToolUse hook runs
```

Plus `SessionStart` / `SessionEnd`, `Stop` (after each response), and `PreCompact` (before context compaction).

**Dispatch chain** for every entry in `hooks/hooks.json`:

1. An inline `node -e` bootstrap resolves the ECC root (via `scripts/lib/resolve-ecc-root.js`) — this lets the same hook config work whether ECC is loaded as a plugin, installed manually, or run from a repo checkout.
2. It requires `scripts/hooks/plugin-hook-bootstrap.js`, which sets up the execution environment.
3. That calls `scripts/hooks/run-with-flags.js <hookId> <script> <profiles>`, which checks `ECC_HOOK_PROFILE` / `ECC_DISABLED_HOOKS` before running anything.
4. Only then does the actual hook script run (e.g. `scripts/hooks/pre-bash-dispatcher.js`).
5. Some hooks are themselves dispatchers that route to sub-checks by matcher/tool — e.g. `pre-bash-dispatcher.js` delegates to `bash-hook-dispatcher.js`, which fans out to `block-no-verify.js`, `pre-bash-git-push-reminder.js`, `pre-bash-commit-quality.js`, etc.

Stable hook IDs live in `hooks/hooks.metadata.json`, kept in sync with `hooks.json` by `node scripts/ci/validate-hooks.js` (CI fails if they drift).

| Event | Example script | Purpose |
|---|---|---|
| `PreToolUse` (Bash) | `scripts/hooks/pre-bash-dispatcher.js` | Blocks/warns on risky commands (`--no-verify`, dev servers outside tmux, etc.) |
| `PostToolUse` (Edit) | `scripts/hooks/post-edit-format.js` | Auto-formats JS/TS with Prettier |
| `SessionStart` | `scripts/hooks/session-start.js` | Loads prior session context, detects package manager |
| `Stop` | `scripts/hooks/evaluate-session.js` | Continuous-learning pattern extraction |
| `PreCompact` | `scripts/hooks/pre-compact.js` | Saves state before context compaction |
| `SessionEnd` | `scripts/hooks/session-end.js` | Lifecycle marker/cleanup |

Runtime behavior is controlled with env vars without editing `hooks.json`: `ECC_HOOKS_ENABLED`, `ECC_HOOK_PROFILE` (`minimal`/`standard`/`strict`), `ECC_DISABLED_HOOKS`. See `hooks/README.md` for the full reference and how to install these hooks manually via `install.sh --modules hooks-runtime`.

## MCP servers

ECC intentionally ships **one** default MCP server, configured in the root `.mcp.json`:

```json
{ "mcpServers": { "chrome-devtools": { "command": "npx", "args": ["-y", "chrome-devtools-mcp@latest"] } } }
```

`docs/MCP-CONNECTOR-POLICY.md` explains why: a default connector must be universal *and* need what MCP specifically provides (session state, streaming, an auth handshake) — otherwise it should be a skill wrapping a CLI/API instead. `chrome-devtools` qualifies because browser debugging needs a held-open CDP session. Six former defaults (`github`, `context7`, `exa`, `memory`, `playwright`, `sequential-thinking`) were deliberately dropped in favor of CLI-wrapping skills (e.g. `github-ops` uses the `gh` CLI) or native harness features, and now exist only as opt-in entries a user can enable separately (documented under `mcp-configs/mcp-servers.json` in policy; not present in this checkout). The plugin manifest itself (`.claude-plugin/plugin.json`) declares `"mcpServers": {}` — MCP wiring lives in `.mcp.json`, not the plugin manifest. `ECC_DISABLED_MCPS` filters generated MCP config at install/sync time.

## How skills get triggered

There is no routing engine or lookup table that dispatches to a skill. Claude Code (and ECC) select a skill the same way: **Claude reads each skill's YAML frontmatter `description` and decides at run time whether it matches the current task.** For example:

```yaml
---
name: tdd-workflow
description: Use this skill when writing new features, fixing bugs, or refactoring code. Enforces test-driven development with 80%+ coverage...
---
```

`docs/SKILL-DEVELOPMENT-GUIDE.md` confirms skills are "knowledge modules Claude Code loads based on context" — activated when the task matches the skill's domain, when a command references it, or when an agent needs that domain knowledge. This is context matching by the model, not a deterministic rules engine.

The **Skills table in `CLAUDE.md`** (file pattern → skill name) is documentation guidance for Claude to follow — it is not enforced by any hook. The closest thing to hook involvement is `scripts/hooks/skill-run-tracker.js`, a `PostToolUse` hook that only *records* which skill ran (to `~/.claude/state/skill-runs.jsonl`, for the `skills-health` dashboard) — it observes usage after the fact and never selects or blocks a skill.

## Skill and component installation

Skill "installation" means different things depending on how ECC is loaded:

- **As a Claude Code plugin** — once `.claude-plugin/plugin.json` (`"skills": ["./skills/"]`, `"commands": ["./commands/"]`) is loaded, every curated skill under `skills/` and command under `commands/` is immediately available. No separate install step is required.
- **Selective install into another location** (`~/.claude`, a project's `.claude/`, or another harness like Cursor/Codex) — this copies only chosen agents/skills/commands, driven by `manifests/install-modules.json` and `manifests/install-profiles.json` and executed through the `ecc` CLI:
  - `ecc plan` (`scripts/install-plan.js`) — inspect what a profile/module selection would resolve to, without mutating anything.
  - `ecc install` (`scripts/install-apply.js`) — perform the install/update.
  - `ecc setup` (`scripts/setup.js`) — guided install with hook/scope choices.
  - `ecc doctor` / `ecc repair` — diagnose and fix drift between the manifest and installed files.

`docs/SKILL-PLACEMENT-POLICY.md` defines where each skill *type* lives:

| Type | Location | Shipped in repo |
|---|---|---|
| Curated | `skills/<name>/SKILL.md` | Yes |
| Learned (from `/learn` or the Stop-hook continuous-learning evaluator) | `~/.claude/skills/learned/` | No |
| Imported (user-installed from an external source) | `~/.claude/skills/imported/` | No |
| Evolved (continuous-learning-v2 instincts) | `~/.claude/homunculus/evolved/skills/` | No |

Only curated skills are validated by `scripts/ci/validate-skills.js` and referenced in install manifests; learned/imported/evolved skills live outside the repo and are picked up at runtime if their directory exists — nothing needs to be "installed" for them either, beyond being present on disk.

For the full step-by-step walkthrough of creating and installing a skill, agent, or hook — including worked examples, structural validators, and behavioral canary checks — see `docs/INSTALLATION_GUIDE.md`. Per-component authoring detail lives in `HOW_TO_CREATE_A_SKILL.md`, `HOW_TO_CREATE_AN_AGENT.md`, and `HOW_TO_CREATE_A_HOOK.md` at the repo root.

## Testing

```bash
node tests/run-all.js               # full suite
node tests/lib/utils.test.js        # a single test file
npm test                            # full suite plus validators (agents, commands, rules, skills, hooks, manifests)
```
