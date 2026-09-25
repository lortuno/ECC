# Legacy Command Shims

This archive holds slash commands that were retired from the default plugin
command surface in favor of an equivalent skill.

They are **no longer loaded by the default plugin command surface** — `commands/` is the live, installed
set. These files exist only for **short-term migration compatibility**: if a
saved prompt, doc, or habit still types one of these slash commands, copy the
file back into `commands/` yourself, or (preferred) switch to the skill it
points at.

## Archive Contents

| Shim | Use this skill instead |
|------|-------------------------|
| `agent-sort.md` | `agent-sort` |
| `claw.md` | `nanoclaw-repl` (not bundled in this install — see note below) |
| `context-budget.md` | `context-budget` |
| `devfleet.md` | `claude-devfleet` (not bundled in this install — see note below) |
| `docs.md` | `documentation-lookup` |
| `e2e.md` | `e2e-testing` |
| `eval.md` | `eval-harness` |
| `orchestrate.md` | `dmux-workflows` / `autonomous-agent-harness` (not bundled in this install — see note below) |
| `prompt-optimize.md` | `prompt-optimizer` |
| `rules-distill.md` | `rules-distill` |
| `tdd.md` | `tdd-workflow` |
| `verify.md` | `verification-loop` |

## Note on unbundled targets

This install is trimmed to a PHP/JS/React/Azure engineering stack. Three
shims above (`claw`, `devfleet`, `orchestrate`) point at skills that were
intentionally dropped from `skills/` in that trim (`nanoclaw-repl`,
`claude-devfleet`, `dmux-workflows`, `autonomous-agent-harness`). The shim
files are kept here only so the archive stays complete and classifiable;
running them will not resolve to an installed skill unless you re-add the
target skill yourself.