'use strict';

/**
 * Builds one aggregated row per session from the three independent JSONL
 * sinks (costs.jsonl, agent-runs.jsonl, skill-runs.jsonl) and upserts it
 * into a fourth sink (sessions.jsonl) — the "database" a session report is
 * read from.
 *
 * Join caveat: agent-runs.jsonl carries session_id (exact join). Skill runs
 * do not — skill-run-tracker.js's persisted record intentionally has no
 * session_id (see its own test asserting exactly four fields). Skills are
 * therefore correlated to a session by timestamp window (any skill run
 * recorded between the session's first and last cost-tracker timestamp),
 * which is a best-effort approximation, not an exact join. This is called
 * out in the row itself via `skills_attribution: 'time-window'`.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { ensureDir } = require('./utils');

const SESSIONS_FILE_NAME = 'sessions.jsonl';
const MAX_SESSION_RECORDS = 2000;
const SESSIONS_FILE_MODE = 0o600;

function resolveHomeDir(homeDir) {
  return homeDir ? path.resolve(homeDir) : os.homedir();
}

function getSessionsFilePath(options = {}) {
  if (options.sessionsFilePath) {
    return path.resolve(options.sessionsFilePath);
  }
  return path.join(resolveHomeDir(options.homeDir), '.claude', 'metrics', SESSIONS_FILE_NAME);
}

function readJsonl(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .reduce((rows, line) => {
      try {
        rows.push(JSON.parse(line));
      } catch {
        // Ignore malformed rows; aggregation is best-effort.
      }
      return rows;
    }, []);
}

function withinWindow(timestamp, startMs, endMs) {
  const t = Date.parse(timestamp);
  return Number.isFinite(t) && t >= startMs && t <= endMs;
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

/**
 * @param {string} sessionId
 * @param {{costsPath?: string, agentRunsPath?: string, skillRunsPath?: string}} paths
 * @returns {object|null} the aggregated row, or null if this session has no cost rows yet
 */
function computeSessionRow(sessionId, paths = {}) {
  const costRows = readJsonl(paths.costsPath).filter(row => row.session_id === sessionId);
  if (costRows.length === 0) {
    return null; // nothing recorded for this session yet
  }

  costRows.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const first = costRows[0];
  const last = costRows[costRows.length - 1];
  const startMs = Date.parse(first.timestamp);
  const endMs = Date.parse(last.timestamp);

  const agentRows = readJsonl(paths.agentRunsPath).filter(row => row.session_id === sessionId);
  const agentsUsed = countBy(agentRows.map(row => row.agent_name));

  const skillRows = Number.isFinite(startMs) && Number.isFinite(endMs)
    ? readJsonl(paths.skillRunsPath).filter(row => withinWindow(row.recorded_at, startMs, endMs))
    : [];
  const skillsUsed = countBy(skillRows.map(row => row.skill_id));

  return {
    session_id: sessionId,
    started_at: first.timestamp,
    ended_at: last.timestamp,
    duration_ms: Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, endMs - startMs) : null,
    model: last.model,
    input_tokens: last.input_tokens,
    output_tokens: last.output_tokens,
    cache_write_tokens: last.cache_write_tokens,
    cache_read_tokens: last.cache_read_tokens,
    estimated_cost_usd: last.estimated_cost_usd,
    agents_used: agentsUsed,
    skills_used: skillsUsed,
    skills_attribution: 'time-window',
    updated_at: new Date().toISOString(),
  };
}

function pruneToCap(rows, maxRecords) {
  if (rows.length <= maxRecords) {
    return rows;
  }
  // Oldest-first by started_at, keep the newest `maxRecords`.
  return [...rows]
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at))
    .slice(-maxRecords);
}

/**
 * Replace the row for `row.session_id` (or append if new) and rewrite the
 * sink, owner-only, bounded by MAX_SESSION_RECORDS.
 */
function upsertSessionRow(sessionsPath, row, options = {}) {
  const maxRecords = Number.isInteger(options.maxRecords) && options.maxRecords > 0
    ? options.maxRecords
    : MAX_SESSION_RECORDS;

  const existing = readJsonl(sessionsPath).filter(r => r.session_id !== row.session_id);
  const next = pruneToCap([...existing, row], maxRecords);
  // Keep the file in a stable, human-scannable order.
  next.sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));

  ensureDir(path.dirname(sessionsPath));
  fs.writeFileSync(
    sessionsPath,
    next.map(r => JSON.stringify(r)).join('\n') + (next.length > 0 ? '\n' : ''),
    { encoding: 'utf8', mode: SESSIONS_FILE_MODE }
  );
  try {
    fs.chmodSync(sessionsPath, SESSIONS_FILE_MODE);
  } catch {
    // Windows and some mounts do not support POSIX modes; the write still lands.
  }
}

function readSessionRows(options = {}) {
  return readJsonl(getSessionsFilePath(options));
}

module.exports = {
  MAX_SESSION_RECORDS,
  SESSIONS_FILE_MODE,
  getSessionsFilePath,
  computeSessionRow,
  upsertSessionRow,
  readSessionRows,
};
