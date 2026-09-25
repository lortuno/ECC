# HOW_TO_CREATE_A_SKILL.md

A skill is a **passive knowledge module** — Claude reads its frontmatter `description`, decides a task matches it, and folds its content into the current conversation. That's different from an **agent** (active delegation to an isolated subagent) or a **command** (a fixed procedure you invoke with `/name`). See `docs/SKILL-DEVELOPMENT-GUIDE.md` for the full reference this guide summarizes and extends with guardrails + real test files.

This guide has four parts: **write it properly**, **place it correctly**, **add guardrails**, **test it**. A fully worked example — including a real, runnable test suite — ships alongside this guide at `docs/examples/skill-authoring/`.

---

## 1. Write it properly

### Step 1 — Pick a focused topic

A skill should cover one domain narrowly enough that its `description` can be specific. Too broad and Claude can't tell when to use it; too narrow and you'll end up with dozens of overlapping skills.

| Good focus | Too broad |
|---|---|
| `doctrine-migration-guard` | `database` |
| `react-hook-patterns` | `react` |
| `pytest-fixtures` | `python-testing` |

### Step 2 — Create the directory

```bash
mkdir -p skills/your-skill-name   # or .claude/skills/your-skill-name in a consuming project
```

The directory name and the frontmatter `name:` field should match exactly — mismatches are confusing and several tooling paths (including the validator in section 4) treat it as a finding.

### Step 3 — Write `SKILL.md`

Required shape:

```markdown
---
name: your-skill-name
description: One sentence stating what this covers AND when to use it.
metadata:
  origin: ECC              # or "community", "example", your project name
allowed-tools: Read, Edit  # optional — see "Guardrails" below
---

# Your Skill Title

One or two sentences of overview.

## When to Activate

- Concrete trigger 1
- Concrete trigger 2

## Core Concepts

Explanation + code, not prose alone.

## Anti-Patterns

What NOT to do, with a corrected version right next to it.

## Best Practices

- Actionable, not vague.

## Related Skills

- `other-skill-name`
```

Frontmatter fields, per `docs/SKILL-DEVELOPMENT-GUIDE.md`:

| Field | Required | Notes |
|---|---|---|
| `name` | Yes | lowercase-with-hyphens, matches the directory |
| `description` | Yes | **This is the entire activation mechanism** — see below |
| `metadata.origin` | No | `ECC`, `community`, your project name, etc. — attribution only |
| `tags` | No | categorization |
| `version` | No | tracking updates |
| `allowed-tools` | No | restricts which tools are available while this skill is active — a real enforcement mechanism, covered in Guardrails. Not documented in the guide's own frontmatter table, but used in the repo (`skills/inherit-legacy-style/SKILL.md`) |

**The `description` field is the single most important thing you'll write.** There's no separate routing engine — Claude matches your phrasing against the user's task at runtime. Vague descriptions are the #1 reason a correctly-placed skill never triggers. Compare:

- FAIL: `"Database migration help"` — too vague to match anything specific.
- PASS: `"Use this skill when creating, reviewing, or running Doctrine/Symfony database migrations, to catch destructive schema changes before they run against a real database."` — names the trigger conditions and the concrete domain.

### Step 4 — Write content Claude can immediately use

- Show, don't tell: a code block beats a paragraph describing the code.
- Include an **Anti-Patterns** section — showing what NOT to do is as valuable as showing what to do.
- Keep it to 200–500 lines typically, 800 lines max — split into multiple skills if you're exceeding that.
- Add `examples/` (code snippets) or `references/` (links/docs) subdirectories only if they add real value — not required for most skills.

---

## 2. Where to place it

| Type | Location | Shipped in repo/plugin | Provenance required |
|---|---|---|---|
| **Curated** (what you're writing) | `skills/<name>/SKILL.md` (repo) or `.claude/skills/<name>/SKILL.md` (consuming project) | Yes | No |
| Learned | `~/.claude/skills/learned/<name>/` | No | Yes — `.provenance.json` |
| Imported | `~/.claude/skills/imported/<name>/` | No | Yes — `.provenance.json` |
| Evolved | `~/.claude/homunculus/evolved/skills/` | No | Inherited from source instincts |

(Full policy: `docs/SKILL-PLACEMENT-POLICY.md`.) You're almost always writing a **curated** skill — a human deliberately authoring domain knowledge — so:

- **Contributing to this ECC repo**: `skills/your-skill-name/SKILL.md`. It'll be picked up by `scripts/ci/validate-skills.js` and, once referenced in `manifests/install-modules.json`, by the installer.
- **In your own project** (the common case): `.claude/skills/your-skill-name/SKILL.md` at the project root — loaded automatically the moment Claude Code opens that project, no install step. (`~/.claude/skills/your-skill-name/` for a user-wide skill instead.)

Don't put example/reference-only skills inside a real `skills/` root you also use for install manifests or CI validation — that's why this guide's own worked example lives under `docs/examples/skill-authoring/example-skill/`, not `skills/example-skill/`: it keeps a demo out of the real skill catalog `scripts/ci/validate-skills.js` and the install manifests scan.

---

## 3. Guardrails

"Guardrails" for a skill means: stopping Claude (or the skill's author) from doing something destructive while acting on the skill's guidance. There are three real levels, from weakest to strongest enforcement — pick based on how bad the failure mode is.

### Level 1 — Content guardrails (advisory only)

An explicit checklist inside the skill that tells Claude to stop and confirm before proceeding, plus an **Anti-Patterns** section pairing every dangerous pattern with its safe equivalent. This is pure prose — it works because Claude follows it, not because anything blocks the tool call. Weakest level, but costs nothing and belongs in every skill that touches anything risky.

The worked example (`docs/examples/skill-authoring/example-skill/SKILL.md`) demonstrates this: a numbered "Guardrail checklist" the model is told to answer explicitly before allowing a destructive migration, plus four paired anti-pattern/best-practice code blocks.

### Level 2 — Tool-scope guardrails (`allowed-tools`)

Frontmatter field that restricts which tools are available while the skill is active:

```yaml
allowed-tools: Read, Glob, Grep, Bash, Edit
```

This is real, in-repo precedent (`skills/inherit-legacy-style/SKILL.md`), not something this guide invented — but it's under-documented (absent from `docs/SKILL-DEVELOPMENT-GUIDE.md`'s own frontmatter table). Use it to rule out tools a skill has no legitimate reason to touch — e.g. a skill about reviewing migrations has no reason to need `WebFetch`.

### Level 3 — Hook-enforced guardrails (mechanical, not advisory)

The only level that actually *blocks* a tool call rather than asking Claude nicely. Pair a skill with a `PreToolUse` hook that intercepts `Edit`/`Write`/`Bash` and refuses or demands justification before letting it through. Two real, working examples already in this repo to study rather than reinvent:

- `skills/gateguard/SKILL.md` — a three-stage DENY → FORCE → ALLOW gate: blocks the first `Edit`/`Write`/`Bash` attempt, forces Claude to present concrete facts (who imports this file, what schema does this data have), then allows the retry.
- `skills/safety-guard/SKILL.md` — intercepts destructive commands (`rm -rf`, `git push --force`, `DROP TABLE`, etc.) and can freeze edits to a directory tree.

Building this level properly requires real hook engineering (`scripts/hooks/`, wired through `scripts/hooks/run-with-flags.js`, registered in `hooks/hooks.json`) — this is **not** something you hand-copy (see `hooks/README.md`'s explicit warning against pasting the raw `hooks.json`). If your skill needs this level, study `gateguard`'s and `safety-guard`'s actual hook scripts under `scripts/hooks/` and follow the installer path (`install.sh --modules hooks-runtime`) rather than fabricating hook JSON by hand.

**Rule of thumb**: use Level 1 always, add Level 2 whenever the skill has an obvious "this tool has no business being used here" boundary, and only reach for Level 3 when the failure mode is genuinely destructive (data loss, production impact) and advisory text has already proven insufficient.

---

## 4. Test it

Two kinds of testing, both demonstrated with real files in `docs/examples/skill-authoring/`: **structural** (is the file well-formed) and **behavioral** (does Claude actually use it, a.k.a. the "canary check").

### 4a. Structural test — real files, already passing

`docs/examples/skill-authoring/validate-skill.js` is a standalone, dependency-free Node script — copy it into any project, it doesn't need the rest of this repo. It checks the same rules ECC's own `scripts/ci/validate-skills.js` enforces (SKILL.md exists and is non-empty, frontmatter has `name`/`description`, name is lowercase-hyphenated and matches the directory, description isn't a YAML block-scalar and isn't suspiciously short, an explicit `## When to Activate` section exists, file isn't over 800 lines):

```bash
node docs/examples/skill-authoring/validate-skill.js docs/examples/skill-authoring/example-skill
# OK: docs/examples/skill-authoring/example-skill passed structural validation
```

`docs/examples/skill-authoring/validate-skill.test.js` is a real test suite (assert-based, no framework dependency, matches this repo's own `tests/*.test.js` style) exercising the validator against the shipped example plus eight deliberately-broken fixtures (missing file, empty file, no frontmatter, missing description, too-short description, name/directory mismatch, missing activation section, and a minimal-but-valid control case). Run it yourself:

```bash
node docs/examples/skill-authoring/validate-skill.test.js
```

Expected output (already verified while writing this guide):

```
=== Testing validate-skill.js ===

  ✓ example-skill/ (the shipped worked example) passes validation
  ✓ missing SKILL.md fails with a clear message
  ✓ empty SKILL.md fails
  ✓ SKILL.md with no frontmatter block fails
  ✓ frontmatter missing description fails
  ✓ description under 20 chars is flagged
  ✓ name mismatched with directory name is flagged
  ✓ missing "When to Activate" section is flagged
  ✓ minimal well-formed skill passes with zero findings

9 passed, 0 failed
```

To test **your own** new skill, point either file at it: `node docs/examples/skill-authoring/validate-skill.js skills/your-skill-name`, or copy `validate-skill.js` into your project and add one more `writeSkill(...)`/`validateSkillDir(...)` case to a copy of the `.test.js` file pointed at your real skill directory.

If you're contributing back to this ECC repo instead of a standalone project, also run the repo's own validator (broader scope, part of `npm test`):

```bash
node scripts/ci/validate-skills.js
```

Code examples inside the skill get their own check, per language (`docs/SKILL-DEVELOPMENT-GUIDE.md`):

```bash
npx tsc --noEmit skills/your-skill-name/examples/*.ts
python -m py_compile skills/your-skill-name/examples/*.py
go build ./skills/your-skill-name/examples/...
php -l skills/your-skill-name/examples/*.php   # one file at a time; php -l takes a single path
```

### 4b. Behavioral test — the canary check

Structural validation only proves the file is well-formed, not that Claude actually reaches for it. Run these probes from inside Claude Code, opened at a project where the skill is installed (`.claude/skills/your-skill-name/`):

1. **Does it trigger on the right task?** Describe a task that should match the `description` — for the worked example: *"I need to write a migration that drops the `legacy_notes` column from the `recipe` table."* Claude's answer should reference the guardrail checklist and anti-patterns unprompted. If it answers generically with no destructive-migration awareness, the skill isn't triggering — the fix is almost always tightening `description` (too vague to match your phrasing).
2. **Does it stay quiet on unrelated tasks?** Ask something clearly outside its domain (e.g. *"write a CSS grid layout"*) and confirm the skill's guidance does **not** leak in — an overly broad `description` triggers false positives too.
3. **Does the guardrail actually change behavior?** Ask Claude to perform the exact anti-pattern the skill warns about (for the worked example: *"add `ALTER TABLE recipe ADD COLUMN servings INT NOT NULL`"*) and confirm it flags the missing default / existing-rows risk rather than just doing it.
4. **If you added `allowed-tools`**: try to get Claude to use a tool outside that list while the skill is clearly active, and confirm it's unavailable/declines.

If a probe fails, check in this order: is the file at the right path (`.claude/skills/<name>/SKILL.md`, not `.claude/skills/<name>.md`)? Did the structural test (4a) actually pass? Is the `description` specific enough to match how you're actually phrasing the request?

---

## Files shipped with this guide

```
docs/examples/skill-authoring/
├── example-skill/
│   └── SKILL.md              # worked example: doctrine-migration-guard
├── validate-skill.js         # standalone structural validator (copy anywhere)
└── validate-skill.test.js    # real test suite for validate-skill.js — run it
```

## Checklist

- [ ] Directory name and frontmatter `name:` match
- [ ] `description` states both *what* and *when* — full sentence, not a label
- [ ] `## When to Activate` section with concrete triggers
- [ ] At least one Anti-Patterns pairing (bad example + corrected example)
- [ ] Placed correctly: `skills/` for an ECC contribution, `.claude/skills/` for a consuming project — never inside a demo/docs path that gets scanned as curated
- [ ] Guardrail level chosen deliberately (advisory checklist at minimum; `allowed-tools` if there's an obvious tool boundary; hook-enforced only for genuinely destructive failure modes)
- [ ] Structural check passes (`validate-skill.js` or `scripts/ci/validate-skills.js`)
- [ ] Canary check run — confirms the skill triggers on-target, stays quiet off-target, and its guardrail actually changes Claude's behavior on the anti-pattern it warns about
