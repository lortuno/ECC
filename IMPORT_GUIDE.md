# IMPORT_GUIDE.md — Bootstrapping a New Symfony PHP Project from ECC

This guide is for taking a fresh **Symfony PHP recipe manager** project (managed day-to-day with Claude Code + npm) and giving it the ECC skills, rules, agents, commands, and hooks it needs — without pulling in the whole ECC repo.

There are two ways to do this. **Use Path A unless you have a specific reason to hand-copy files.** Path B is the literal file-by-file list, for when you want full manual control or can't run the installer.

---

## Path A (recommended): use the `ecc` CLI

ECC ships an installer that does everything in Path B correctly — including the hook wiring, which is fragile to copy by hand (see the warning in Path B, section F). It's on npm, so this fits your "npm" workflow directly:

```bash
cd own-project                       # your new project root
npm init -y                             # if package.json doesn't exist yet
npm install --save-dev ecc-universal
npx ecc setup                           # guided install: pick target = "claude", scope, profile
```

ECC auto-detects your stack via `config/project-stack-mappings.json` — a `composer.json` / `symfony.lock` / `bin/console` in your project root matches the `php-symfony` entry and pulls in the exact rule/skill set listed in section B/C below automatically. For a non-interactive install, use the `developer` profile (rules, agents, commands, hooks, framework-language skills, database skills):

```bash
npx ecc install --profile developer
```

Later, `npx ecc doctor` / `npx ecc repair` detect drift and `npx ecc plan` previews changes before applying them.

---

## Path B: manual copy

Target layout inside your new project:

```
own-project/
├── CLAUDE.md                     # from examples/symfony-api-CLAUDE.md
└── .claude/
    ├── rules/ecc/common/*.md
    ├── rules/ecc/php/*.md
    ├── agents/*.md
    ├── commands/*.md
    └── skills/<name>/SKILL.md    # one folder per skill
```

### A. Project instructions — `CLAUDE.md`

Copy `examples/symfony-api-CLAUDE.md` → `own-project/CLAUDE.md`, then fill in the placeholders (`[Brief description of your project...]` etc.) with own-project specifics. This is the one file Claude reads on every session start, so it's the highest-leverage copy.

### B. Rules — always-loaded conventions

From `config/project-stack-mappings.json`'s official `php-symfony` entry: `rules: ["common", "php"]`.

Copy **entire directories**, don't flatten — `rules/php/*.md` files reference `../common/*.md`, and common/php share filenames (`coding-style.md`, `security.md`, `testing.md`, etc.) that would collide if merged into one folder:

```bash
cp -r rules/common  own-project/.claude/rules/ecc/common
cp -r rules/php      own-project/.claude/rules/ecc/php
```

### C. Skills — loaded by Claude matching task → frontmatter `description`

**Official set for `php-symfony`** (from the same mapping file):

| Skill | Why |
|---|---|
| `symfony-patterns` | Core Symfony conventions |
| `symfony-tdd` | Symfony-flavored TDD workflow |
| `symfony-verification` | Verification loop for Symfony changes |
| `symfony-security` | Symfony-specific security guidance |
| `symfony-bundle-discovery` | Finding/using bundles correctly |
| `tdd-workflow` | General TDD discipline |
| `verification-loop` | Post-change verification habit |

**Recommended extras** for a database-backed web app like a recipe manager:

| Skill | Why |
|---|---|
| `database-migrations` | Schema changes for recipes/ingredients tables |
| `mysql-patterns` *(or `postgres-patterns` if you pick Postgres)* | Query/schema conventions |
| `api-design` | If you expose a JSON API alongside the web UI |
| `backend-patterns` | General backend architecture |
| `error-handling` | Consistent error handling |
| `coding-standards` | Baseline style |
| `git-workflow` / `github-ops` | Commit/PR conventions |
| `e2e-testing` | Browser-level tests for the recipe UI |
| `security-review` / `security-scan` | Pre-merge and periodic security checks |
| `documentation-lookup` | Looking up Symfony/Composer docs correctly |
| `code-tour` / `codebase-onboarding` | Useful once the codebase grows |
| `docker-patterns` | If you containerize for dev/deploy |

Copy each folder wholesale (skills are self-contained — they carry their own examples/scripts):

```bash
for s in symfony-patterns symfony-tdd symfony-verification symfony-security \
         symfony-bundle-discovery tdd-workflow verification-loop \
         database-migrations mysql-patterns api-design backend-patterns \
         error-handling coding-standards git-workflow github-ops \
         e2e-testing security-review security-scan documentation-lookup; do
  cp -r "skills/$s" "own-project/.claude/skills/$s"
done
```

If you later add a JS-driven frontend (React/Vue) on top via npm, add `react-patterns`/`frontend-patterns` etc. the same way — `project-stack-mappings.json` will also auto-detect that if you use Path A.

### D. Agents — specialists you delegate to explicitly

**When do you use an agent vs. a skill?** A skill is passive knowledge — Claude reads its `description`, decides it's relevant, and folds that guidance into the *current* conversation. An agent is active delegation — it spawns a separate subagent with its own (often narrower) tool access and prompt, runs a bounded task in isolation, and reports back a result without cluttering your main context. You reach for an agent when you want:

- **Isolation** — a big review or exploration whose intermediate tool output (grep noise, file dumps) you don't want polluting your main conversation.
- **A named specialist** — e.g. "review this migration with `database-reviewer`" or "use `php-reviewer` on this controller" gives you a more targeted, consistent review than asking generically.
- **Parallelism** — commands like `/code-review` typically fan out to several agents at once (`code-reviewer`, `php-reviewer`, `security-reviewer`) and merge their findings.

You invoke one of two ways: explicitly by name ("use the `planner` agent to plan this feature"), or implicitly because a command you ran (like `/code-review` or `/plan`) delegates to one internally — check the command's `.md` file to see which agents it calls. If you never type `/code-review` and never ask for a named agent by name, the agent files just sit there unused — that's fine, they're opt-in.

Core:

```bash
for a in php-reviewer database-reviewer security-reviewer code-reviewer \
         architect planner tdd-guide build-error-resolver; do
  cp "agents/$a.md" "own-project/.claude/agents/$a.md"
done
```

Optional, add if useful: `doc-updater.md`, `silent-failure-hunter.md`, `refactor-cleaner.md`, `performance-optimizer.md`, `code-explorer.md`.

### E. Commands — slash commands

**Are these necessary?** No — strictly speaking you could run this project with zero files in `.claude/commands/`. Skills still auto-trigger from context, and you can still invoke any agent by naming it in plain English. What a command buys you is a **fixed, named, repeatable procedure**: `/code-review` always runs the same review sequence in the same order, regardless of how you phrase the request that day, and it's discoverable (it shows up when you type `/`). Skip this folder if you're working solo and are comfortable describing what you want each time; copy it if you want consistent, muscle-memory workflows — which matters more once you're not the only person (or session) touching the project.

```bash
for c in plan feature-dev code-review build-fix security-scan test-coverage \
         quality-gate refactor-clean pr project-init skill-create update-docs; do
  cp "commands/$c.md" "own-project/.claude/commands/$c.md"
done
```

Note: `/tdd` and `/e2e` are **not** in the live `commands/` set anymore — they were retired in favor of the `tdd-workflow` and `e2e-testing` skills (which trigger automatically). If you still want the explicit slash commands out of habit, they're preserved as shims:

```bash
cp legacy-command-shims/commands/tdd.md own-project/.claude/commands/tdd.md
cp legacy-command-shims/commands/e2e.md own-project/.claude/commands/e2e.md
```

### F. Hooks — do **not** hand-copy `hooks/hooks.json`

`hooks/README.md` is explicit about this:

> "For Claude Code manual installs, do not paste the raw repo `hooks.json` into `~/.claude/settings.json` or copy it directly into `~/.claude/hooks/hooks.json`. The checked-in file is plugin/repo-oriented and is meant to be installed through the ECC installer or loaded as a plugin."

The hook scripts under `scripts/hooks/` depend on `scripts/lib/` helpers and a root-resolution bootstrap — copying the JSON alone breaks at runtime. If you want hooks (auto-format on edit, commit-quality checks, session persistence, etc.), run the installer for just that module instead of skipping to Path A entirely:

```bash
bash /path/to/this/ECC/checkout/install.sh --target claude --modules hooks-runtime --enable-hooks
```

run from inside `own-project/`. Otherwise, skip hooks for now — everything else in this guide works without them.

### G. MCP servers — optional

Copy `.mcp.json` (the `chrome-devtools` MCP server) into `own-project/.mcp.json` only if you'll drive/debug the recipe manager's UI through a live browser session from Claude. Not needed for pure backend/API work.

### H. Tests — nothing to copy

`tests/` in this repo tests *ECC's own* Node scripts (`tests/lib/*.test.js`, `tests/hooks/*.test.js`) — it has nothing to do with your Symfony app and shouldn't be copied. Your actual test setup (PHPUnit, Symfony's `WebTestCase`/Panther for e2e) comes from following the `symfony-tdd` and `e2e-testing` skills you copied in section C — they teach the conventions, you write the tests.

### I. Schemas — you don't need these

`schemas/*.schema.json` (`plugin.schema.json`, `hooks.schema.json`, `install-*.schema.json`, etc.) are JSON Schemas that ECC's own CI (`scripts/ci/validate-*.js`) uses to validate *ECC's own* config files — `.claude-plugin/plugin.json`, `hooks/hooks.json`, the `manifests/install-*.json` files. Notably there's **no** `skill.schema.json` or `agent.schema.json` — skill/agent/command markdown frontmatter is checked by hand-rolled parsing in `scripts/ci/validate-skills.js` / `validate-agents.js` / `validate-commands.js`, not JSON Schema.

None of this applies to `own-project/` — you have no `plugin.json`, no `hooks.json`, no install manifests to validate. Skip `schemas/` entirely for Path B. The only reason to ever look at it is if you later contribute a fix back to ECC itself, or hand-write your own `ecc`-compatible install manifest.

---

## Verifying the import

Manual copying has no safety net — there's no installer tracking what landed where, so a typo in a path or a missing frontmatter field fails silently (Claude just won't see that file). Two layers of check: **structural** (did the files land in the right shape) and **behavioral** (does Claude actually use them — the "canary check").

### 1. Structural check — did the files land correctly?

The repo's own `scripts/ci/validate-*.js` scripts are hardcoded to `skills/`, `agents/`, `commands/`, `rules/` inside *this* repo (`path.join(__dirname, '../../skills')`, etc.) — they can't be pointed at `own-project/.claude/` as-is, so don't try to run them against your new project. Instead, a quick manual shape-check covers the same requirements they'd enforce:

```bash
cd own-project

# Every skill folder must contain a SKILL.md with name: and description: in its frontmatter
for d in .claude/skills/*/; do
  f="$d/SKILL.md"
  [ -f "$f" ] || echo "MISSING SKILL.md: $d"
  grep -q '^name:' "$f" 2>/dev/null || echo "MISSING name: in $f"
  grep -q '^description:' "$f" 2>/dev/null || echo "MISSING description: in $f"
done

# Every agent file must declare model: and tools: in frontmatter
for f in .claude/agents/*.md; do
  grep -q '^model:' "$f" || echo "MISSING model: in $f"
  grep -q '^tools:' "$f" || echo "MISSING tools: in $f"
done

# Every command file must have a description: frontmatter line
for f in .claude/commands/*.md; do
  grep -q '^description:' "$f" || echo "MISSING description: in $f"
done

# rules/php/*.md reference ../common/ — confirm the sibling relationship survived the copy
ls .claude/rules/ecc/common/*.md .claude/rules/ecc/php/*.md
```

No output from the first three loops = frontmatter is structurally sound. This won't catch semantic errors (a wrong-but-well-formed `description:`), only missing/malformed files — that's what the canary check below is for.

### 2. Canary check — does Claude actually pick it up?

("Canary" here means a deliberate, disposable probe — not the `canary-watch` *skill* in this repo, which is unrelated: that one monitors a **deployed URL** post-release for regressions, not your local ECC setup. Different meaning, same word.)

Run these probes from inside Claude Code, opened at `own-project/` root, after copying:

- **CLAUDE.md loaded?** Ask: *"What does the project CLAUDE.md say about code organization?"* — Claude should quote back specifics from your edited `examples/symfony-api-CLAUDE.md` content, not generic advice.
- **Rules loaded?** Ask something the `php`/`common` rules specifically constrain (e.g. a style or security rule you know is in `rules/php/security.md`) and confirm Claude's answer reflects it unprompted.
- **Skill triggers?** Describe a task that should match a skill's `description` verbatim-ish — e.g. *"I need to add a new Doctrine migration for a recipes table"* should surface `database-migrations`/`symfony-patterns` guidance. If Claude answers generically with no Symfony-specific migration conventions, the skill isn't being picked up — re-check its frontmatter `description` field (this is the #1 cause: a vague or missing `description` means Claude has nothing to match against).
- **Agent reachable?** Explicitly ask: *"Use the `php-reviewer` agent to review `src/Controller/RecipeController.php`"* and confirm it actually delegates (isolated tool output, a distinct report back) rather than just reviewing inline.
- **Command wired?** Type `/plan` and confirm it appears in the slash-command autocomplete before you even submit — that alone confirms `.claude/commands/plan.md` is discovered.
- **Hooks (only if installed via the installer, section F)** — make a trivial edit to a `.php` file and confirm an auto-format or quality-gate hook actually fires (visible as hook output in the transcript). If you skipped hooks, skip this probe too.

If a probe fails, the fix is almost always one of: wrong path (`.claude/skills/<name>/SKILL.md`, not `.claude/skills/<name>.md`), missing/malformed frontmatter (caught by section 1 above), or a `description` too vague to match your phrasing (tighten it, per `docs/SKILL-DEVELOPMENT-GUIDE.md`'s guidance on writing trigger-worthy descriptions).

## Checklist

- [ ] `CLAUDE.md` (from `examples/symfony-api-CLAUDE.md`, edited)
- [ ] `.claude/rules/ecc/common/` + `.claude/rules/ecc/php/`
- [ ] `.claude/skills/` — symfony-* set + own-project extras
- [ ] `.claude/agents/` — reviewer/planner/tdd set (copy only if you want explicit/delegated reviews)
- [ ] `.claude/commands/` — plan/review/build-fix/test-coverage set (copy only if you want fixed named workflows)
- [ ] Hooks — via installer only, or skipped
- [ ] `.mcp.json` — only if doing browser-driven UI work
- [ ] Tests — not copied; conventions come from the skills instead
- [ ] `schemas/` — not copied; irrelevant outside the ECC repo itself
- [ ] Structural check (section 1) passes with no missing-file/frontmatter warnings
- [ ] Canary check (section 2) confirms CLAUDE.md, rules, at least one skill, one agent, and one command are all actually live
