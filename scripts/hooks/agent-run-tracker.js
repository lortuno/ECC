#!/usr/bin/env node
'use strict';

/**
 * PostToolUse hook: record Task tool (subagent) invocations for session
 * reporting. Sibling of skill-run-tracker.js — same sink shape, same
 * defensive field-probing, so a session aggregator can join both by
 * session_id without special-casing either.
 *
 * Privacy: mirrors skill-run-tracker.js — never persists prompt text. The
 * Task tool's `prompt` input is deliberately never read here; only the
 * identifier-shaped `subagent_type` (and a bounded, truncated `description`)
 * are recorded.
 *
 * Best-effort: never blocks tool execution. Runs under the PostToolUse
 * dispatcher, which owns stdin, pass-through, and exit codes.
 *
 * Cross-platform (Windows, macOS, Linux); CommonJS.
 */

const { recordAgentExecution } = require('../lib/agent-tracker');

const MAX_AGENT_NAME = 128;
const MAX_DESCRIPTION = 200;

// Identifiers only: letters, digits, and the separators agent/subagent names
// actually use (e.g. "code-reviewer", "fork").
const AGENT_NAME_PATTERN = /^[A-Za-z0-9._:@/-]+$/;

function boundedIdentifier(value, maxLength, pattern) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    return null;
  }
  return pattern.test(trimmed) ? trimmed : null;
}

function firstIdentifier(maxLength, pattern, ...values) {
  for (const value of values) {
    const identifier = boundedIdentifier(value, maxLength, pattern);
    if (identifier) {
      return identifier;
    }
  }
  return null;
}

// Extract the subagent identifier from the Task tool input across the field
// names Claude Code has used for it. No single canonical field is guaranteed
// across harness versions — probe the plausible ones and bail (record
// nothing) if none is present, matching skill-run-tracker.js's approach for
// the Skill tool.
function extractAgentName(toolInput) {
  if (typeof toolInput === 'string') {
    return boundedIdentifier(toolInput, MAX_AGENT_NAME, AGENT_NAME_PATTERN);
  }
  if (!toolInput || typeof toolInput !== 'object') {
    return null;
  }
  return firstIdentifier(
    MAX_AGENT_NAME,
    AGENT_NAME_PATTERN,
    toolInput.subagent_type,
    toolInput.subagentType,
    toolInput.agent_type,
    toolInput.agentType,
    toolInput.name
  );
}

// A short, bounded, non-sensitive label for the run. Never the prompt itself
// — truncated free text is still not an identifier, so it is sanitized by
// length alone and never treated as something safe to match against a
// pattern the way agent_name is.
function extractDescription(toolInput, agentName) {
  if (toolInput && typeof toolInput === 'object' && typeof toolInput.description === 'string') {
    const trimmed = toolInput.description.trim();
    if (trimmed.length > 0) {
      return trimmed.length > MAX_DESCRIPTION
        ? `${trimmed.slice(0, MAX_DESCRIPTION - 3)}...`
        : trimmed;
    }
  }
  return `Agent invocation: ${agentName}`;
}

// Best-effort outcome: a failed tool call is recorded as "failure",
// everything else as "success" — same derivation as skill-run-tracker.js.
function deriveOutcome(payload) {
  if (payload && payload.hook_event_name === 'PostToolUseFailure') {
    return 'failure';
  }

  const response = (payload && (payload.tool_response ?? payload.tool_output)) || null;
  if (response && typeof response === 'object') {
    if (response.is_error === true || response.isError === true) {
      return 'failure';
    }
    if (typeof response.status === 'string' && /error|fail/i.test(response.status)) {
      return 'failure';
    }
    if (typeof response.error === 'string' && response.error.trim().length > 0) {
      return 'failure';
    }
  }

  return 'success';
}

function buildRecord(payload) {
  const agentName = extractAgentName(payload.tool_input);
  if (!agentName) {
    return null; // cannot satisfy the tracker's required agent_name — skip
  }

  const input = payload.tool_input && typeof payload.tool_input === 'object'
    ? payload.tool_input
    : {};

  return {
    agent_name: agentName,
    task_description: extractDescription(input, agentName),
    outcome: deriveOutcome(payload),
    session_id: typeof payload.session_id === 'string' ? payload.session_id : null,
  };
}

function run(rawInput) {
  try {
    const payload = typeof rawInput === 'string'
      ? (rawInput.trim() ? JSON.parse(rawInput) : {})
      : rawInput;
    if (payload && typeof payload === 'object' && payload.tool_name === 'Task') {
      const record = buildRecord(payload);
      if (record) {
        recordAgentExecution(record);
      }
    }
  } catch {
    // Telemetry is best-effort; never block tool execution on a failure here.
  }
}

module.exports = { buildRecord, deriveOutcome, extractAgentName, extractDescription, run };
