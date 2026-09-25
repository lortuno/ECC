/**
 * Tests for validate-agent.js — run with: node validate-agent.test.js
 *
 * Exercises the validator against:
 *   1. The real `example-agent.md` fixture in this directory (must pass, non-strict)
 *   2. Deliberately broken fixtures written to a temp directory (must fail,
 *      each for the specific reason it's broken)
 *
 * Dependency-free (assert + fs only), matching this repo's own test style.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateAgentFile } = require('./validate-agent');

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

function writeAgent(dir, filename, content) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, filename);
  fs.writeFileSync(file, content);
  return file;
}

function runTests() {
  console.log('\n=== Testing validate-agent.js ===\n');
  let passed = 0;
  let failed = 0;
  const record = ok => (ok ? passed++ : failed++);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-validate-test-'));

  try {
    // 1. The real worked-example fixture ships next to this test and must pass (non-strict).
    record(
      test('example-agent.md (the shipped worked example) passes non-strict validation', () => {
        const exampleFile = path.join(__dirname, 'example-agent.md');
        const { ok, errors } = validateAgentFile(exampleFile);
        assert.strictEqual(ok, true, `expected no errors, got: ${JSON.stringify(errors)}`);
      })
    );

    // 2. Missing file.
    record(
      test('missing file fails with a clear message', () => {
        const { ok, errors } = validateAgentFile(path.join(tmpRoot, 'does-not-exist.md'));
        assert.strictEqual(ok, false);
        assert.ok(errors[0].includes('Missing file'), errors[0]);
      })
    );

    // 3. Missing tools field.
    record(
      test('missing tools fails', () => {
        const file = writeAgent(tmpRoot, 'missing-tools.md', '---\nname: missing-tools\ndescription: A description long enough to pass the length check easily.\nmodel: sonnet\n---\n\nBody.\n');
        const { ok, errors } = validateAgentFile(file);
        assert.strictEqual(ok, false);
        assert.ok(errors.some(e => e.includes('missing required field: tools')), JSON.stringify(errors));
      })
    );

    // 4. Missing model field.
    record(
      test('missing model fails', () => {
        const file = writeAgent(tmpRoot, 'missing-model.md', '---\nname: missing-model\ndescription: A description long enough to pass the length check easily.\ntools: Read, Grep\n---\n\nBody.\n');
        const { ok, errors } = validateAgentFile(file);
        assert.strictEqual(ok, false);
        assert.ok(errors.some(e => e.includes('missing required field: model')), JSON.stringify(errors));
      })
    );

    // 5. Invalid model value.
    record(
      test('invalid model value fails', () => {
        const file = writeAgent(tmpRoot, 'bad-model.md', '---\nname: bad-model\ndescription: A description long enough to pass the length check easily.\ntools: Read, Grep\nmodel: gpt-5\n---\n\nBody.\n');
        const { ok, errors } = validateAgentFile(file);
        assert.strictEqual(ok, false);
        assert.ok(errors.some(e => e.includes("invalid model 'gpt-5'")), JSON.stringify(errors));
      })
    );

    // 6. tools written as a YAML block sequence instead of a comma-separated scalar.
    record(
      test('tools as a YAML block sequence fails', () => {
        const file = writeAgent(
          tmpRoot,
          'sequence-tools.md',
          '---\nname: sequence-tools\ndescription: A description long enough to pass the length check easily.\nmodel: sonnet\ntools:\n  - Read\n  - Grep\n---\n\nBody.\n'
        );
        const { ok, errors } = validateAgentFile(file);
        assert.strictEqual(ok, false);
        assert.ok(errors.some(e => e.includes('YAML sequence')), JSON.stringify(errors));
      })
    );

    // 7. tools written as a YAML flow sequence ([Read, Grep]) also fails.
    record(
      test('tools as a YAML flow sequence fails', () => {
        const file = writeAgent(
          tmpRoot,
          'flow-sequence-tools.md',
          '---\nname: flow-sequence-tools\ndescription: A description long enough to pass the length check easily.\nmodel: sonnet\ntools: [Read, Grep]\n---\n\nBody.\n'
        );
        const { ok, errors } = validateAgentFile(file);
        assert.strictEqual(ok, false);
        assert.ok(errors.some(e => e.includes('YAML sequence')), JSON.stringify(errors));
      })
    );

    // 8. A minimal but fully valid agent passes with zero errors and zero warnings.
    record(
      test('minimal well-formed agent passes with no errors or warnings', () => {
        const file = writeAgent(
          tmpRoot,
          'minimal-valid-agent.md',
          '---\nname: minimal-valid-agent\ndescription: A minimal but complete example used only to prove the validator accepts well-formed agents.\ntools: Read, Grep\nmodel: haiku\n---\n\nBody.\n'
        );
        const { ok, errors, warnings } = validateAgentFile(file);
        assert.strictEqual(ok, true, JSON.stringify({ errors, warnings }));
        assert.strictEqual(warnings.length, 0, JSON.stringify(warnings));
      })
    );

    // 9. Missing description is a WARN, not an ERROR, under non-strict mode — but fails under --strict.
    record(
      test('missing description warns (non-strict) and fails (--strict)', () => {
        const file = writeAgent(
          tmpRoot,
          'no-description.md',
          '---\nname: no-description\ntools: Read, Grep\nmodel: sonnet\n---\n\nBody.\n'
        );
        const nonStrict = validateAgentFile(file);
        assert.strictEqual(nonStrict.ok, true, JSON.stringify(nonStrict));
        assert.ok(nonStrict.warnings.some(w => w.includes('no description field')), JSON.stringify(nonStrict.warnings));

        const strict = validateAgentFile(file, { strict: true });
        assert.strictEqual(strict.ok, false, JSON.stringify(strict));
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
