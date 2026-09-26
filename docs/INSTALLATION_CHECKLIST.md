# Installation Checklist

Standalone, checkbox-per-item checklist for installing a skill, agent, or hook. For the *why* behind any item here, see [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md) — this file is deliberately terse; that one has the explanations.

## Skill

- [ ] Directory name and frontmatter `name:` match exactly
- [ ] `description` is a full sentence stating both *what* and *when*
- [ ] `## When to Activate` section present with concrete triggers
- [ ] At least one Anti-Patterns pairing (bad example + corrected example)
- [ ] Placed correctly: `skills/` (ECC contribution) or `.claude/skills/` (consuming project) — never under `docs/examples/`
- [ ] Guardrail level chosen deliberately (advisory checklist at minimum)
- [ ] `node docs/examples/skill-authoring/validate-skill.js <dir>` passes
- [ ] Canary check: triggers on-target, quiet off-target, guardrail changes behavior on the anti-pattern

## Agent

- [ ] `name` matches the filename; `description` states what/when/how forcefully
- [ ] `tools:` is a comma-separated scalar (not a YAML sequence), narrowest set that does the job
- [ ] No `Task`/`Agent` in `tools:`
- [ ] `model:` matches the actual reasoning weight (`opus` only for open-ended architecture)
- [ ] Prompt Defense Baseline block present, verbatim
- [ ] Explicit output format section
- [ ] `node docs/examples/agent-authoring/validate-agent.js <file>` passes
- [ ] Canary check: delegated to on-target, silent off-target, tool restriction holds

## Hook

- [ ] `matcher` is a plain tool-name string, never a JS expression
- [ ] `hooks/hooks.json` and `hooks/hooks.metadata.json` stay index-aligned per event
- [ ] Fingerprints regenerated via `node scripts/ci/validate-hooks.js --update-fingerprints`
- [ ] `exit 2` used to block, only from `PreToolUse`
- [ ] Execution order considered (array position; sidecar moved before fingerprint refresh)
- [ ] A functional hook has a matching `tests/hooks/*.test.js`
- [ ] `node scripts/ci/validate-hooks.js` (or `docs/examples/hook-authoring/validate-hook-example.js`) passes
- [ ] Canary check: fires on-target, silent off-target, exit code behaves as expected

## File Updates & Rollback (any component type)

- [ ] Component file(s) written and structurally validated
- [ ] `manifests/install-modules.json` updated, if it should be selectively installable
- [ ] `docs/COMMAND-AGENT-MAP.md` updated, if a command sequences it
- [ ] `npm test` passes before committing
- [ ] If something goes wrong mid-update: `git checkout -- <files>` for an uncommitted partial edit, or `ecc doctor`/`ecc repair` for a drifted installed location

## After installing

- [ ] Behavioral (canary) check run inside a real Claude Code session
- [ ] If this was a repo contribution: `npm test` green, PR opened per this repo's commit/PR conventions
