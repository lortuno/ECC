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
 */

const { sanitizeSessionId } = require('../lib/session-bridge');
const { getClaudeDir } = require('../lib/utils');
const { getRunsFilePath: getSkillRunsFilePath } = require('../lib/skill-evolution/tracker');
const { getRunsFilePath: getAgentRunsFilePath } = require('../lib/agent-tracker');
const {
  getSessionsFilePath,
  computeSessionRow,
  upsertSessionRow,
} = require('../lib/session-rollup');

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
    });

    if (row) {
      upsertSessionRow(getSessionsFilePath(), row);
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

module.exports = { run };
