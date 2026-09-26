---
name: spec-driven-development
description: Establishes specs/ at the project root as the single source of truth for what each feature is supposed to do. Every feature gets one spec file there, written before or alongside implementation, kept current as behavior changes, and treated as the first reference for any code update or documentation question — read before the code, updated after the code.
metadata:
  origin: CUSTOM
---

# Spec-Driven Development

Every feature in this project has exactly one spec file under `specs/`, and that
file — not memory, not a Slack thread, not "the code is the docs" — is the
authoritative description of what the feature is supposed to do. Code changes
start by reading the spec; they end by updating it.

This skill governs *behavioral* specs (what a feature does, for whom, under
what conditions). It complements, but does not replace:

- `architecture-decision-records` — *why* a technical choice was made
- `contract-first` — the wire-level schema of an API/event boundary
- `plan` / `blueprint` — the throwaway execution plan for *building* the
  feature (a spec outlives the plan; the plan is discarded once merged)

## When to Activate

- Starting a new feature, endpoint, command, hook, or skill that other code
  or people will depend on.
- Changing the behavior of an existing feature — read its spec first.
- Answering "how does X work?" or "what's supposed to happen when...?" — check
  `specs/` before reading source, and cite the spec in the answer.
- Reviewing a PR that touches a feature with a spec — verify the diff still
  matches the spec, or that the spec was updated alongside it.
- Onboarding a feature that has no spec yet (brownfield) — write one from the
  current behavior before changing anything, so the change has a documented
  baseline to diff against.

Do not create a spec for throwaway scripts, one-off migrations, or internal
helpers with no external behavior contract. If nothing outside the file would
notice a behavior change, a spec adds ceremony without value.

## The Rule

**Every feature is stored in `specs/` as one Markdown file, and that file is
consulted before any code change to the feature and updated after it.**

```
specs/
├── user-authentication.md
├── notification-preferences.md
└── export-csv.md
```

- One file per feature, kebab-case, matching the feature's common name —
  not its file path (`specs/user-authentication.md`, not
  `specs/src-auth-login-ts.md`).
- A feature that grows multiple related documents (API shape, data model,
  edge cases) becomes a folder: `specs/export-csv/spec.md` plus siblings —
  promote to a folder only when one file becomes unwieldy, not up front.
- The spec is versioned in git like any other source file. Its history *is*
  the feature's behavioral changelog.

## Spec Template

```markdown
# Spec: [Feature Name]

**Status**: draft | active | deprecated
**Owner**: [who to ask]
**Last updated**: YYYY-MM-DD (commit abc1234)

## Summary

One paragraph: what this feature does and for whom.

## Requirements

1. WHEN [condition/trigger] THEN [observable behavior].
2. WHEN [condition/trigger] THEN [observable behavior].
3. [Always-true invariant, no trigger needed.]

## Non-Goals

What this feature explicitly does not do — prevents scope creep from being
read back into the spec later as a "missing requirement."

## Design Notes

Key implementation decisions worth knowing before touching the code
(entry points, main files, non-obvious constraints). Link to an ADR in
`docs/adr/` instead of restating one if a decision is already recorded there.

## Open Questions

Unresolved edge cases or decisions still pending.

## Change Log

- YYYY-MM-DD: [what changed and why] (PR #NNN)
```

Keep Requirements testable and specific — "WHEN a user submits an empty form
THEN show a validation error listing every missing field" beats "handles
validation." A requirement that can't fail a test isn't one.

## Workflow

### 1. New feature

Before or alongside implementation (not after), create `specs/<feature>.md`
from the template above. Fill in Summary and Requirements first — Design
Notes and Open Questions can lag slightly behind as the implementation
settles. Set **Status: draft** until the feature ships, then flip to
**active**.

### 2. Changing an existing feature

1. Read `specs/<feature>.md` first. If it doesn't exist yet, write one from
   the current behavior before making the change — see Brownfield below.
2. Make the code change.
3. Update the spec in the same PR: add/modify the affected Requirement(s),
   append a Change Log entry, bump **Last updated**. A behavior change that
   doesn't touch the spec is a change nobody can trust the spec to describe
   anymore.

### 3. Answering a documentation question

Check `specs/` before reading source. If a matching spec exists, answer from
it and cite the file. If the code appears to contradict the spec, say so
explicitly — that's a signal the spec is stale or the code has a bug, not
something to quietly reconcile.

### 4. Brownfield (feature has no spec yet)

Write the spec from current, observed behavior — not from what the code
*should* do. Mark uncertain behavior instead of guessing:

```markdown
<!-- uncertainty: unclear whether empty input is rejected or silently trimmed -->
```

Set **Status: draft** until verified. This mirrors what `spec-miner`
automates for large, systematic extraction into `openspec/specs/`; use this
lighter manual path for a single feature.

### 5. Reviewing a PR

If the PR touches a feature under `specs/`, confirm the spec was updated when
behavior changed, or confirm explicitly that behavior didn't change. A PR
that modifies feature behavior without touching the spec is missing a file.

## Anti-Patterns

- **FAIL: Spec as afterthought.** Writing the spec after the code, from the
  code, produces a restatement of the implementation — it won't catch bugs
  or drift because it was generated from the same source it's meant to check.
- **FAIL: Letting the spec go stale.** A spec nobody trusts is worse than no
  spec — it actively misleads. If it's wrong, fix it in the same PR that
  found the discrepancy, don't defer it.
- **FAIL: One giant `specs/README.md` for everything.** Defeats searchability
  and makes diffs noisy — one feature, one file.
- **FAIL: Copying requirements verbatim from a ticket without verifying
  they match what was actually built.** The spec describes the shipped
  behavior, not the original ask.
- **FAIL: Vague requirements** ("handles errors gracefully") that can't be
  turned into a test and can't fail a review.

## Related Skills

- `architecture-decision-records` — records *why*, lives in `docs/adr/`
- `contract-first` — the API/event schema for cross-service boundaries
- `plan` (command) / `blueprint` — the disposable execution plan for
  building the feature; the spec is what remains afterward
- `spec-miner` (agent) — bulk, automated behavioral extraction for
  onboarding a whole brownfield codebase into `openspec/specs/`; use it for
  systematic multi-module mining, use this skill's manual path for a single
  feature
