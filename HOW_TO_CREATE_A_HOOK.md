# HOW_TO_CREATE_A_HOOK.md

A hook is **reactive interception** — a shell command the Claude Code harness runs synchronously (or async) around a tool call, wired declaratively in `hooks/hooks.json`. That's different from an **agent** (active delegation Claude chooses to spawn) or a **skill** (passive knowledge Claude folds into the conversation when it matches a task) — see [HOW_TO_CREATE_AN_AGENT.md](HOW_TO_CREATE_AN_AGENT.md) and [HOW_TO_CREATE_A_SKILL.md](HOW_TO_CREATE_A_SKILL.md) for those. A hook never decides to run itself; the harness runs it every time its matcher fires, whether or not it's relevant.

This guide covers **writing it properly**, **hook types & lifecycle**, **registration & execution order**, and **testing it**. A fully worked example — including a real, runnable structural validator and test suite — ships at `docs/examples/hook-authoring/`.

> **Do not** reuse the hook format previously documented in this repo's `CONTRIBUTING.md`. That file described JS-expression matchers (`tool == "Bash" && tool_input.command matches "..."`) and `exit 1` to block a tool call. Neither is correct for the format actually in use — see below.

---

## 1. Write it properly

### The real two-file contract

A hook isn't one file — it's an entry in `hooks/hooks.json` (the executable graph) plus an aligned entry in `hooks/hooks.metadata.json` (a sidecar carrying a stable `id`, human-readable `description`, and a `fingerprint`):

```json
// hooks/hooks.json — one matcher entry
{
  "matcher": "Bash",
  "hooks": [
    { "type": "command", "command": "node scripts/hooks/your-hook.js" }
  ]
}
```

```json
// hooks/hooks.metadata.json — the aligned sidecar entry, same event, same index
{
  "id": "pre:bash:your-hook",
  "description": "One sentence: what it checks and what it does when it matches",
  "fingerprint": "0123456789ab"
}
```

Why two files: Claude Code validates a plugin's `hooks.json` against its own schema and reports `id`/`description` as unknown keys if they're present there, so those fields live in the sidecar instead and get merged back in by `scripts/lib/hooks-config.js` for everything else in ECC (installer, validator, dashboard) that needs them. `node scripts/ci/validate-hooks.js` fails the build if the two files drift apart — see "Registration" below.

**`matcher` is always a plain tool-name string** — `"Bash"`, `"Write"`, `"Edit|Write|MultiEdit"`, `".*"` — never a boolean expression like `tool == "Bash" && tool_input.command matches "rm -rf"`. That expression syntax is what the old `CONTRIBUTING.md` showed and it does not match how `hooks.json` actually works; a hook script inspects `tool_input` itself, in code, after being invoked.

### Hook script shape

Model a new hook on `scripts/hooks/doc-file-warning.js` — a real shipped `PreToolUse`/`Write` hook:

```javascript
'use strict';

function run(inputOrRaw) {
  let input;
  try {
    input = typeof inputOrRaw === 'string'
      ? (inputOrRaw.trim() ? JSON.parse(inputOrRaw) : {})
      : (inputOrRaw || {});
  } catch {
    return { exitCode: 0 };
  }

  const command = String(input?.tool_input?.command || '');
  if (/rm\s+-rf\s+\//.test(command)) {
    return { exitCode: 2, stderr: '[Hook] BLOCKED: destructive rm -rf on an absolute path' };
  }
  return { exitCode: 0 };
}

function main() {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => { data += c; });
  process.stdin.on('end', () => {
    const result = run(data);
    if (result.stderr) process.stderr.write(result.stderr + '\n');
    process.exitCode = result.exitCode;
  });
}

module.exports = { run, main };
if (require.main === module) main();
```

The `run()`/`main()` split isn't a stylistic choice — `run()` is what `scripts/hooks/run-with-flags.js` calls in-process (skipping the ~50–100ms `spawnSync` overhead), while `main()` is the stdin entrypoint used when the hook is invoked as a standalone process. Export both, and guard `main()` behind `require.main === module` so requiring the file for tests never leaks a stdin listener onto the parent process.

### Exit-code contract

| Exit code | Meaning | Applies to |
|---|---|---|
| `0` | Allow / continue (a warning can still be attached via stderr or `additionalContext`) | Every hook type |
| `2` | **Block** the tool call | **`PreToolUse` only** |
| other non-zero | Treated as an error — logged, does **not** block | Every hook type |

`exit 1` does **not** block anything — it is silently logged as an error. If a hook needs to stop a tool call, it must `exit 2` from a `PreToolUse` hook specifically; a `PostToolUse` hook structurally cannot block at all, no matter its exit code, because the tool has already run.

### The `fingerprint` field

Index alignment between `hooks.json` and `hooks.metadata.json` can't by itself tell a reordered pair from a correct one, so every sidecar entry carries a `fingerprint`: a 12-character sha256 prefix of `{matcher, hooks}` (keys sorted, so key order doesn't matter — see `fingerprintHookEntry`/`stableStringify` in `scripts/lib/hooks-config.js`). A mismatch means the matcher entry and its sidecar description drifted apart — either the pair was reordered without moving both files together, or a hook's command changed without regenerating the fingerprint.

Regenerate it with the real command, never by hand:

```bash
node scripts/ci/validate-hooks.js --update-fingerprints
```

---

## 2. Hook types & lifecycle

Real event types in this repo, one example each (full tables: `hooks/README.md`):

| Event | Can block? | Real example |
|---|---|---|
| `PreToolUse` | Yes (`exit 2`) | Dev-server blocker, GateGuard fact-forcing, doc-file-warning (warns only) |
| `PostToolUse` | No | Prettier auto-format, TypeScript check, console.log warning |
| `SessionStart` | N/A | Loads previous context, detects package manager |
| `Stop` | N/A | Console.log audit, session summary, pattern extraction |
| `PreCompact` | N/A | Saves state before context compaction |
| `SessionEnd` | N/A | Lifecycle marker / cleanup log |

Mapped onto the spec's generic "pre-processing / post-processing / conditional / event-driven" categories: `PreToolUse` is pre-processing and the only conditional/blocking type; `PostToolUse` is post-processing; `SessionStart`/`Stop`/`PreCompact`/`SessionEnd` are lifecycle (event-driven) hooks tied to session boundaries rather than a specific tool call.

**Lifecycle in practice** (initialization → execution → error → cleanup):

1. **Initialization** — the harness resolves the hook command via an inline `node -e` bootstrap (`scripts/hooks/plugin-hook-bootstrap.js`) that locates the ECC root regardless of plugin/manual/repo-checkout install, then dispatches through `scripts/hooks/run-with-flags.js`.
2. **Execution** — `run-with-flags.js` checks `ECC_HOOK_PROFILE` (`minimal`/`standard`/`strict`) and `ECC_DISABLED_HOOKS` (comma-separated hook `id`s) before calling the hook's `run()`.
3. **Error states** — a non-zero, non-2 exit is logged as an error and does not block; malformed/oversized stdin should be handled defensively (`doc-file-warning.js`'s `MAX_DIRECT_STDIN_BYTES` guard is the pattern to copy) rather than throwing.
4. **Cleanup/teardown** — there isn't a separate teardown phase for per-tool-call hooks; the closest equivalent is a `SessionEnd` hook for session-level cleanup. Don't invent a teardown step that doesn't exist for `PreToolUse`/`PostToolUse` hooks.

---

## 3. Registration & execution order

1. Add the matcher entry to `hooks/hooks.json`.
2. Add the aligned entry (`id`, `description`) at the **same event, same array index** in `hooks/hooks.metadata.json`.
3. Regenerate fingerprints: `node scripts/ci/validate-hooks.js --update-fingerprints`.
4. Confirm it lines up: `node scripts/ci/validate-hooks.js` (no flag — fails on any mismatch).

**Execution order is array order** within the same event. If hook B must run after hook A, put A's entry before B's entry in the array. When reordering existing hooks, **move the matching `hooks.metadata.json` entries first** — `withRefreshedFingerprints()` in `scripts/lib/hooks-config.js` detects a fingerprint that reappears at a different position and refuses to regenerate until the sidecar entry is moved to match, specifically to stop an order dependency (spec's Edge Case 2: "Hook B depends on Hook A, but Hook A is registered after Hook B") from being silently miscorrected. `node scripts/ci/validate-hooks.js` is the validation tool for this class of problem — run it after any reordering, not just after adding a new hook.

---

## 4. Test it

### 4a. Structural test

`docs/examples/hook-authoring/validate-hook-example.js` — standalone, dependency-free, reimplements the fingerprint/alignment checks against the illustrative pair shipped alongside it:

```bash
node docs/examples/hook-authoring/validate-hook-example.js
```

`docs/examples/hook-authoring/validate-hook-example.test.js` is a real assert-based test suite, matching this repo's own `tests/*.test.js` style:

```bash
node docs/examples/hook-authoring/validate-hook-example.test.js
```

If you're contributing an actual hook to this repo, run the real validator instead: `node scripts/ci/validate-hooks.js` (part of `npm test`). A **functional** hook contributed here also needs its own test under `tests/hooks/*.test.js` — `tests/hooks/doc-file-warning.test.js` is the pattern to copy (spawn the script with `spawnSync`, assert on exit code and stdout/stderr shape, plus a regression case proving `require()`-ing it doesn't leak a stdin listener). The **illustrative** example shipped with this guide is deliberately unregistered (not in `hooks/hooks.json`, not in `tests/run-all.js`) and doesn't need one, matching the precedent already set by `docs/examples/agent-authoring/example-agent.md` and `docs/examples/skill-authoring/example-skill/`.

### 4b. Behavioral test — the canary check

Structural validation only proves the files are well-formed and aligned — it doesn't prove the hook actually fires or blocks in a live session. Install it for real (`hooks-runtime` module, via `install.sh`/`ecc install`, or a plugin reload) and check:

1. **Does it fire on the matching tool call?** Trigger the exact `tool_name`/`tool_input` shape the matcher targets and confirm the hook's stdout/stderr/exit code shows up.
2. **Does it correctly *not* fire on a non-matching call?** A too-broad matcher (`".*"` when you meant `"Bash"`) fires on everything — confirm it's silent on an unrelated tool.
3. **Does the exit code actually do what you think?** For a blocking hook, confirm `exit 2` from `PreToolUse` genuinely stops the tool call in the transcript — don't assume; the `exit 1`-blocks belief is exactly the kind of mistake this guide exists to prevent.
4. **Does `validate-hooks.js` still pass after your change?** Confirms `hooks.json` and the sidecar didn't drift.

If a probe fails: re-run 4a first, then check the matcher is a plain tool-name string, then check you're testing the actual event (`PreToolUse` vs `PostToolUse`) your hook is registered under.

---

## Files shipped with this guide

```
docs/examples/hook-authoring/
├── example-hook-pre.js            # runnable PreToolUse hook: blocks a destructive Bash pattern
├── example-hook-post.js           # runnable PostToolUse hook: warns only (cannot block)
├── example-hooks.json             # illustrative hooks.json snippet wiring both in
├── example-hooks.metadata.json    # aligned sidecar for the snippet above, correct fingerprints
├── validate-hook-example.js       # standalone structural validator (copy anywhere)
└── validate-hook-example.test.js  # real test suite for validate-hook-example.js — run it
```

## Checklist

- [ ] `matcher` is a plain tool-name string, never a JS expression
- [ ] `hooks.json` and `hooks.metadata.json` stay index-aligned per event
- [ ] Fingerprints regenerated via `node scripts/ci/validate-hooks.js --update-fingerprints`, never by hand
- [ ] `exit 2` used to block, and only from `PreToolUse` — everything else is allow/warn or a logged error
- [ ] Execution order considered: array position within the event, sidecar moved before fingerprints are refreshed
- [ ] `run()`/`main()` split with `require.main === module` guard, matching `doc-file-warning.js`
- [ ] A **functional** hook contributed to this repo has a matching `tests/hooks/*.test.js`; an **illustrative** example stays unregistered
- [ ] Structural check passes (`validate-hook-example.js` or `scripts/ci/validate-hooks.js`)
- [ ] Canary check run — confirms the hook fires on-target, stays silent off-target, and the exit code does what you expect
