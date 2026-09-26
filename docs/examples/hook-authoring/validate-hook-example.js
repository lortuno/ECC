#!/usr/bin/env node
/**
 * validate-hook-example.js — standalone structural check for a hooks.json /
 * hooks.metadata.json pair.
 *
 * No dependencies beyond Node's stdlib — copy this file into any project.
 * It reimplements the same fingerprint/alignment logic ECC's own
 * scripts/lib/hooks-config.js and scripts/ci/validate-hooks.js apply to the
 * real hooks/hooks.json + hooks/hooks.metadata.json pair (see
 * HOW_TO_CREATE_A_HOOK.md for the full explanation of why two files exist
 * and what a fingerprint is), plus one check CI's own validator does not
 * need: rejecting a JS-expression `matcher` (e.g. `tool == "Bash" && ...`),
 * which is not a real hooks.json matcher shape but was mistakenly documented
 * in this repo's now-deleted CONTRIBUTING.md.
 *
 * Usage:
 *   node validate-hook-example.js
 *   node validate-hook-example.js path/to/hooks.json path/to/hooks.metadata.json
 *
 * Exit code 0 = pass (no findings), 1 = fail (findings printed to stdout).
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FINGERPRINT_LENGTH = 12;
const FINGERPRINT_PATTERN = /^[0-9a-f]{12}$/;

/**
 * JSON.stringify with object keys sorted, so a fingerprint does not change
 * when someone reorders the keys inside a hook object. Mirrors
 * scripts/lib/hooks-config.js's stableStringify — copied here rather than
 * required, so this file has zero dependency on the rest of the repo.
 *
 * @param {*} value
 * @returns {string}
 */
function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(
      key => `${JSON.stringify(key)}:${stableStringify(value[key])}`
    ).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Fingerprint the parts of a hooks.json matcher entry that identify it: its
 * matcher and its hook commands. Mirrors
 * scripts/lib/hooks-config.js#fingerprintHookEntry.
 *
 * @param {object} entry - A matcher entry from a hooks.json-shaped file.
 * @returns {string} short hex digest
 */
function fingerprintHookEntry(entry) {
  const subject = {
    matcher: entry && 'matcher' in entry ? entry.matcher : null,
    hooks: entry && Array.isArray(entry.hooks) ? entry.hooks : [],
  };
  return crypto.createHash('sha256')
    .update(stableStringify(subject))
    .digest('hex')
    .slice(0, FINGERPRINT_LENGTH);
}

/**
 * @param {string} hooksPath
 * @param {string} metadataPath
 * @returns {{ok: boolean, findings: string[]}}
 */
function validateHookPair(hooksPath, metadataPath) {
  const findings = [];

  if (!fs.existsSync(hooksPath)) {
    return { ok: false, findings: [`Missing file: ${hooksPath}`] };
  }
  if (!fs.existsSync(metadataPath)) {
    return { ok: false, findings: [`Missing file: ${metadataPath}`] };
  }

  let hooksConfig;
  let metadata;
  try {
    hooksConfig = JSON.parse(fs.readFileSync(hooksPath, 'utf-8'));
  } catch (error) {
    return { ok: false, findings: [`Invalid JSON in ${hooksPath}: ${error.message}`] };
  }
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  } catch (error) {
    return { ok: false, findings: [`Invalid JSON in ${metadataPath}: ${error.message}`] };
  }

  const events = hooksConfig && typeof hooksConfig.hooks === 'object' && hooksConfig.hooks
    ? hooksConfig.hooks
    : null;
  const entriesByEvent = metadata && typeof metadata.entries === 'object' && metadata.entries
    ? metadata.entries
    : null;

  if (!events) {
    return { ok: false, findings: [`${hooksPath} has no top-level "hooks" object`] };
  }
  if (!entriesByEvent) {
    return { ok: false, findings: [`${metadataPath} has no top-level "entries" object`] };
  }

  const seenIds = new Map();

  for (const [event, entries] of Object.entries(events)) {
    if (!Array.isArray(entries)) {
      findings.push(`${hooksPath}: "${event}" is not an array`);
      continue;
    }
    const eventMetadata = entriesByEvent[event];
    if (!Array.isArray(eventMetadata)) {
      findings.push(`${metadataPath} is missing entries for event "${event}"`);
      continue;
    }
    if (eventMetadata.length !== entries.length) {
      findings.push(
        `${metadataPath} lists ${eventMetadata.length} entr(ies) for event "${event}" `
        + `but ${hooksPath} has ${entries.length}`
      );
      continue;
    }

    entries.forEach((entry, index) => {
      const label = `${event}[${index}]`;

      // Reject the exact mistake this guide exists to correct: a JS-expression
      // matcher instead of a plain tool-name string.
      if (typeof entry?.matcher !== 'string' || entry.matcher.trim() === '') {
        findings.push(`${label}: "matcher" must be a non-empty string, got ${JSON.stringify(entry?.matcher)}`);
      } else if (/[=&|]{2}|tool_input\.|tool\s*==/.test(entry.matcher)) {
        findings.push(
          `${label}: "matcher" ("${entry.matcher}") looks like a JS boolean expression, `
          + 'not a plain tool-name string — see HOW_TO_CREATE_A_HOOK.md'
        );
      }

      if (!Array.isArray(entry?.hooks) || entry.hooks.length === 0) {
        findings.push(`${label}: "hooks" must be a non-empty array`);
      } else {
        entry.hooks.forEach((hook, hookIndex) => {
          if (hook?.type === 'command' && (!hook.command || typeof hook.command !== 'string')) {
            findings.push(`${label}.hooks[${hookIndex}]: type "command" requires a non-empty string "command"`);
          }
        });
      }

      const entryMetadata = eventMetadata[index];
      if (!entryMetadata || typeof entryMetadata !== 'object') {
        findings.push(`${metadataPath} ${label} is not an object`);
        return;
      }
      if (typeof entryMetadata.id !== 'string' || entryMetadata.id.trim() === '') {
        findings.push(`${metadataPath} ${label} is missing a non-empty "id"`);
      } else if (seenIds.has(entryMetadata.id)) {
        findings.push(`${metadataPath} ${label} has duplicate id "${entryMetadata.id}" already used by ${seenIds.get(entryMetadata.id)}`);
      } else {
        seenIds.set(entryMetadata.id, label);
      }

      if (typeof entryMetadata.fingerprint !== 'string' || !FINGERPRINT_PATTERN.test(entryMetadata.fingerprint)) {
        findings.push(`${metadataPath} ${label} is missing a valid "fingerprint"`);
        return;
      }
      const expected = fingerprintHookEntry(entry);
      if (entryMetadata.fingerprint !== expected) {
        findings.push(
          `${metadataPath} ${label} (id "${entryMetadata.id}") fingerprint ${entryMetadata.fingerprint} `
          + `does not match ${hooksPath} ${label} (${expected}) — reordered, or the command changed`
        );
      }
    });
  }

  for (const event of Object.keys(entriesByEvent)) {
    if (!Array.isArray(events[event])) {
      findings.push(`${metadataPath} describes event "${event}" which ${hooksPath} does not define`);
    }
  }

  return { ok: findings.length === 0, findings };
}

function main() {
  const args = process.argv.slice(2);
  const hooksPath = args[0] ? path.resolve(args[0]) : path.join(__dirname, 'example-hooks.json');
  const metadataPath = args[1] ? path.resolve(args[1]) : path.join(__dirname, 'example-hooks.metadata.json');

  const { ok, findings } = validateHookPair(hooksPath, metadataPath);

  if (ok) {
    console.log(`OK: ${hooksPath} and ${metadataPath} are aligned`);
  } else {
    for (const finding of findings) {
      console.log(`ERROR: ${finding}`);
    }
  }

  process.exit(ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { validateHookPair, fingerprintHookEntry, stableStringify };
