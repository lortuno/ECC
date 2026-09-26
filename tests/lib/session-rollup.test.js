/**
 * Tests for scripts/lib/session-rollup.js
 *
 * Run with: node tests/lib/session-rollup.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  MAX_SESSION_RECORDS,
  computeSessionRow,
  upsertSessionRow,
  readSessionRows,
} = require('../../scripts/lib/session-rollup');

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

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-rollup-test-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

// ── computeSessionRow ─────────────────────────────────────────────────────────

test('computeSessionRow returns null when the session has no cost rows', () => {
  withTempDir(dir => {
    const costsPath = path.join(dir, 'costs.jsonl');
    writeJsonl(costsPath, [{ session_id: 'other', timestamp: '2026-01-01T00:00:00.000Z' }]);
    const row = computeSessionRow('sess-1', { costsPath });
    assert.strictEqual(row, null);
  });
});

test('computeSessionRow uses the latest cumulative cost row for totals', () => {
  withTempDir(dir => {
    const costsPath = path.join(dir, 'costs.jsonl');
    writeJsonl(costsPath, [
      { session_id: 'sess-1', timestamp: '2026-01-01T00:00:00.000Z', model: 'claude-sonnet-5', input_tokens: 100, output_tokens: 50, cache_write_tokens: 0, cache_read_tokens: 0, estimated_cost_usd: 0.01 },
      { session_id: 'sess-1', timestamp: '2026-01-01T00:10:00.000Z', model: 'claude-sonnet-5', input_tokens: 500, output_tokens: 200, cache_write_tokens: 10, cache_read_tokens: 20, estimated_cost_usd: 0.05 },
    ]);
    const row = computeSessionRow('sess-1', { costsPath });
    assert.strictEqual(row.input_tokens, 500);
    assert.strictEqual(row.output_tokens, 200);
    assert.strictEqual(row.estimated_cost_usd, 0.05);
    assert.strictEqual(row.started_at, '2026-01-01T00:00:00.000Z');
    assert.strictEqual(row.ended_at, '2026-01-01T00:10:00.000Z');
    assert.strictEqual(row.duration_ms, 600000);
  });
});

test('computeSessionRow joins agent runs by exact session_id', () => {
  withTempDir(dir => {
    const costsPath = path.join(dir, 'costs.jsonl');
    const agentRunsPath = path.join(dir, 'agent-runs.jsonl');
    writeJsonl(costsPath, [
      { session_id: 'sess-1', timestamp: '2026-01-01T00:00:00.000Z', model: 'x', input_tokens: 1, output_tokens: 1, cache_write_tokens: 0, cache_read_tokens: 0, estimated_cost_usd: 0 },
    ]);
    writeJsonl(agentRunsPath, [
      { agent_name: 'code-reviewer', session_id: 'sess-1', outcome: 'success' },
      { agent_name: 'code-reviewer', session_id: 'sess-1', outcome: 'success' },
      { agent_name: 'planner', session_id: 'sess-1', outcome: 'success' },
      { agent_name: 'planner', session_id: 'sess-2', outcome: 'success' }, // different session — excluded
    ]);
    const row = computeSessionRow('sess-1', { costsPath, agentRunsPath });
    const byName = Object.fromEntries(row.agents_used.map(a => [a.name, a.count]));
    assert.deepStrictEqual(byName, { 'code-reviewer': 2, planner: 1 });
  });
});

test('computeSessionRow records the task (git branch) when provided', () => {
  withTempDir(dir => {
    const costsPath = path.join(dir, 'costs.jsonl');
    writeJsonl(costsPath, [
      { session_id: 'sess-1', timestamp: '2026-01-01T00:00:00.000Z', model: 'x', input_tokens: 1, output_tokens: 1, cache_write_tokens: 0, cache_read_tokens: 0, estimated_cost_usd: 0 },
    ]);
    const row = computeSessionRow('sess-1', { costsPath, branch: 'feature/session-reporting' });
    assert.strictEqual(row.task, 'feature/session-reporting');
  });
});

test('computeSessionRow leaves task null when no branch was resolved', () => {
  withTempDir(dir => {
    const costsPath = path.join(dir, 'costs.jsonl');
    writeJsonl(costsPath, [
      { session_id: 'sess-1', timestamp: '2026-01-01T00:00:00.000Z', model: 'x', input_tokens: 1, output_tokens: 1, cache_write_tokens: 0, cache_read_tokens: 0, estimated_cost_usd: 0 },
    ]);
    const row = computeSessionRow('sess-1', { costsPath });
    assert.strictEqual(row.task, null);
  });
});

test('computeSessionRow joins the latest estimate for the session and compares it against the actual duration', () => {
  withTempDir(dir => {
    const costsPath = path.join(dir, 'costs.jsonl');
    const estimatesPath = path.join(dir, 'estimates.jsonl');
    writeJsonl(costsPath, [
      { session_id: 'sess-1', timestamp: '2026-01-01T00:00:00.000Z', model: 'x', input_tokens: 1, output_tokens: 1, cache_write_tokens: 0, cache_read_tokens: 0, estimated_cost_usd: 0 },
      { session_id: 'sess-1', timestamp: '2026-01-01T00:30:00.000Z', model: 'x', input_tokens: 2, output_tokens: 2, cache_write_tokens: 0, cache_read_tokens: 0, estimated_cost_usd: 0 },
    ]);
    writeJsonl(estimatesPath, [
      { estimated_minutes: 15, note: 'stale first guess', session_id: 'sess-1', recorded_at: '2026-01-01T00:00:00.000Z' },
      { estimated_minutes: 20, note: 'revised after scoping', session_id: 'sess-1', recorded_at: '2026-01-01T00:05:00.000Z' },
      { estimated_minutes: 999, note: 'different session', session_id: 'sess-2', recorded_at: '2026-01-01T00:06:00.000Z' },
    ]);
    const row = computeSessionRow('sess-1', { costsPath, estimatesPath });
    assert.strictEqual(row.estimated_minutes, 20, 'the most recently recorded estimate wins');
    assert.strictEqual(row.estimated_duration_ms, 20 * 60000);
    assert.strictEqual(row.estimate_note, 'revised after scoping');
    assert.strictEqual(row.duration_ms, 1800000);
    assert.strictEqual(row.estimate_delta_ms, 1800000 - 20 * 60000);
  });
});

test('computeSessionRow leaves estimate fields null when no estimate was recorded', () => {
  withTempDir(dir => {
    const costsPath = path.join(dir, 'costs.jsonl');
    writeJsonl(costsPath, [
      { session_id: 'sess-1', timestamp: '2026-01-01T00:00:00.000Z', model: 'x', input_tokens: 1, output_tokens: 1, cache_write_tokens: 0, cache_read_tokens: 0, estimated_cost_usd: 0 },
    ]);
    const row = computeSessionRow('sess-1', { costsPath });
    assert.strictEqual(row.estimated_minutes, null);
    assert.strictEqual(row.estimated_duration_ms, null);
    assert.strictEqual(row.estimate_note, null);
    assert.strictEqual(row.estimate_delta_ms, null);
  });
});

test('computeSessionRow correlates skill runs by timestamp window (no session_id available)', () => {
  withTempDir(dir => {
    const costsPath = path.join(dir, 'costs.jsonl');
    const skillRunsPath = path.join(dir, 'skill-runs.jsonl');
    writeJsonl(costsPath, [
      { session_id: 'sess-1', timestamp: '2026-01-01T00:00:00.000Z', model: 'x', input_tokens: 1, output_tokens: 1, cache_write_tokens: 0, cache_read_tokens: 0, estimated_cost_usd: 0 },
      { session_id: 'sess-1', timestamp: '2026-01-01T01:00:00.000Z', model: 'x', input_tokens: 2, output_tokens: 2, cache_write_tokens: 0, cache_read_tokens: 0, estimated_cost_usd: 0 },
    ]);
    writeJsonl(skillRunsPath, [
      { skill_id: 'ck', recorded_at: '2026-01-01T00:30:00.000Z' },   // inside window
      { skill_id: 'ck', recorded_at: '2026-01-01T00:45:00.000Z' },   // inside window
      { skill_id: 'other-skill', recorded_at: '2026-01-02T00:00:00.000Z' }, // outside window
    ]);
    const row = computeSessionRow('sess-1', { costsPath, skillRunsPath });
    const byName = Object.fromEntries(row.skills_used.map(s => [s.name, s.count]));
    assert.deepStrictEqual(byName, { ck: 2 });
    assert.strictEqual(row.skills_attribution, 'time-window');
  });
});

// ── upsertSessionRow ──────────────────────────────────────────────────────────

test('upsertSessionRow appends a new session', () => {
  withTempDir(dir => {
    const sessionsPath = path.join(dir, 'sessions.jsonl');
    upsertSessionRow(sessionsPath, { session_id: 'sess-1', started_at: '2026-01-01T00:00:00.000Z' });
    const rows = readSessionRows({ sessionsFilePath: sessionsPath });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].session_id, 'sess-1');
  });
});

test('upsertSessionRow replaces the existing row for the same session, not append a duplicate', () => {
  withTempDir(dir => {
    const sessionsPath = path.join(dir, 'sessions.jsonl');
    upsertSessionRow(sessionsPath, { session_id: 'sess-1', started_at: '2026-01-01T00:00:00.000Z', input_tokens: 10 });
    upsertSessionRow(sessionsPath, { session_id: 'sess-1', started_at: '2026-01-01T00:00:00.000Z', input_tokens: 999 });
    const rows = readSessionRows({ sessionsFilePath: sessionsPath });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].input_tokens, 999);
  });
});

test('upsertSessionRow is bounded by a retention cap, keeping the newest sessions', () => {
  withTempDir(dir => {
    const sessionsPath = path.join(dir, 'sessions.jsonl');
    const cap = 5;
    for (let i = 0; i < cap + 3; i++) {
      upsertSessionRow(
        sessionsPath,
        { session_id: `sess-${i}`, started_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` },
        { maxRecords: cap }
      );
    }
    const rows = readSessionRows({ sessionsFilePath: sessionsPath });
    assert.strictEqual(rows.length, cap);
    assert.strictEqual(rows[rows.length - 1].session_id, `sess-${cap + 2}`);
    assert.strictEqual(rows[0].session_id, 'sess-3');
  });
});

test('upsertSessionRow writes the sink owner-only', function () {
  if (process.platform === 'win32') {
    return;
  }
  withTempDir(dir => {
    const sessionsPath = path.join(dir, 'sessions.jsonl');
    upsertSessionRow(sessionsPath, { session_id: 'sess-1', started_at: '2026-01-01T00:00:00.000Z' });
    const mode = fs.statSync(sessionsPath).mode & 0o777;
    assert.strictEqual(mode, 0o600);
  });
});

test('the default retention cap is a finite bound', () => {
  assert.ok(Number.isInteger(MAX_SESSION_RECORDS) && MAX_SESSION_RECORDS > 0);
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) {
  process.exitCode = 1;
}
