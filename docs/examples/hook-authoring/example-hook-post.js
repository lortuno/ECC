#!/usr/bin/env node
/**
 * example-hook-post.js — worked example: a PostToolUse hook that WARNS ONLY.
 *
 * This is the worked example referenced by HOW_TO_CREATE_A_HOOK.md — copy
 * the *pattern*, not necessarily this exact check, into your own hook.
 *
 * Named `example-hook-post.js` so it can't be mistaken for a real shipped
 * hook — it is NOT registered in hooks/hooks.json and never runs
 * automatically.
 *
 * Policy: warns (never blocks) when an Edit/Write leaves a `console.log(`
 * call in the new content. Demonstrates the PostToolUse-can't-block rule
 * from HOW_TO_CREATE_A_HOOK.md — even a hook written to `process.exit(2)`
 * here would have no effect, because the tool has already run by the time
 * PostToolUse fires.
 */

'use strict';

const CONSOLE_LOG = /console\.log\s*\(/;

/**
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

  const filePath = String(input?.tool_input?.file_path || '');
  const content = String(input?.tool_input?.content || input?.tool_input?.new_string || '');

  if (CONSOLE_LOG.test(content)) {
    return {
      exitCode: 0, // PostToolUse cannot block regardless of exit code — this is illustrative, not enforcement
      stderr: `[Hook] WARNING: console.log left in ${filePath || '(unknown file)'}`,
    };
  }

  return { exitCode: 0 };
}

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
