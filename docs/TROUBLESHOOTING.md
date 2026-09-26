# Troubleshooting

Community-reported workarounds for current Claude Code bugs that can affect ECC users.

These are upstream Claude Code behaviors, not ECC bugs. The entries below summarize the production-tested workarounds collected in [issue #644](https://github.com/affaan-m/everything-claude-code/issues/644) on Claude Code `v2.1.79` (macOS, heavy hook usage, MCP connectors enabled). Treat them as pragmatic stopgaps until upstream fixes land.

## Community Workarounds For Open Claude Code Bugs

### False "Hook Error" labels on otherwise successful hooks

**Symptoms:** Hook runs successfully, but Claude Code still shows `Hook Error` in the transcript.

**What helps:**

- Consume stdin at the start of the hook (`input=$(cat)` in shell hooks) so the parent process does not see an unconsumed pipe.
- For simple allow/block hooks, send human-readable diagnostics to stderr and keep stdout quiet unless your hook implementation explicitly requires structured stdout.
- Redirect noisy child-process stderr when it is not actionable.
- Use the correct exit codes: `0` allows, `2` blocks, other non-zero exits are treated as errors.

**Example:**

```bash
# Good: block with stderr message and exit 2
input=$(cat)
echo "[BLOCKED] Reason here" >&2
exit 2
```

### Earlier-than-expected compaction with `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`

**Symptoms:** Lowering `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` causes compaction to happen sooner, not later.

**What helps:**

- On some current Claude Code builds, lower values may reduce the compaction threshold instead of extending it.
- If you want more working room, remove `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` and prefer manual `/compact` at logical task boundaries.
- Use ECC's `strategic-compact` guidance instead of forcing a lower auto-compact threshold.

### MCP connectors look connected but fail after compaction

**Symptoms:** Gmail or Google Drive MCP tools fail after compaction even though the connector still looks authenticated in the UI.

**What helps:**

- Toggle the affected connector off and back on after compaction.
- If your Claude Code build supports it, add a `PostCompact` reminder hook that warns you to re-check connector auth after compaction.
- Treat this as an auth-state recovery step, not a permanent fix.

### Hook edits do not hot-reload

**Symptoms:** Changes to `settings.json` hooks do not take effect until the session is restarted.

**What helps:**

- Restart the Claude Code session after changing hooks.
- Advanced users sometimes script a local `/reload` command around `kill -HUP $PPID`, but ECC does not ship that because it is shell-dependent and not universally reliable.

### Repeated `529 Overloaded` responses

**Symptoms:** Claude Code starts failing under high hook/tool/context pressure.

**What helps:**

- Reduce tool-definition pressure with `ENABLE_TOOL_SEARCH=auto:5` if your setup supports it.
- Lower `MAX_THINKING_TOKENS` for routine work.
- Route subagent work to a cheaper model such as `CLAUDE_CODE_SUBAGENT_MODEL=haiku` if your setup exposes that knob.
- Disable unused MCP servers per project.
- Compact manually at natural breakpoints instead of waiting for auto-compaction.

## ECC Dashboard Does Not Start

**Symptoms:** `npm run dashboard` or `python3 ecc_dashboard.py` fails, often with `ModuleNotFoundError: No module named 'tkinter'`.

**What helps:**

- The GUI dashboard needs Tkinter, which many Python installs omit:
  - Debian/Ubuntu: `sudo apt-get install python3-tk`
  - Fedora: `sudo dnf install python3-tkinter`
  - macOS (Homebrew): `brew install python-tk`
  - Windows: re-run the python.org installer and enable "tcl/tk and IDLE"
- Or use the browser dashboard, which only needs Node: `npm run dashboard:web`, then open the printed localhost URL.
- Both commands must be run from a full clone of the ECC repo (`git clone https://github.com/affaan-m/ECC`), not from inside the Claude Code plugin directory — plugin installs do not ship `package.json` scripts.

## Anthropic Cyber Safeguards Block Security Audits Of Your Own Code

**Symptoms:** Running security reviews/audits (e.g. `ecc:security-reviewer`) fails with an API error citing the Usage Policy and "cyber-related safeguards", even though you are auditing your own codebase.

**What helps:**

- This is an upstream Anthropic model-level safeguard, not GateGuard and not an ECC block. No ECC configuration can bypass it.
- Apply to Anthropic's [Cyber Verification Program](https://claude.com/form/cyber-use-case) — the error message includes a tokenized link for your account. Approved accounts get legitimate security workflows unblocked.
- Until approved, structure prompts defensively: state up front that you own the code and the goal is remediation ("review this module I own for vulnerabilities and propose fixes"), keep scope to one module at a time, and avoid exploit-generation phrasing ("write a PoC", "craft a payload").
- Prefer remediation-oriented skills (`security-review`, `security-scan`) over offensive framing, and run static tooling (semgrep, bandit, `npm audit`) yourself, then ask the model to interpret results.

## Installation Errors

Errors encountered while installing or authoring a skill, agent, or hook in this repo — distinct from the upstream Claude Code CLI bugs above. Full context: [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md).

### Skill/agent name conflicts

**Symptoms:** A new skill or agent shares a name with an existing one, or its directory name and frontmatter `name:` don't match.

**What helps:**

- Directory name and frontmatter `name:` must match exactly — `node docs/examples/skill-authoring/validate-skill.js <dir>` and `node docs/examples/agent-authoring/validate-agent.js <file>` both flag a mismatch.
- Before naming a new curated component, check `skills/` / `agents/` for an existing name collision (`ls skills/`, `ls agents/`).
- For a project-local skill under `.claude/skills/`, a name collision with a curated skill of the same name is not itself an error, but is confusing — prefer a distinct name.

### Hook execution order dependencies

**Symptoms:** Hook B is supposed to run after hook A, but fires first (or vice versa) because array order in `hooks/hooks.json` doesn't match the intended dependency.

**What helps:**

- Execution order is array order within the same event — reorder the `hooks.json` entries directly.
- When reordering, move the matching `hooks/hooks.metadata.json` sidecar entries **first**, then run `node scripts/ci/validate-hooks.js --update-fingerprints` to refresh fingerprints, then `node scripts/ci/validate-hooks.js` (no flag) to confirm alignment.
- See [HOW_TO_CREATE_A_HOOK.md](../HOW_TO_CREATE_A_HOOK.md) §3 and `docs/examples/hook-authoring/validate-hook-example.js` for a standalone-project version of the same check.

### Missing dependencies

**Symptoms:** A hook script (or a skill's example code) requires an npm package or external CLI (e.g. `prettier`, `tsc`, `ruff`) that isn't installed, and fails silently or with a cryptic error.

**What helps:**

- Hook scripts in this repo use only Node's stdlib by default — if yours needs an npm package, wrap the call in a `try/catch` (see `hooks/README.md`'s "Auto-format Python files with ruff" recipe, which swallows the error if the external tool is missing) rather than letting it throw uncaught.
- For a skill's example code in another language, run that language's own compile/lint check (`npx tsc --noEmit`, `python -m py_compile`, `go build`, `php -l`) before shipping the example, per `docs/SKILL-DEVELOPMENT-GUIDE.md`.

### Claude/harness version incompatibility

**Symptoms:** A component that uses a newer Claude Code feature (a hook event, a frontmatter field) silently never triggers on an older harness version, with no error.

**What helps:**

- Check the installed Claude Code version's changelog before relying on a very new feature.
- Test the component's canary check (each `HOW_TO_CREATE_A_*.md`'s behavioral section) on the actual harness version your users will run, not just your own.
- If a feature is genuinely unavailable, gate on it defensively rather than assuming it's present — for a hook, feature-detect using `ECC_HOOK_PROFILE`/`ECC_DISABLED_HOOKS` conventions rather than a hard dependency.

### Partial installation failure / rollback

**Symptoms:** Component files were written/updated, but registration failed partway through (e.g. `hooks.json` updated but the sidecar wasn't, or a manifest entry was added but the file it points to doesn't exist).

**What helps:**

- For an uncommitted partial edit: `git status` to see what changed, then `git checkout -- <files>` to discard just the broken files.
- For a change already applied to an installed (non-repo) location: `ecc doctor` diagnoses drift between the manifest and installed files; `ecc repair` fixes it. See `README.md`'s "Skill and component installation" section for the full `ecc plan`/`install`/`setup`/`doctor`/`repair` lifecycle.
- For a hook specifically: `node scripts/ci/validate-hooks.js` fails loudly on any `hooks.json`/`hooks.metadata.json` drift, so a partial hook registration cannot silently pass CI.

## Related ECC Docs

- [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md) for the consolidated skill/agent/hook installation walkthrough.
- [../HOW_TO_CREATE_A_SKILL.md](../HOW_TO_CREATE_A_SKILL.md), [../HOW_TO_CREATE_AN_AGENT.md](../HOW_TO_CREATE_AN_AGENT.md), [../HOW_TO_CREATE_A_HOOK.md](../HOW_TO_CREATE_A_HOOK.md) for full per-component authoring guides.
- [hook-bug-workarounds.md](./hook-bug-workarounds.md) for the shorter hook/compaction/MCP recovery checklist.
- [hooks/README.md](../hooks/README.md) for ECC's documented hook lifecycle and exit-code behavior.
- [token-optimization.md](./token-optimization.md) for cost and context management settings.
- [issue #644](https://github.com/affaan-m/everything-claude-code/issues/644) for the original report and tested environment.
