#!/usr/bin/env node
'use strict';

/**
 * Stop hook: after cost-tracker.js and the skill/agent trackers have written
 * their per-event rows, roll this session's data into one row in
 * ~/.claude/metrics/sessions.jsonl — the sink a session report reads from.
 *
 * Runs after cost-tracker.js in the Stop hook order (see hooks.json /
 * settings.local.json wiring) so this session's latest cost row already
 * exists when this hook reads it. Best-effort and non-blocking, matching
 * every other hook in this file's family.
 *
 * Also mirrors the full sessions table into a gitignored SQLite file at
 * <project>/.claude/data/sessions.db, so `sessions.jsonl` (which lives
 * outside any one project, under the user's home directory) has a
 * queryable, per-project copy that survives closing/reopening the project.
 * Skipped silently when the `sqlite3` CLI is not on PATH.
 */

const path = require('path');
const { spawnSync } = require('child_process');
const { sanitizeSessionId } = require('../lib/session-bridge');
const { getClaudeDir, runCommand, ensureDir } = require('../lib/utils');
const { getRunsFilePath: getSkillRunsFilePath } = require('../lib/skill-evolution/tracker');
const { getRunsFilePath: getAgentRunsFilePath } = require('../lib/agent-tracker');
const { getEstimatesFilePath } = require('../lib/task-estimate');
const {
  getSessionsFilePath,
  computeSessionRow,
  upsertSessionRow,
  readSessionRows,
} = require('../lib/session-rollup');
const { buildSql } = require('../sessions-report');

const SQLITE_MIRROR_RELATIVE_PATH = path.join('.claude', 'data', 'sessions.db');

// Rebuilds the project-local SQLite mirror from the full sessions table.
// Best-effort: silently does nothing if the sqlite3 CLI isn't available.
function refreshSqliteMirror(cwd) {
  try {
    const probe = spawnSync('sqlite3', ['--version'], { encoding: 'utf8' });
    if (probe.error || probe.status !== 0) {
      return;
    }
    const dbPath = path.join(cwd || process.cwd(), SQLITE_MIRROR_RELATIVE_PATH);
    ensureDir(path.dirname(dbPath));
    spawnSync('sqlite3', [dbPath], { input: buildSql(readSessionRows()), encoding: 'utf8' });
  } catch {
    // Best-effort mirror; never block the Stop hook chain on it.
  }
}

// Best-effort branch lookup, recorded on the row as `task` — the unit of
// work the session belongs to. Resolved from the hook's own `cwd` (Windows
// worktrees can differ from process.cwd() in edge cases) with a
// process.cwd() fallback, matching session-end.js's branch lookup.
function resolveBranch(cwd) {
  const result = runCommand('git rev-parse --abbrev-ref HEAD', { cwd: cwd || process.cwd() });
  return result.success && result.output ? result.output : null;
}

const MAX_STDIN = 1024 * 1024;

function run(rawInput) {
  try {
    const input = typeof rawInput === 'string'
      ? (rawInput.trim() ? JSON.parse(rawInput) : {})
      : (rawInput || {});

    const sessionId = sanitizeSessionId(input.session_id);
    if (!sessionId) {
      return; // nothing to key the row on
    }

    const claudeDir = getClaudeDir();
    const row = computeSessionRow(sessionId, {
      costsPath: require('path').join(claudeDir, 'metrics', 'costs.jsonl'),
      agentRunsPath: getAgentRunsFilePath(),
      skillRunsPath: getSkillRunsFilePath(),
      estimatesPath: getEstimatesFilePath(),
      branch: resolveBranch(input.cwd),
    });

    if (row) {
      upsertSessionRow(getSessionsFilePath(), row);
      refreshSqliteMirror(input.cwd);
    }
  } catch {
    // Best-effort; never block the Stop hook chain on a rollup failure.
  }
}

if (require.main === module) {
  let raw = '';
  let truncated = false;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) {
      const remaining = MAX_STDIN - raw.length;
      raw += chunk.substring(0, remaining);
      if (chunk.length > remaining) truncated = true;
    } else {
      truncated = true;
    }
  });
  process.stdin.on('end', () => {
    run(raw);
    if (!truncated) {
      process.stdout.write(raw);
    }
  });
}

module.exports = { run, resolveBranch, refreshSqliteMirror, SQLITE_MIRROR_RELATIVE_PATH };
