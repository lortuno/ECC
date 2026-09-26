/**
 * Tests for validate-hook-example.js — run with: node validate-hook-example.test.js
 *
 * Exercises the validator against:
 *   1. The real example-hooks.json / example-hooks.metadata.json fixtures in
 *      this directory (must pass)
 *   2. Deliberately broken fixtures written to a temp directory (must fail,
 *      each for the specific reason it's broken) — including a regression
 *      case for the exact JS-expression-matcher mistake this repo's now-
 *      deleted CONTRIBUTING.md made
 *
 * Dependency-free (assert + fs only), matching this repo's own test style.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateHookPair, fingerprintHookEntry } = require('./validate-hook-example');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    return false;
  }
}

function writePair(dir, hooksConfig, metadata) {
  fs.mkdirSync(dir, { recursive: true });
  const hooksPath = path.join(dir, 'hooks.json');
  const metadataPath = path.join(dir, 'hooks.metadata.json');
  fs.writeFileSync(hooksPath, JSON.stringify(hooksConfig, null, 2));
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  return { hooksPath, metadataPath };
}

function runTests() {
  console.log('\n=== Testing validate-hook-example.js ===\n');
  let passed = 0;
  let failed = 0;
  const record = ok => (ok ? passed++ : failed++);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-validate-test-'));

  try {
    // 1. The real shipped fixtures must pass.
    record(
      test('example-hooks.json / example-hooks.metadata.json (the shipped worked example) pass validation', () => {
        const { ok, findings } = validateHookPair(
          path.join(__dirname, 'example-hooks.json'),
          path.join(__dirname, 'example-hooks.metadata.json')
        );
        assert.strictEqual(ok, true, `expected no findings, got: ${JSON.stringify(findings)}`);
      })
    );

    // 2. Missing files.
    record(
      test('missing hooks.json fails with a clear message', () => {
        const { ok, findings } = validateHookPair(
          path.join(tmpRoot, 'does-not-exist.json'),
          path.join(__dirname, 'example-hooks.metadata.json')
        );
        assert.strictEqual(ok, false);
        assert.ok(findings[0].includes('Missing file'), findings[0]);
      })
    );

    // 3. Mismatched fingerprint — command changed but fingerprint wasn't regenerated.
    record(
      test('mismatched fingerprint fails', () => {
        const entry = { matcher: 'Bash', hooks: [{ type: 'command', command: 'node a.js' }] };
        const { hooksPath, metadataPath } = writePair(
          path.join(tmpRoot, 'mismatched-fingerprint'),
          { hooks: { PreToolUse: [entry] } },
          { entries: { PreToolUse: [{ id: 'x', description: 'y', fingerprint: 'deadbeef0000' }] } }
        );
        const { ok, findings } = validateHookPair(hooksPath, metadataPath);
        assert.strictEqual(ok, false);
        assert.ok(findings.some(f => f.includes('does not match')), JSON.stringify(findings));
      })
    );

    // 4. Reordered pair — two entries in one event, sidecar order doesn't match hooks.json order.
    record(
      test('reordered pair fails (sidecar entries not moved with their matcher entries)', () => {
        const entryA = { matcher: 'Bash', hooks: [{ type: 'command', command: 'node a.js' }] };
        const entryB = { matcher: 'Write', hooks: [{ type: 'command', command: 'node b.js' }] };
        const { hooksPath, metadataPath } = writePair(
          path.join(tmpRoot, 'reordered'),
          { hooks: { PreToolUse: [entryA, entryB] } },
          {
            entries: {
              // Sidecar still describes B first, A second — stale after hooks.json put A first.
              PreToolUse: [
                { id: 'hook-b', description: 'b', fingerprint: fingerprintHookEntry(entryB) },
                { id: 'hook-a', description: 'a', fingerprint: fingerprintHookEntry(entryA) },
              ],
            },
          }
        );
        const { ok, findings } = validateHookPair(hooksPath, metadataPath);
        assert.strictEqual(ok, false);
        assert.ok(findings.some(f => f.includes('does not match')), JSON.stringify(findings));
      })
    );

    // 5. JS-expression matcher — the exact mistake in the old CONTRIBUTING.md.
    record(
      test('JS-expression matcher fails (regression for the old CONTRIBUTING.md format)', () => {
        const entry = {
          matcher: 'tool == "Bash" && tool_input.command matches "rm -rf /"',
          hooks: [{ type: 'command', command: "echo '[Hook] BLOCKED' && exit 1" }],
        };
        const { hooksPath, metadataPath } = writePair(
          path.join(tmpRoot, 'js-expression-matcher'),
          { hooks: { PreToolUse: [entry] } },
          { entries: { PreToolUse: [{ id: 'x', description: 'y', fingerprint: fingerprintHookEntry(entry) }] } }
        );
        const { ok, findings } = validateHookPair(hooksPath, metadataPath);
        assert.strictEqual(ok, false);
        assert.ok(findings.some(f => f.includes('JS boolean expression')), JSON.stringify(findings));
      })
    );

    // 6. Missing sidecar entry entirely (event present in hooks.json, absent from metadata).
    record(
      test('missing sidecar entry for an event fails', () => {
        const entry = { matcher: 'Bash', hooks: [{ type: 'command', command: 'node a.js' }] };
        const { hooksPath, metadataPath } = writePair(
          path.join(tmpRoot, 'missing-sidecar-event'),
          { hooks: { PreToolUse: [entry] } },
          { entries: {} }
        );
        const { ok, findings } = validateHookPair(hooksPath, metadataPath);
        assert.strictEqual(ok, false);
        assert.ok(findings.some(f => f.includes('missing entries for event')), JSON.stringify(findings));
      })
    );

    // 7. A minimal but fully valid pair passes with zero findings.
    record(
      test('minimal well-formed pair passes with zero findings', () => {
        const entry = { matcher: 'Write', hooks: [{ type: 'command', command: 'node valid.js' }] };
        const { hooksPath, metadataPath } = writePair(
          path.join(tmpRoot, 'minimal-valid'),
          { hooks: { PreToolUse: [entry] } },
          { entries: { PreToolUse: [{ id: 'valid-hook', description: 'valid', fingerprint: fingerprintHookEntry(entry) }] } }
        );
        const { ok, findings } = validateHookPair(hooksPath, metadataPath);
        assert.strictEqual(ok, true, JSON.stringify(findings));
      })
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
