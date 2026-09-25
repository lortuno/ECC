/**
 * Tests for scripts/hooks/agent-run-tracker.js and the JSONL sink in
 * scripts/lib/agent-tracker.js.
 *
 * Focus: the tracker records real Task-tool runs, never persists prompt
 * text, and never touches the real ~/.claude — every case that can reach
 * the filesystem uses withTempHome (see the leak this pattern was written
 * to avoid, fixed alongside this file in skill-run-tracker's siblings).
 *
 * Run with: node tests/run-all.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildRecord, deriveOutcome, extractAgentName, extractDescription, run } = require('../../scripts/hooks/agent-run-tracker');
const { readHooksConfig } = require('../../scripts/lib/hooks-config');
const {
  MAX_RUN_RECORDS,
  RUNS_FILE_MODE,
  getRunsFilePath,
  recordAgentExecution,
  readAgentExecutionRecords,
} = require('../../scripts/lib/agent-tracker');

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

function withTempHome(fn) {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-agent-runs-'));
  try {
    return fn(homeDir);
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

function payload(overrides = {}) {
  return {
    hook_event_name: 'PostToolUse',
    tool_name: 'Task',
    tool_input: { subagent_type: 'code-reviewer', description: 'Review the diff' },
    tool_response: {},
    session_id: 'sess-abc123',
    ...overrides,
  };
}

// ── agent name extraction ────────────────────────────────────────────────────

test('extractAgentName probes the field names Claude Code has used', () => {
  assert.strictEqual(extractAgentName({ subagent_type: 'a' }), 'a');
  assert.strictEqual(extractAgentName({ subagentType: 'b' }), 'b');
  assert.strictEqual(extractAgentName({ agent_type: 'c' }), 'c');
  assert.strictEqual(extractAgentName({ agentType: 'd' }), 'd');
  assert.strictEqual(extractAgentName({ name: 'e' }), 'e');
  assert.strictEqual(extractAgentName('bare-string'), 'bare-string');
});

test('extractAgentName returns null when no agent name is present', () => {
  assert.strictEqual(extractAgentName({}), null);
  assert.strictEqual(extractAgentName(null), null);
  assert.strictEqual(extractAgentName(42), null);
});

test('extractAgentName rejects an over-long identifier rather than truncating it', () => {
  assert.strictEqual(extractAgentName({ subagent_type: 'x'.repeat(129) }), null);
  assert.strictEqual(extractAgentName({ subagent_type: 'x'.repeat(128) }), 'x'.repeat(128));
});

test('extractAgentName rejects free text that is not identifier-shaped', () => {
  assert.strictEqual(extractAgentName({ subagent_type: 'please act as: my api key is sk-abc' }), null);
  assert.strictEqual(extractAgentName({ subagent_type: 'line\nbreak' }), null);
  assert.strictEqual(extractAgentName({ subagent_type: '   ' }), null);
});

// ── description handling ─────────────────────────────────────────────────────

test('extractDescription uses the tool_input description when present', () => {
  assert.strictEqual(extractDescription({ description: 'Review the diff' }, 'code-reviewer'), 'Review the diff');
});

test('extractDescription synthesizes a fallback when description is missing', () => {
  assert.strictEqual(extractDescription({}, 'code-reviewer'), 'Agent invocation: code-reviewer');
});

test('extractDescription truncates an over-long description instead of persisting it whole', () => {
  const long = 'x'.repeat(500);
  const result = extractDescription({ description: long }, 'code-reviewer');
  assert.ok(result.length <= 200);
  assert.ok(result.endsWith('...'));
});

// ── privacy: no prompt text is persisted ─────────────────────────────────────

test('buildRecord never copies the Task tool prompt field', () => {
  const secret = 'PROMPT-SECRET-do-not-persist';
  const record = buildRecord(payload({
    tool_input: {
      subagent_type: 'code-reviewer',
      description: 'Review the diff',
      prompt: secret,
    },
  }));
  assert.ok(!JSON.stringify(record).includes(secret), 'record must not contain any prompt text');
});

test('buildRecord persists only the four dashboard fields', () => {
  const record = buildRecord(payload());
  assert.deepStrictEqual(
    Object.keys(record).sort(),
    ['agent_name', 'outcome', 'session_id', 'task_description']
  );
});

test('buildRecord returns null when the agent name is unusable', () => {
  assert.strictEqual(buildRecord(payload({ tool_input: {} })), null);
});

// ── outcome derivation ───────────────────────────────────────────────────────

test('deriveOutcome reports failure for PostToolUseFailure routing', () => {
  assert.strictEqual(deriveOutcome(payload({ hook_event_name: 'PostToolUseFailure' })), 'failure');
});

test('deriveOutcome reports failure for error-bearing tool responses', () => {
  assert.strictEqual(deriveOutcome(payload({ tool_response: { is_error: true } })), 'failure');
  assert.strictEqual(deriveOutcome(payload({ tool_response: { status: 'ERROR' } })), 'failure');
  assert.strictEqual(deriveOutcome(payload({ tool_response: { error: 'boom' } })), 'failure');
});

test('deriveOutcome reports success otherwise', () => {
  assert.strictEqual(deriveOutcome(payload()), 'success');
  assert.strictEqual(deriveOutcome(payload({ tool_response: { status: 'ok' } })), 'success');
});

// ── hook behaviour ───────────────────────────────────────────────────────────

test('run ignores non-Task tools and malformed input without throwing', () => {
  assert.doesNotThrow(() => run(JSON.stringify(payload({ tool_name: 'Bash' }))));
  assert.doesNotThrow(() => run('not json'));
  assert.doesNotThrow(() => run(''));
});

// ── JSONL sink bounds ────────────────────────────────────────────────────────

test('recordAgentExecution writes the sink owner-only', function () {
  if (process.platform === 'win32') {
    return; // POSIX modes are not meaningful on Windows
  }
  withTempHome(homeDir => {
    recordAgentExecution(
      { agent_name: 'code-reviewer', task_description: 'Agent invocation: code-reviewer', outcome: 'success' },
      { homeDir }
    );
    const runsFilePath = getRunsFilePath({ homeDir });
    const mode = fs.statSync(runsFilePath).mode & 0o777;
    assert.strictEqual(mode, RUNS_FILE_MODE, `expected mode ${RUNS_FILE_MODE.toString(8)}, got ${mode.toString(8)}`);
  });
});

test('the JSONL sink is bounded by a retention cap', () => {
  withTempHome(homeDir => {
    const maxRecords = 5;
    for (let i = 0; i < maxRecords + 4; i++) {
      recordAgentExecution(
        { agent_name: `agent-${i}`, task_description: `Agent invocation: agent-${i}`, outcome: 'success' },
        { homeDir, maxRecords }
      );
    }

    const records = readAgentExecutionRecords({ homeDir });
    assert.strictEqual(records.length, maxRecords, 'sink must be trimmed to the cap');
    assert.strictEqual(records[records.length - 1].agent_name, `agent-${maxRecords + 3}`);
    assert.strictEqual(records[0].agent_name, `agent-${4}`);
  });
});

test('the default retention cap is a finite bound', () => {
  assert.ok(Number.isInteger(MAX_RUN_RECORDS) && MAX_RUN_RECORDS > 0, 'MAX_RUN_RECORDS must be a positive integer');
});

test('an end-to-end Task hook run lands exactly one non-sensitive record, isolated from the real home', () => {
  withTempHome(homeDir => {
    const previousHome = process.env.HOME;
    const previousUserProfile = process.env.USERPROFILE;
    const previousAgentDataHome = process.env.ECC_AGENT_DATA_HOME;
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
    delete process.env.ECC_AGENT_DATA_HOME;
    try {
      run(JSON.stringify(payload({
        tool_input: { subagent_type: 'code-reviewer', description: 'Review the diff', prompt: 'PROMPT-SECRET' },
      })));

      const records = readAgentExecutionRecords({ homeDir });
      assert.strictEqual(records.length, 1);
      assert.strictEqual(records[0].agent_name, 'code-reviewer');
      assert.strictEqual(records[0].task_description, 'Review the diff');
      assert.strictEqual(records[0].outcome, 'success');
      assert.strictEqual(records[0].session_id, 'sess-abc123');
      assert.ok(!JSON.stringify(records[0]).includes('PROMPT-SECRET'));
    } finally {
      if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
      if (previousUserProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = previousUserProfile;
      if (previousAgentDataHome === undefined) delete process.env.ECC_AGENT_DATA_HOME; else process.env.ECC_AGENT_DATA_HOME = previousAgentDataHome;
    }
  });
});

// Mirrors skill-run-tracker's own registration check: PostToolUseFailure is
// not fanned out by the PostToolUse dispatcher, so the tracker needs its own
// hooks.json entry or hard Task failures are silently dropped.
test('the tracker is registered for PostToolUseFailure so hard failures are recorded', () => {
  const hooksConfig = readHooksConfig(path.join(__dirname, '..', '..', 'hooks', 'hooks.json'));
  const entries = (hooksConfig.hooks.PostToolUseFailure || [])
    .filter(entry => entry.id === 'post:agent:track');

  assert.strictEqual(entries.length, 1, 'expected one post:agent:track PostToolUseFailure entry');
  assert.strictEqual(entries[0].matcher, 'Task', 'tracker must only match the Task tool');
  assert.ok(
    entries[0].hooks[0].command.includes('scripts/hooks/agent-run-tracker.js'),
    'entry should invoke agent-run-tracker.js'
  );
});

// Normal (non-failure) PostToolUse runs are fanned out by
// posttooluse-dispatcher.js's own ASYNC_HOOKS table, not a raw hooks.json
// entry — mirrors how post:skill:track is registered.
test('the tracker is registered in the PostToolUse dispatcher for normal runs', () => {
  const { ASYNC_HOOKS } = require('../../scripts/hooks/posttooluse-dispatcher');
  const entries = ASYNC_HOOKS.filter(entry => entry.id === 'post:agent:track');

  assert.strictEqual(entries.length, 1, 'expected one post:agent:track dispatcher entry');
  assert.strictEqual(entries[0].matcher, 'Task', 'tracker must only match the Task tool');
  assert.strictEqual(entries[0].script, 'scripts/hooks/agent-run-tracker.js');
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) {
  process.exitCode = 1;
}
