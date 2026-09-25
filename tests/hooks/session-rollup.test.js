/**
 * Tests for scripts/hooks/session-rollup.js
 *
 * Every case that touches the filesystem uses an isolated HOME (and clears
 * ECC_AGENT_DATA_HOME, which resolves before HOME/USERPROFILE — see the
 * leak this pattern exists to avoid, fixed in cost-tracker.test.js and
 * session-activity-tracker.test.js alongside this file).
 *
 * Run with: node tests/run-all.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { run } = require('../../scripts/hooks/session-rollup');
const { readSessionRows } = require('../../scripts/lib/session-rollup');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    failed++;
  }
}

function withIsolatedHome(fn) {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-rollup-hook-test-'));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  const previousAgentDataHome = process.env.ECC_AGENT_DATA_HOME;
  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir;
  delete process.env.ECC_AGENT_DATA_HOME;
  try {
    return fn(homeDir);
  } finally {
    if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
    if (previousUserProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = previousUserProfile;
    if (previousAgentDataHome === undefined) delete process.env.ECC_AGENT_DATA_HOME; else process.env.ECC_AGENT_DATA_HOME = previousAgentDataHome;
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

test('run ignores malformed input without throwing', () => {
  assert.doesNotThrow(() => run('not json'));
  assert.doesNotThrow(() => run(''));
  assert.doesNotThrow(() => run('{}'));
});

test('run is a no-op when the session has no cost rows yet', () => {
  withIsolatedHome(homeDir => {
    run(JSON.stringify({ session_id: 'sess-1' }));
    const rows = readSessionRows({ homeDir });
    assert.strictEqual(rows.length, 0);
  });
});

test('an end-to-end Stop hook run upserts one session row from the real sinks, isolated from the real home', () => {
  withIsolatedHome(homeDir => {
    const costsPath = path.join(homeDir, '.claude', 'metrics', 'costs.jsonl');
    writeJsonl(costsPath, [
      { session_id: 'sess-1', timestamp: '2026-01-01T00:00:00.000Z', model: 'claude-sonnet-5', input_tokens: 10, output_tokens: 5, cache_write_tokens: 0, cache_read_tokens: 0, estimated_cost_usd: 0.001 },
      { session_id: 'sess-1', timestamp: '2026-01-01T00:05:00.000Z', model: 'claude-sonnet-5', input_tokens: 100, output_tokens: 50, cache_write_tokens: 0, cache_read_tokens: 0, estimated_cost_usd: 0.01 },
    ]);
    const agentRunsPath = path.join(homeDir, '.claude', 'state', 'agent-runs.jsonl');
    writeJsonl(agentRunsPath, [
      { agent_name: 'code-reviewer', session_id: 'sess-1', outcome: 'success' },
    ]);

    run(JSON.stringify({ session_id: 'sess-1', transcript_path: '' }));

    const rows = readSessionRows({ homeDir });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].session_id, 'sess-1');
    assert.strictEqual(rows[0].input_tokens, 100);
    assert.strictEqual(rows[0].agents_used[0].name, 'code-reviewer');
  });
});

test('run is idempotent across repeated Stop events for the same session', () => {
  withIsolatedHome(homeDir => {
    const costsPath = path.join(homeDir, '.claude', 'metrics', 'costs.jsonl');
    writeJsonl(costsPath, [
      { session_id: 'sess-1', timestamp: '2026-01-01T00:00:00.000Z', model: 'x', input_tokens: 1, output_tokens: 1, cache_write_tokens: 0, cache_read_tokens: 0, estimated_cost_usd: 0 },
    ]);

    run(JSON.stringify({ session_id: 'sess-1' }));
    run(JSON.stringify({ session_id: 'sess-1' }));
    run(JSON.stringify({ session_id: 'sess-1' }));

    const rows = readSessionRows({ homeDir });
    assert.strictEqual(rows.length, 1, 'repeated Stop events must upsert, not append duplicates');
  });
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) {
  process.exitCode = 1;
}
