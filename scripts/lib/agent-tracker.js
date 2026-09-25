'use strict';

/**
 * JSONL sink for Task-tool (subagent) invocations, mirroring the shape and
 * safety properties of scripts/lib/skill-evolution/tracker.js (skill runs)
 * so the two sinks can be joined the same way by session aggregation.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { ensureDir } = require('./utils');

const VALID_OUTCOMES = new Set(['success', 'failure']);

// Retention bound for the JSONL sink, matching skill-evolution/tracker.js's
// cap for the same reason: an unbounded append-only file is pure cost once
// nothing consumes rows past a recent window.
const MAX_RUN_RECORDS = 5000;
// Owner-only. Local telemetry under the user's home; nothing else needs it.
const RUNS_FILE_MODE = 0o600;

function resolveHomeDir(homeDir) {
  return homeDir ? path.resolve(homeDir) : os.homedir();
}

function getRunsFilePath(options = {}) {
  if (options.runsFilePath) {
    return path.resolve(options.runsFilePath);
  }
  return path.join(resolveHomeDir(options.homeDir), '.claude', 'state', 'agent-runs.jsonl');
}

function normalizeExecutionRecord(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('agent execution payload must be an object');
  }

  const agentName = input.agent_name || input.agentName;
  const taskDescription = input.task_description || input.taskDescription;
  const outcome = input.outcome;
  const recordedAt = input.recorded_at || options.now || new Date().toISOString();
  const sessionId = input.session_id || input.sessionId || null;

  if (typeof agentName !== 'string' || agentName.trim().length === 0) {
    throw new Error('agent_name is required');
  }
  if (typeof taskDescription !== 'string' || taskDescription.trim().length === 0) {
    throw new Error('task_description is required');
  }
  if (!VALID_OUTCOMES.has(outcome)) {
    throw new Error('outcome must be one of success or failure');
  }
  if (Number.isNaN(Date.parse(recordedAt))) {
    throw new Error('recorded_at must be an ISO timestamp');
  }

  return {
    agent_name: agentName,
    task_description: taskDescription,
    outcome,
    session_id: sessionId,
    recorded_at: recordedAt,
  };
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
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
        // Ignore malformed rows so analytics remain best-effort.
      }
      return rows;
    }, []);
}

// Append one record with owner-only permissions, then enforce the retention
// cap. Mirrors skill-evolution/tracker.js's appendRunRecord exactly.
function appendRunRecord(runsFilePath, record, options = {}) {
  const maxRecords = Number.isInteger(options.maxRecords) && options.maxRecords > 0
    ? options.maxRecords
    : MAX_RUN_RECORDS;

  ensureDir(path.dirname(runsFilePath));
  fs.appendFileSync(runsFilePath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: RUNS_FILE_MODE });

  try {
    fs.chmodSync(runsFilePath, RUNS_FILE_MODE);
  } catch {
    // Windows and some mounts do not support POSIX modes; the record still lands.
  }

  pruneRunRecords(runsFilePath, maxRecords);
}

function pruneRunRecords(runsFilePath, maxRecords) {
  try {
    const lines = fs.readFileSync(runsFilePath, 'utf8').split('\n').filter(Boolean);
    if (lines.length <= maxRecords) {
      return;
    }
    fs.writeFileSync(
      runsFilePath,
      `${lines.slice(-maxRecords).join('\n')}\n`,
      { encoding: 'utf8', mode: RUNS_FILE_MODE }
    );
  } catch {
    // Retention is best-effort; never fail a recorded run over it.
  }
}

function recordAgentExecution(input, options = {}) {
  const record = normalizeExecutionRecord(input, options);
  const runsFilePath = getRunsFilePath(options);
  appendRunRecord(runsFilePath, record, options);
  return { storage: 'jsonl', path: runsFilePath, record };
}

function readAgentExecutionRecords(options = {}) {
  return readJsonl(getRunsFilePath(options));
}

module.exports = {
  MAX_RUN_RECORDS,
  RUNS_FILE_MODE,
  VALID_OUTCOMES,
  getRunsFilePath,
  normalizeExecutionRecord,
  readAgentExecutionRecords,
  recordAgentExecution,
};
