/**
 * Tests for scripts/lib/task-estimate.js
 *
 * Run with: node tests/lib/task-estimate.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  MAX_ESTIMATE_RECORDS,
  normalizeEstimateRecord,
  recordEstimate,
  readEstimateRecords,
} = require('../../scripts/lib/task-estimate');

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
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-estimate-test-'));
  const previousSessionId = process.env.ECC_SESSION_ID;
  const previousClaudeSessionId = process.env.CLAUDE_SESSION_ID;
  delete process.env.ECC_SESSION_ID;
  delete process.env.CLAUDE_SESSION_ID;
  try {
    return fn(homeDir);
  } finally {
    if (previousSessionId === undefined) delete process.env.ECC_SESSION_ID; else process.env.ECC_SESSION_ID = previousSessionId;
    if (previousClaudeSessionId === undefined) delete process.env.CLAUDE_SESSION_ID; else process.env.CLAUDE_SESSION_ID = previousClaudeSessionId;
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

// ── normalizeEstimateRecord ───────────────────────────────────────────────────

test('normalizeEstimateRecord requires a positive estimated_minutes', () => {
  assert.throws(() => normalizeEstimateRecord({ estimated_minutes: 0 }), /positive number/);
  assert.throws(() => normalizeEstimateRecord({ estimated_minutes: -5 }), /positive number/);
  assert.throws(() => normalizeEstimateRecord({ estimated_minutes: 'thirty' }), /positive number/);
  assert.throws(() => normalizeEstimateRecord({}), /positive number/);
});

test('normalizeEstimateRecord rejects a non-object payload', () => {
  assert.throws(() => normalizeEstimateRecord(null), /must be an object/);
  assert.throws(() => normalizeEstimateRecord('30'), /must be an object/);
});

test('normalizeEstimateRecord accepts a valid estimate and trims the note', () => {
  const record = normalizeEstimateRecord({
    estimated_minutes: 30,
    note: '  Add branch and estimate tracking  ',
    session_id: 'sess-1',
    recorded_at: '2026-01-01T00:00:00.000Z',
  });
  assert.strictEqual(record.estimated_minutes, 30);
  assert.strictEqual(record.note, 'Add branch and estimate tracking');
  assert.strictEqual(record.session_id, 'sess-1');
  assert.strictEqual(record.recorded_at, '2026-01-01T00:00:00.000Z');
});

test('normalizeEstimateRecord defaults note to null when absent or blank', () => {
  assert.strictEqual(normalizeEstimateRecord({ estimated_minutes: 5, session_id: 's' }).note, null);
  assert.strictEqual(normalizeEstimateRecord({ estimated_minutes: 5, note: '   ', session_id: 's' }).note, null);
});

test('normalizeEstimateRecord truncates an overly long note', () => {
  const longNote = 'x'.repeat(500);
  const record = normalizeEstimateRecord({ estimated_minutes: 5, note: longNote, session_id: 's' });
  assert.ok(record.note.length <= 300);
  assert.ok(record.note.endsWith('...'));
});

test('normalizeEstimateRecord rejects a malformed recorded_at', () => {
  assert.throws(
    () => normalizeEstimateRecord({ estimated_minutes: 5, session_id: 's', recorded_at: 'not-a-date' }),
    /ISO timestamp/
  );
});

// ── recordEstimate / readEstimateRecords ──────────────────────────────────────

test('recordEstimate appends a row to the estimates sink under homeDir', () => {
  withIsolatedHome(homeDir => {
    recordEstimate({ estimated_minutes: 45, note: 'ship it', session_id: 'sess-1' }, { homeDir });
    const rows = readEstimateRecords({ homeDir });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].estimated_minutes, 45);
    assert.strictEqual(rows[0].note, 'ship it');
    assert.strictEqual(rows[0].session_id, 'sess-1');
  });
});

test('recordEstimate falls back to the resolved session id when none is passed', () => {
  withIsolatedHome(homeDir => {
    process.env.CLAUDE_SESSION_ID = 'env-session-42';
    recordEstimate({ estimated_minutes: 10 }, { homeDir });
    const rows = readEstimateRecords({ homeDir });
    assert.strictEqual(rows[0].session_id, 'env-session-42');
  });
});

test('recordEstimate supports multiple estimates across sessions', () => {
  withIsolatedHome(homeDir => {
    recordEstimate({ estimated_minutes: 15, session_id: 'sess-1' }, { homeDir });
    recordEstimate({ estimated_minutes: 60, session_id: 'sess-2' }, { homeDir });
    const rows = readEstimateRecords({ homeDir });
    assert.strictEqual(rows.length, 2);
  });
});

test('the default retention cap is a finite bound', () => {
  assert.ok(Number.isInteger(MAX_ESTIMATE_RECORDS) && MAX_ESTIMATE_RECORDS > 0);
});

test('readEstimateRecords returns an empty array when the sink does not exist', () => {
  withIsolatedHome(homeDir => {
    assert.deepStrictEqual(readEstimateRecords({ homeDir }), []);
  });
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) {
  process.exitCode = 1;
}
