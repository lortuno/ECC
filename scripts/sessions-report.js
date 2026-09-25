#!/usr/bin/env node
'use strict';

/**
 * Session report — reads ~/.claude/metrics/sessions.jsonl (written
 * incrementally by the session-rollup Stop hook) and presents it as a
 * table, a CSV export, or a real SQLite database file.
 *
 * Usage:
 *   node scripts/sessions-report.js                 table to stdout
 *   node scripts/sessions-report.js --csv            CSV to stdout
 *   node scripts/sessions-report.js --sqlite out.db  build a SQLite file
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readSessionRows } = require('./lib/session-rollup');

function showHelp() {
  console.log(`
Usage: node scripts/sessions-report.js [--csv | --sqlite <path>]

Reads ~/.claude/metrics/sessions.jsonl and prints:
  (default)      a compact table, most recent session last
  --csv          CSV on stdout (redirect to a file yourself)
  --sqlite PATH  builds a SQLite database at PATH (requires the 'sqlite3'
                 CLI on PATH; not a Node dependency)
`);
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '?';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}

function namesList(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return '-';
  return entries.map(e => `${e.name}(${e.count})`).join(',');
}

function printTable(rows) {
  if (rows.length === 0) {
    console.log('No sessions recorded yet. The session-rollup Stop hook populates this after a session ends.');
    return;
  }

  const header = ['started_at', 'session_id', 'model', 'tokens', 'duration', 'cost_usd', 'agents', 'skills'];
  const lines = rows.map(r => [
    r.started_at,
    String(r.session_id).slice(0, 12),
    r.model || 'unknown',
    String((r.input_tokens || 0) + (r.output_tokens || 0)),
    formatDuration(r.duration_ms),
    `$${Number(r.estimated_cost_usd || 0).toFixed(4)}`,
    namesList(r.agents_used),
    namesList(r.skills_used),
  ]);

  const widths = header.map((h, i) => Math.max(h.length, ...lines.map(l => String(l[i]).length)));
  const formatRow = cells => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');

  console.log(formatRow(header));
  console.log(widths.map(w => '-'.repeat(w)).join('  '));
  for (const line of lines) console.log(formatRow(line));
}

function toCsvValue(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function printCsv(rows) {
  const columns = [
    'session_id', 'started_at', 'ended_at', 'duration_ms', 'model',
    'input_tokens', 'output_tokens', 'cache_write_tokens', 'cache_read_tokens',
    'estimated_cost_usd', 'agents_used', 'skills_used',
  ];
  console.log(columns.join(','));
  for (const r of rows) {
    console.log(columns.map(c => {
      if (c === 'agents_used' || c === 'skills_used') return toCsvValue(namesList(r[c]));
      return toCsvValue(r[c]);
    }).join(','));
  }
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildSql(rows) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_ms INTEGER,
      model TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_write_tokens INTEGER,
      cache_read_tokens INTEGER,
      estimated_cost_usd REAL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);`,
    `CREATE TABLE IF NOT EXISTS agent_runs (
      session_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      run_count INTEGER NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS skill_runs (
      session_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      run_count INTEGER NOT NULL
    );`,
    `DELETE FROM sessions;`,
    `DELETE FROM agent_runs;`,
    `DELETE FROM skill_runs;`,
  ];

  for (const r of rows) {
    statements.push(
      `INSERT INTO sessions (session_id, started_at, ended_at, duration_ms, model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, estimated_cost_usd) VALUES (${
        [r.session_id, r.started_at, r.ended_at, r.duration_ms, r.model, r.input_tokens, r.output_tokens, r.cache_write_tokens, r.cache_read_tokens, r.estimated_cost_usd]
          .map(sqlLiteral).join(', ')
      });`
    );
    for (const a of r.agents_used || []) {
      statements.push(`INSERT INTO agent_runs (session_id, agent_name, run_count) VALUES (${sqlLiteral(r.session_id)}, ${sqlLiteral(a.name)}, ${sqlLiteral(a.count)});`);
    }
    for (const s of r.skills_used || []) {
      statements.push(`INSERT INTO skill_runs (session_id, skill_id, run_count) VALUES (${sqlLiteral(r.session_id)}, ${sqlLiteral(s.name)}, ${sqlLiteral(s.count)});`);
    }
  }

  return statements.join('\n');
}

function buildSqlite(rows, dbPath) {
  const probe = spawnSync('sqlite3', ['--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    console.error(
      "The 'sqlite3' CLI is not on PATH. Install it (macOS/Linux usually ship it; " +
      'on Debian/Ubuntu: apt install sqlite3) or use --csv instead.'
    );
    process.exitCode = 1;
    return;
  }

  const sql = buildSql(rows);
  const result = spawnSync('sqlite3', [dbPath], { input: sql, encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`sqlite3 exited with an error: ${result.stderr || result.status}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Wrote ${rows.length} session(s) to ${path.resolve(dbPath)}`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  const rows = readSessionRows();

  if (args.includes('--csv')) {
    printCsv(rows);
    return;
  }

  const sqliteIndex = args.indexOf('--sqlite');
  if (sqliteIndex !== -1) {
    const dbPath = args[sqliteIndex + 1];
    if (!dbPath || dbPath.startsWith('--')) {
      console.error('--sqlite requires a file path, e.g. --sqlite ~/.claude/metrics/sessions.db');
      process.exitCode = 1;
      return;
    }
    buildSqlite(rows, dbPath);
    return;
  }

  printTable(rows);
}

if (require.main === module) {
  main();
}

module.exports = { formatDuration, namesList, printTable, toCsvValue, printCsv, buildSql, buildSqlite };
