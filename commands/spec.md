---
description: Create or update a feature's spec under specs/ — the persistent reference for that feature's intended behavior, consulted before any future code change or documentation question.
argument-hint: "[feature-name | path/to/specs/*.md]"
---

# Spec Command

Creates or updates one feature's spec file under `specs/`, following the
`spec-driven-development` skill. Load that skill for the full template,
workflow, and anti-patterns — this command just drives it.

## Input Modes

| Input | Mode | Behavior |
|---|---|---|
| `specs/existing-feature.md` | Update mode | Read the existing spec, update Requirements/Design Notes/Open Questions to match the change under discussion, append a Change Log entry |
| `feature-name` (no existing file) | New spec mode | Create `specs/{kebab-case-name}.md` from the template |
| Empty input, existing feature discussed in conversation | Brownfield mode | Infer the feature name, check whether `specs/{slug}.md` already exists, and either update or create it from observed current behavior |

## What This Command Does

1. **Resolve the target file** — `specs/{kebab-case-feature-name}.md`. Check
   if it already exists before creating a new one; specs are one-per-feature,
   never duplicated under a slightly different name.
2. **Gather requirements** — from the conversation, the codebase (for
   brownfield/update mode), or by asking clarifying questions if neither
   gives enough to write a testable Requirement.
3. **Write or update the spec** using the template in the
   `spec-driven-development` skill: Summary, Requirements (WHEN/THEN,
   testable), Non-Goals, Design Notes, Open Questions, Change Log.
4. **Update mode only**: never silently overwrite an existing Requirement —
   show the diff (old vs. new wording) and append a Change Log line with
   today's date and, if known, the PR number.
5. **Report the path** written and stop. Do not start implementing the
   feature as part of this command — use `/plan` or `/feature-dev` for that,
   pointing them at the spec you just wrote.

## Example Usage

```
User: /spec export-csv

Assistant:
Created specs/export-csv.md:

# Spec: Export CSV
**Status**: draft
...
## Requirements
1. WHEN a user clicks "Export" on a filtered table THEN download a CSV
   containing only the currently filtered rows.
2. WHEN the filtered result set is empty THEN show a message instead of
   downloading an empty file.
...

Spec written to specs/export-csv.md. Use /plan or /feature-dev to implement it.
```

## Integration

- Before changing behavior of a feature that already has a spec, read it
  first — do this even without invoking `/spec` explicitly.
- After `/plan` or `/feature-dev` implements a feature, run `/spec` to
  capture what actually got built if a spec doesn't exist yet, or to update
  the existing one.
- `/code-review` should flag a PR that changes feature behavior without a
  matching spec update.
