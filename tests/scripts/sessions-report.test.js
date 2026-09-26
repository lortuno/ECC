/**
 * Tests for scripts/sessions-report.js
 *
 * Run with: node tests/run-all.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { formatDuration, namesList, formatEstimateComparison, toCsvValue, buildSql } = require('../../scripts/sessions-report');

const script = path.join(__dirname, '..', '..', 'scripts', 'sessions-report.js');

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

// ── pure helpers ──────────────────────────────────────────────────────────────

test('formatDuration renders hours and minutes', () => {
  assert.strictEqual(formatDuration(90000), '2m');
  assert.strictEqual(formatDuration(3600000 + 5 * 60000), '1h5m');
  assert.strictEqual(formatDuration(NaN), '?');
});

test('namesList renders empty and populated attribution arrays', () => {
  assert.strictEqual(namesList([]), '-');
  assert.strictEqual(namesList(null), '-');
  assert.strictEqual(namesList([{ name: 'code-reviewer', count: 2 }, { name: 'planner', count: 1 }]), 'code-reviewer(2),planner(1)');
});

test('formatEstimateComparison shows estimate vs. actual, or a dash with no estimate', () => {
  assert.strictEqual(formatEstimateComparison({ estimated_duration_ms: null, duration_ms: 90000 }), '-');
  assert.strictEqual(formatEstimateComparison({ estimated_duration_ms: 30 * 60000, duration_ms: 42 * 60000 }), '30m est -> 42m');
  assert.strictEqual(formatEstimateComparison({ estimated_duration_ms: 30 * 60000, duration_ms: NaN }), '30m est -> ?');
});

test('toCsvValue quotes values containing commas, quotes, or newlines', () => {
  assert.strictEqual(toCsvValue('plain'), 'plain');
  assert.strictEqual(toCsvValue('a,b'), '"a,b"');
  assert.strictEqual(toCsvValue('a"b'), '"a""b"');
  assert.strictEqual(toCsvValue(null), '');
});

test('buildSql escapes single quotes in string literals', () => {
  const sql = buildSql([{ session_id: "sess-o'brien", started_at: '2026-01-01T00:00:00.000Z', agents_used: [], skills_used: [] }]);
  assert.ok(sql.includes("sess-o''brien"), 'single quote must be doubled for SQL safety');
});

// ── end-to-end CLI, isolated from the real home ──────────────────────────────

function withIsolatedHome(fn) {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessions-report-test-'));
  try {
    return fn(homeDir);
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

function runScript(args, homeDir) {
  return spawnSync('node', [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir, ECC_AGENT_DATA_HOME: '' },
    timeout: 10000,
  });
}

function seedSessions(homeDir) {
  const sessionsPath = path.join(homeDir, '.claude', 'metrics', 'sessions.jsonl');
  fs.mkdirSync(path.dirname(sessionsPath), { recursive: true });
  const row = {
    session_id: 'sess-1', task: 'feature/session-reporting', started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-01T00:05:00.000Z',
    duration_ms: 300000, model: 'claude-sonnet-5', input_tokens: 100, output_tokens: 50,
    cache_write_tokens: 0, cache_read_tokens: 0, estimated_cost_usd: 0.01,
    estimated_minutes: 4, estimated_duration_ms: 240000, estimate_note: 'add task/estimate tracking', estimate_delta_ms: 60000,
    agents_used: [{ name: 'code-reviewer', count: 1 }], skills_used: [{ name: 'ck', count: 2 }],
  };
  fs.writeFileSync(sessionsPath, JSON.stringify(row) + '\n', 'utf8');
  return sessionsPath;
}

test('table output reports no sessions when the sink is empty', () => {
  withIsolatedHome(homeDir => {
    const result = runScript([], homeDir);
    assert.strictEqual(result.status, 0);
    assert.ok(result.stdout.includes('No sessions recorded yet'));
  });
});

test('table output includes the session row', () => {
  withIsolatedHome(homeDir => {
    seedSessions(homeDir);
    const result = runScript([], homeDir);
    assert.strictEqual(result.status, 0);
    assert.ok(result.stdout.includes('claude-sonnet-5'));
    assert.ok(result.stdout.includes('feature/session-reporting'));
    assert.ok(result.stdout.includes('4m est -> 5m'));
    assert.ok(result.stdout.includes('code-reviewer(1)'));
    assert.ok(result.stdout.includes('ck(2)'));
  });
});

test('table output shows a dash for the estimate when none was recorded', () => {
  withIsolatedHome(homeDir => {
    const sessionsPath = seedSessions(homeDir);
    const rows = fs.readFileSync(sessionsPath, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    delete rows[0].estimated_duration_ms;
    fs.writeFileSync(sessionsPath, rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    const result = runScript([], homeDir);
    assert.strictEqual(result.status, 0);
    assert.ok(!result.stdout.includes('est ->'), 'no estimate column value should be rendered');
    assert.ok(result.stdout.includes('sess-1'));
  });
});

test('--csv exports a parseable header and row', () => {
  withIsolatedHome(homeDir => {
    seedSessions(homeDir);
    const result = runScript(['--csv'], homeDir);
    assert.strictEqual(result.status, 0);
    const lines = result.stdout.trim().split('\n');
    assert.strictEqual(
      lines[0],
      'session_id,task,started_at,ended_at,duration_ms,model,input_tokens,output_tokens,cache_write_tokens,cache_read_tokens,estimated_cost_usd,estimated_minutes,estimated_duration_ms,estimate_note,agents_used,skills_used'
    );
    assert.ok(lines[1].startsWith('sess-1,feature/session-reporting,'));
    assert.ok(lines[1].includes(',4,240000,add task/estimate tracking,'));
  });
});

test('--sqlite builds a real, queryable database file', function () {
  const probe = spawnSync('sqlite3', ['--version'], { encoding: 'utf8' });
  if (probe.error) {
    console.log('    (skipped: sqlite3 CLI not available in this environment)');
    return;
  }
  withIsolatedHome(homeDir => {
    seedSessions(homeDir);
    const dbPath = path.join(homeDir, 'out.db');
    const result = runScript(['--sqlite', dbPath], homeDir);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(dbPath));

    const query = spawnSync('sqlite3', [dbPath, 'SELECT model, input_tokens FROM sessions WHERE session_id = "sess-1";'], { encoding: 'utf8' });
    assert.strictEqual(query.stdout.trim(), 'claude-sonnet-5|100');

    const taskQuery = spawnSync('sqlite3', [dbPath, 'SELECT task, estimated_minutes, estimated_duration_ms, estimate_note, estimate_delta_ms FROM sessions WHERE session_id = "sess-1";'], { encoding: 'utf8' });
    assert.strictEqual(taskQuery.stdout.trim(), 'feature/session-reporting|4.0|240000|add task/estimate tracking|60000');

    const agentQuery = spawnSync('sqlite3', [dbPath, 'SELECT agent_name, run_count FROM agent_runs;'], { encoding: 'utf8' });
    assert.strictEqual(agentQuery.stdout.trim(), 'code-reviewer|1');
  });
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) {
  process.exitCode = 1;
}
