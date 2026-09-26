'use strict';

/**
 * JSONL sink for pre-work time estimates, recorded via the `/estimate`
 * command before implementation starts. Mirrors the shape and safety
 * properties of scripts/lib/agent-tracker.js (Task-tool runs) so
 * scripts/lib/session-rollup.js can join this sink the same way, by exact
 * session_id, alongside agent and skill runs.
 *
 * Recording an estimate is optional and best-effort: sessions with no
 * `/estimate` call simply have no estimate fields in their rolled-up row.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { ensureDir } = require('./utils');
const { resolveSessionId } = require('./session-bridge');

// Retention bound for the JSONL sink, matching agent-tracker.js /
// skill-evolution/tracker.js for the same reason: an unbounded append-only
// file is pure cost once nothing consumes rows past a recent window.
const MAX_ESTIMATE_RECORDS = 5000;
// Owner-only. Local telemetry under the user's home; nothing else needs it.
const ESTIMATES_FILE_MODE = 0o600;
const MAX_NOTE_LENGTH = 300;

function resolveHomeDir(homeDir) {
  return homeDir ? path.resolve(homeDir) : os.homedir();
}

function getEstimatesFilePath(options = {}) {
  if (options.estimatesFilePath) {
    return path.resolve(options.estimatesFilePath);
  }
  return path.join(resolveHomeDir(options.homeDir), '.claude', 'state', 'task-estimates.jsonl');
}

function normalizeEstimateRecord(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('estimate payload must be an object');
  }

  const estimatedMinutes = Number(input.estimated_minutes ?? input.estimatedMinutes);
  if (!Number.isFinite(estimatedMinutes) || estimatedMinutes <= 0) {
    throw new Error('estimated_minutes must be a positive number');
  }

  const recordedAt = input.recorded_at || options.now || new Date().toISOString();
  if (Number.isNaN(Date.parse(recordedAt))) {
    throw new Error('recorded_at must be an ISO timestamp');
  }

  const sessionId = input.session_id || input.sessionId || resolveSessionId() || null;

  let note = null;
  if (typeof input.note === 'string') {
    const trimmed = input.note.trim();
    if (trimmed.length > 0) {
      note = trimmed.length > MAX_NOTE_LENGTH
        ? `${trimmed.slice(0, MAX_NOTE_LENGTH - 3)}...`
        : trimmed;
    }
  }

  return {
    estimated_minutes: estimatedMinutes,
    note,
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
// cap. Mirrors agent-tracker.js's appendRunRecord exactly.
function appendEstimateRecord(estimatesFilePath, record, options = {}) {
  const maxRecords = Number.isInteger(options.maxRecords) && options.maxRecords > 0
    ? options.maxRecords
    : MAX_ESTIMATE_RECORDS;

  ensureDir(path.dirname(estimatesFilePath));
  fs.appendFileSync(estimatesFilePath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: ESTIMATES_FILE_MODE });

  try {
    fs.chmodSync(estimatesFilePath, ESTIMATES_FILE_MODE);
  } catch {
    // Windows and some mounts do not support POSIX modes; the record still lands.
  }

  pruneEstimateRecords(estimatesFilePath, maxRecords);
}

function pruneEstimateRecords(estimatesFilePath, maxRecords) {
  try {
    const lines = fs.readFileSync(estimatesFilePath, 'utf8').split('\n').filter(Boolean);
    if (lines.length <= maxRecords) {
      return;
    }
    fs.writeFileSync(
      estimatesFilePath,
      `${lines.slice(-maxRecords).join('\n')}\n`,
      { encoding: 'utf8', mode: ESTIMATES_FILE_MODE }
    );
  } catch {
    // Retention is best-effort; never fail a recorded estimate over it.
  }
}

function recordEstimate(input, options = {}) {
  const record = normalizeEstimateRecord(input, options);
  const estimatesFilePath = getEstimatesFilePath(options);
  appendEstimateRecord(estimatesFilePath, record, options);
  return { storage: 'jsonl', path: estimatesFilePath, record };
}

function readEstimateRecords(options = {}) {
  return readJsonl(getEstimatesFilePath(options));
}

module.exports = {
  MAX_ESTIMATE_RECORDS,
  ESTIMATES_FILE_MODE,
  getEstimatesFilePath,
  normalizeEstimateRecord,
  readEstimateRecords,
  recordEstimate,
};
