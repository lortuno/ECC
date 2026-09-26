# Installation Guide for Skills, Agents, and Hooks

This is a **consolidated entry point** — a short index over three deeper authoring guides plus this repo's real install mechanics, not a restatement of any of them. Each component type's full authoring detail (required frontmatter, worked example, structural + behavioral tests) lives in its own `HOW_TO_CREATE_A_*.md` at the repo root; this document ties those together with the mechanics of getting a component actually installed, verified, and rolled back if something goes wrong.

## Table of Contents

- [Quick-Reference Checklist](#quick-reference-checklist)
- [Prerequisites & Version Compatibility](#prerequisites--version-compatibility)
- [Installing a Skill](#installing-a-skill)
- [Installing an Agent](#installing-an-agent)
- [Installing a Hook](#installing-a-hook)
- [File Updates & Manifest Management](#file-updates--manifest-management)
- [Claude Integration](#claude-integration)
- [Verification & Testing](#verification--testing)
- [Common Errors & Edge Cases](#common-errors--edge-cases)
- [Use Cases Walkthrough](#use-cases-walkthrough)
- [References](#references)
- [Document History](#document-history)

---

## Quick-Reference Checklist

- [ ] Picked the right component type — see the three sections below if unsure which one fits
- [ ] Followed the matching `HOW_TO_CREATE_A_*.md` guide and its worked example under `docs/examples/`
- [ ] Ran the component's structural validator (see [Verification & Testing](#verification--testing))
- [ ] Placed it correctly — curated (`skills/`, `agents/`, `hooks/hooks.json`) vs. project-local (`.claude/`) vs. illustrative-only (`docs/examples/`) — see [Skill Placement Policy](SKILL-PLACEMENT-POLICY.md)
- [ ] Ran the canary (behavioral) check for that component type
- [ ] If contributing to this repo: added/updated the manifest entry and ran `npm test`

The full, checkbox-per-component version of this list lives in [INSTALLATION_CHECKLIST.md](INSTALLATION_CHECKLIST.md).

---

## Prerequisites & Version Compatibility

- Node.js ≥18, CommonJS only (no ESM/TypeScript in `scripts/`)
- `markdownlint-cli` for any new/edited `.md` file
- Git, for version control of curated components
- No Python dependencies are involved in creating a skill, agent, or hook in this repo — see [File Updates & Manifest Management](#file-updates--manifest-management) for where the spec's generic assumption about dependency files doesn't apply here

**Version compatibility**: if a new component uses a Claude Code feature (a newer hook event, a newer frontmatter field) not yet supported by the harness version you or your users are running, it will silently fail to trigger rather than error clearly. Check the harness changelog before relying on a very new feature, and see [Common Errors & Edge Cases](#common-errors--edge-cases) and `docs/TROUBLESHOOTING.md`'s "Installation Errors" section for the version-incompatibility symptom pattern.

---

## Installing a Skill

A skill is passive knowledge — Claude reads its `description` and decides whether the current task matches it. Full guide: [HOW_TO_CREATE_A_SKILL.md](../HOW_TO_CREATE_A_SKILL.md). Worked example: `docs/examples/skill-authoring/example-skill/`.

**Common mistakes:**
- Directory name and frontmatter `name:` don't match (several tooling paths, including the structural validator, flag this).
- `description` is a label ("Database migration help") instead of a full sentence naming both *what* and *when* — the single most common reason a correctly-placed skill never triggers.
- Placing an illustrative/demo skill under the real `skills/` catalog instead of `docs/examples/skill-authoring/` — that gets it picked up by `scripts/ci/validate-skills.js` and the install manifest scan as if it were a real curated skill.

## Installing an Agent

An agent is active delegation — a separate subagent spawned to run a bounded task and report back. Full guide: [HOW_TO_CREATE_AN_AGENT.md](../HOW_TO_CREATE_AN_AGENT.md). Worked example: `docs/examples/agent-authoring/example-agent.md`.

**Common mistakes:**
- Giving it `Task`/`Agent` in `tools:` expecting it to delegate further — no shipped agent in this repo does this; agents are always leaves in the call graph (see the guide's §2).
- Writing `tools:` as a YAML block or flow sequence instead of a comma-separated scalar — a real CI failure in `scripts/ci/validate-agents.js`, not just a style nit.
- An overly forceful `description` ("MUST BE USED for...") on a narrow-purpose agent, causing it to over-trigger on unrelated tasks.

## Installing a Hook

A hook is reactive interception — a shell command the harness runs around a matching tool call. Full guide: [HOW_TO_CREATE_A_HOOK.md](../HOW_TO_CREATE_A_HOOK.md). Worked example: `docs/examples/hook-authoring/`.

**Common mistakes:**
- Writing `matcher` as a JS boolean expression (`tool == "Bash" && ...`) instead of a plain tool-name string — this was documented in this repo's own now-deleted `CONTRIBUTING.md` and is wrong for the actual format.
- Using `exit 1` expecting it to block — only `exit 2` from a `PreToolUse` hook blocks; everything else is allow/warn or a logged error.
- Editing `hooks/hooks.json` without updating the aligned `hooks/hooks.metadata.json` sidecar and regenerating its fingerprint, which `node scripts/ci/validate-hooks.js` will catch and reject.

---

## File Updates & Manifest Management

This repo's real equivalents of the spec's generic "which files need updating" checklist:

| When you add... | Files that may need updating |
|---|---|
| A curated skill | `skills/<name>/SKILL.md` (new); `manifests/install-modules.json` if it should be selectively installable; `docs/COMMAND-AGENT-MAP.md` if a command should reference it |
| A curated agent | `agents/<name>.md` (new); `manifests/install-modules.json`; `docs/COMMAND-AGENT-MAP.md` if it's sequenced by a command |
| A real (functional) hook | `hooks/hooks.json` + `hooks/hooks.metadata.json` (both, aligned); `tests/hooks/<name>.test.js`; `hooks/README.md`'s type table |

**Ordered checklist** (do these in order — later steps depend on earlier ones):

1. Write the component file(s) following its `HOW_TO_CREATE_A_*.md` guide.
2. Run the component's structural validator (below).
3. Reference it in `manifests/install-modules.json` (only if it should be part of a selective install profile — plugin-loaded skills/agents/commands under `skills/`, `agents/`, `commands/` are already available with no manifest entry, per `README.md`'s "Skill and component installation" section).
4. For a hook: regenerate fingerprints (`node scripts/ci/validate-hooks.js --update-fingerprints`) and add its `tests/hooks/*.test.js`.
5. Run `npm test` (validators for agents/commands/rules/skills/hooks/manifests, plus `tests/run-all.js`) before committing.

**Rollback** (spec's Edge Case 5, "files updated but registration failed"): for an uncommitted partial change, `git checkout -- <files>` (or `git status` + selectively discard) restores the pre-edit state. For a change already applied to an installed (non-repo) location, `ecc doctor` diagnoses drift between the manifest and installed files, and `ecc repair` fixes it — see `README.md`'s install-mechanics section for the full `ecc plan`/`install`/`setup`/`doctor`/`repair` lifecycle.

**Where the spec's generic asks don't apply here** — stated plainly rather than fabricated: there is no `package.json` dependency change for adding a skill/agent/hook (CommonJS scripts use only Node's stdlib unless a specific hook script genuinely needs an npm package); there is no `requirements.txt` (no Python involved in these three component types); there is no root `MANIFEST.md` — the closest analogs are `manifests/install-modules.json` (machine-readable component listing) and `docs/releases/<version>/release-notes.md` (human-readable changelog, one per release).

---

## Claude Integration

How this actually works, as opposed to a generic routing/injection model:

- **Skills and agents are both selected the same way**: Claude reads the `description` field and decides at run time whether the current task matches. There is no separate routing engine or lookup table — see `README.md`'s "How skills get triggered" section, which this reuses. The `CLAUDE.md` file/skill table is guidance for Claude to follow, not a hook-enforced rule.
- **Agents are leaves**: an agent cannot invoke another agent (none has `Task`/`Agent` in `tools:`). Multi-agent sequencing is documented in a **command** `.md` file (e.g. `commands/orch-add-feature.md`), never inside one agent calling another — see `HOW_TO_CREATE_AN_AGENT.md` §2.
- **Hooks fire on tool calls, not on Claude's decisions**: a hook's matcher is checked by the harness against every matching tool call, regardless of what Claude intended — see `HOW_TO_CREATE_A_HOOK.md` and `hooks/README.md`'s dispatch chain.

This differs from the spec's imagined "agent context injection"/"skill versioning in Claude requests" plumbing — no such mechanism exists in this repo; don't look for it.

---

## Verification & Testing

| Spec's generic test plan | Real command in this repo |
|---|---|
| Structural check per component | `node docs/examples/skill-authoring/validate-skill.js <dir>`, `node docs/examples/agent-authoring/validate-agent.js <file>`, `node docs/examples/hook-authoring/validate-hook-example.js` (or the real CI validators below) |
| CI-equivalent structural check | `node scripts/ci/validate-skills.js`, `node scripts/ci/validate-agents.js`, `node scripts/ci/validate-hooks.js` |
| Behavioral / canary check | Each `HOW_TO_CREATE_A_*.md`'s "4b/5b" section — install for real, probe on-target and off-target triggering |
| Full regression suite | `node tests/run-all.js` |
| Full CI-equivalent suite | `npm test` (unicode safety, agents, commands, rules, skills, hooks, hook schema keys, install manifests, no personal paths, catalog, command registry, `tests/run-all.js`) |

---

## Common Errors & Edge Cases

Full symptom/cause/fix write-ups: `docs/TROUBLESHOOTING.md` → "Installation Errors". Summary:

- **Name conflicts** — a skill/agent name collides with an existing one, or a directory name and frontmatter `name:` mismatch. See Troubleshooting.
- **Hook execution order dependencies** — hook B needs to run after hook A but is registered first. `node scripts/ci/validate-hooks.js` (or `docs/examples/hook-authoring/validate-hook-example.js` for a standalone project) is the validation tool for this — see Troubleshooting and `HOW_TO_CREATE_A_HOOK.md` §3.
- **Missing dependencies** — a hook script requires an npm package or external CLI that isn't installed. See Troubleshooting.
- **Version incompatibility** — a component uses a harness feature newer than the installed Claude Code version supports. See [Prerequisites & Version Compatibility](#prerequisites--version-compatibility) and Troubleshooting.
- **Partial installation failure** — files updated but registration failed. See the Rollback subsection above and Troubleshooting.

---

## Use Cases Walkthrough

Restating the spec's own three scenarios in this repo's real steps, keeping the spec's stated time estimates as concrete, checkable targets.

**UC-1: First skill (≈15 min)** — read `HOW_TO_CREATE_A_SKILL.md` §1–2 → `mkdir .claude/skills/your-skill-name` → write `SKILL.md` from the required shape → run `node docs/examples/skill-authoring/validate-skill.js .claude/skills/your-skill-name` → open Claude Code in that project and confirm it triggers on a matching task (§4b probe 1).

**UC-2: Agent with pre/post hooks (≈45 min)** — this is also the spec's requested "integrated" example tying all three component types together in one walkthrough, rather than a fifth standalone code file: read `HOW_TO_CREATE_AN_AGENT.md` and `HOW_TO_CREATE_A_HOOK.md` → write the agent's `.md` and its `tools:`/`model:` per the guide → write the `PreToolUse`/`PostToolUse` hook pair following `docs/examples/hook-authoring/` (correct matcher, exit codes, fingerprints) → register both hooks in `hooks/hooks.json` + `hooks/hooks.metadata.json`, regenerate fingerprints → document the agent-hook sequencing in a command file per `HOW_TO_CREATE_AN_AGENT.md` §2 → run `node scripts/ci/validate-hooks.js` and the agent's structural check → canary-test the full chain: hook fires, agent gets delegated to, sequencing happens as documented.

**UC-3: Updating an existing skill's metadata (≈10 min)** — edit `SKILL.md`'s frontmatter → if the directory or manifest reference needs to change, update `manifests/install-modules.json` → update any doc that names the old value (e.g. `docs/COMMAND-AGENT-MAP.md` if a command references it by name) → re-run the structural validator → commit with a conventional-commit message per this repo's commit workflow rule.

---

## References

- [Claude Code documentation](https://docs.claude.com/en/docs/claude-code) (external)
- `../CLAUDE.md` — project-wide conventions and the Skills table
- `../hooks/README.md` — full hook lifecycle, event tables, and exit-code reference
- `SKILL-PLACEMENT-POLICY.md` — where each skill type is stored
- `MCP-CONNECTOR-POLICY.md` — when a capability should be an MCP server vs. a skill
- `../README.md` — architecture overview and the `ecc` CLI install mechanics

## Document History

| Date | Change |
|---|---|
| 2026-09-26 | Initial version — consolidates skill/agent/hook installation, adds the hook-authoring guide and worked example this document links to |
