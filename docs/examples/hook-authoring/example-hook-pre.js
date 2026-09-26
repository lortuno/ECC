#!/usr/bin/env node
/**
 * example-hook-pre.js — worked example: a PreToolUse hook that BLOCKS.
 *
 * This is the worked example referenced by HOW_TO_CREATE_A_HOOK.md — copy
 * the *pattern* (run()/main() split, JSON-in/JSON-out via stdin, exit 2 to
 * block), not necessarily this exact check, into your own hook.
 *
 * Named `example-hook-pre.js` (not e.g. `block-destructive-rm.js`) so it
 * can't be mistaken for a real shipped hook if scripts/hooks/ is scanned —
 * it is NOT registered in hooks/hooks.json and never runs automatically.
 *
 * Policy: blocks a Bash command that looks like `rm -rf` targeting an
 * absolute path (a simple, illustrative destructive-command check — see
 * scripts/hooks/ for ECC's real, more thorough Bash preflight dispatcher).
 *
 * Exit code 2 = block (PreToolUse only). Exit code 0 = allow.
 */

'use strict';

const DESTRUCTIVE_RM = /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)\s+\/(?:\S*)/;

/**
 * Exportable run() for in-process execution (e.g. via a run-with-flags.js
 * style dispatcher). Pure function: takes the hook payload, returns a result
 * describing the exit code and any message — never touches stdin/stdout
 * itself, so it's trivially unit-testable.
 *
 * @param {string|object} inputOrRaw - raw JSON string from stdin, or an already-parsed object
 * @returns {{exitCode: number, stderr?: string}}
 */
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
  if (DESTRUCTIVE_RM.test(command)) {
    return {
      exitCode: 2,
      stderr: `[Hook] BLOCKED: destructive "rm -rf" on an absolute path in: ${command}`,
    };
  }

  return { exitCode: 0 };
}

/**
 * Stdin entrypoint for direct/spawnSync execution. Only runs when invoked
 * directly (require.main === module guard below), so requiring this file
 * from a test never attaches a stdin listener to the parent process.
 */
function main() {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { data += chunk; });
  process.stdin.on('end', () => {
    const result = run(data);
    if (result.stderr) process.stderr.write(result.stderr + '\n');
    process.exitCode = result.exitCode;
  });
}

module.exports = { run, main };

if (require.main === module) {
  main();
}
