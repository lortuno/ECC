#!/usr/bin/env node
/**
 * validate-agent.js — standalone structural check for a single agent
 * markdown file.
 *
 * No dependencies beyond Node's stdlib — copy this file into any project.
 * It enforces the same required-field rules ECC's own
 * scripts/ci/validate-agents.js applies to agents/*.md (frontmatter present,
 * `model` and `tools` required, `model` must be haiku/sonnet/opus, `tools`
 * must be a comma-separated scalar — not a YAML sequence), plus a few
 * additional best-practice heuristics (name/description presence and
 * quality) that go beyond what that CI check itself requires. Those extra
 * heuristics print as WARN and don't fail the run unless --strict is passed.
 *
 * Usage:
 *   node validate-agent.js <path-to-agent.md>
 *   node validate-agent.js --strict <path-to-agent.md>
 *
 * Exit code 0 = pass, 1 = fail (an ERROR finding, or a WARN finding under --strict).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const VALID_MODELS = ['haiku', 'sonnet', 'opus'];

/**
 * Extract top-level `key: value` frontmatter pairs, and flag whether `tools`
 * looks like a YAML sequence (flow `[a, b]` or a block list of `- item`
 * lines) rather than the required comma-separated scalar.
 *
 * @param {string} content
 * @returns {{values: Record<string,string>, toolsIsSequence: boolean}|null}
 */
function extractFrontmatter(content) {
  const clean = content.replace(/^﻿/, '');
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;

  const values = {};
  let toolsIsSequence = false;
  let currentKey = null;

  for (const line of match[1].split(/\r?\n/)) {
    if (/^\s*-\s+/.test(line)) {
      if (currentKey === 'tools') toolsIsSequence = true;
      continue;
    }
    if (/^\s/.test(line)) continue; // indented continuation of a nested value
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;

    currentKey = m[1];
    const value = m[2].trim().replace(/^["']|["']$/g, '');
    values[currentKey] = value;
    if (currentKey === 'tools' && value.startsWith('[')) toolsIsSequence = true;
  }

  return { values, toolsIsSequence };
}

/**
 * @param {string} agentFile path to an agent .md file
 * @param {{strict?: boolean}} [opts]
 * @returns {{ok: boolean, errors: string[], warnings: string[]}}
 */
function validateAgentFile(agentFile, opts = {}) {
  const { strict = false } = opts;

  if (!fs.existsSync(agentFile)) {
    return { ok: false, errors: [`Missing file: ${agentFile}`], warnings: [] };
  }

  const content = fs.readFileSync(agentFile, 'utf-8');
  if (content.trim().length === 0) {
    return { ok: false, errors: ['File is empty'], warnings: [] };
  }

  const fm = extractFrontmatter(content);
  if (!fm) {
    return { ok: false, errors: ["No YAML frontmatter block found (must start with '---')"], warnings: [] };
  }

  const errors = [];
  const warnings = [];
  const { values, toolsIsSequence } = fm;
  const dirName = path.basename(agentFile, '.md');

  // --- Required by scripts/ci/validate-agents.js ---
  if (!values.model || !values.model.trim()) {
    errors.push('frontmatter missing required field: model');
  } else if (!VALID_MODELS.includes(values.model)) {
    errors.push(`invalid model '${values.model}' — must be one of: ${VALID_MODELS.join(', ')}`);
  }

  if (toolsIsSequence) {
    // A block sequence (tools:\n  - Read) leaves the `tools:` scalar empty,
    // so this check must run before the missing-field check below or a
    // sequence gets misreported as "missing" instead of "wrong format".
    errors.push('tools must be a comma-separated scalar (e.g. "Read, Grep, Bash"), not a YAML sequence');
  } else if (!values.tools || !values.tools.trim()) {
    errors.push('frontmatter missing required field: tools');
  }

  // --- Best-practice heuristics beyond what CI itself enforces ---
  if (!values.name) {
    warnings.push('frontmatter has no name field (not CI-enforced, but every shipped agent has one)');
  } else if (values.name !== dirName) {
    warnings.push(`name '${values.name}' does not match filename '${dirName}.md'`);
  }

  if (!values.description) {
    warnings.push('frontmatter has no description field — Claude has nothing to match this agent against when deciding whether to delegate to it');
  } else if (values.description.length < 30) {
    warnings.push(`description is only ${values.description.length} chars — too short to convey when this agent should be used`);
  }

  const allFindings = strict ? [...errors, ...warnings] : errors;
  return { ok: allFindings.length === 0, errors, warnings };
}

function main() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const target = args.find(a => !a.startsWith('--'));

  if (!target) {
    console.error('Usage: node validate-agent.js [--strict] <path-to-agent.md>');
    process.exit(2);
  }

  const { ok, errors, warnings } = validateAgentFile(path.resolve(target), { strict });

  for (const e of errors) console.log(`ERROR: ${e}`);
  for (const w of warnings) console.log(`WARN: ${w}`);

  if (errors.length === 0 && warnings.length === 0) {
    console.log(`OK: ${target} passed validation`);
  }

  process.exit(ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { validateAgentFile, extractFrontmatter };
