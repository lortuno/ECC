/**
 * Tests for validate-skill.js — run with: node validate-skill.test.js
 *
 * Exercises the structural validator against:
 *   1. The real `example-skill/` fixture in this directory (must pass)
 *   2. Deliberately broken fixtures written to a temp directory (must fail,
 *      each for the specific reason it's broken)
 *
 * Written dependency-free (assert + fs only) so it can be copied alongside
 * validate-skill.js into any project without dragging in a test framework.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateSkillDir } = require('./validate-skill');

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

function writeSkill(dir, skillMdContent) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), skillMdContent);
}

function runTests() {
  console.log('\n=== Testing validate-skill.js ===\n');
  let passed = 0;
  let failed = 0;
  const record = ok => (ok ? passed++ : failed++);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-validate-test-'));

  try {
    // 1. The real worked-example fixture ships next to this test and must pass as-is.
    record(
      test('example-skill/ (the shipped worked example) passes validation', () => {
        const exampleDir = path.join(__dirname, 'example-skill');
        const { ok, findings } = validateSkillDir(exampleDir);
        assert.strictEqual(ok, true, `expected no findings, got: ${JSON.stringify(findings)}`);
      })
    );

    // 2. Missing SKILL.md entirely.
    record(
      test('missing SKILL.md fails with a clear message', () => {
        const dir = path.join(tmpRoot, 'no-skill-md');
        fs.mkdirSync(dir, { recursive: true });
        const { ok, findings } = validateSkillDir(dir);
        assert.strictEqual(ok, false);
        assert.ok(findings[0].includes('Missing SKILL.md'), findings[0]);
      })
    );

    // 3. Empty SKILL.md.
    record(
      test('empty SKILL.md fails', () => {
        const dir = path.join(tmpRoot, 'empty-skill-md');
        writeSkill(dir, '');
        const { ok, findings } = validateSkillDir(dir);
        assert.strictEqual(ok, false);
        assert.ok(findings[0].includes('empty'), findings[0]);
      })
    );

    // 4. No frontmatter block at all.
    record(
      test('SKILL.md with no frontmatter block fails', () => {
        const dir = path.join(tmpRoot, 'no-frontmatter');
        writeSkill(dir, '# Just a heading, no --- block\n');
        const { ok, findings } = validateSkillDir(dir);
        assert.strictEqual(ok, false);
        assert.ok(findings[0].includes('no YAML frontmatter'), findings[0]);
      })
    );

    // 5. Missing description field.
    record(
      test('frontmatter missing description fails', () => {
        const dir = path.join(tmpRoot, 'missing-description');
        writeSkill(dir, '---\nname: missing-description\n---\n\n## When to Activate\n\n- Something\n');
        const { ok, findings } = validateSkillDir(dir);
        assert.strictEqual(ok, false);
        assert.ok(
          findings.some(f => f.includes('missing required field: description')),
          JSON.stringify(findings)
        );
      })
    );

    // 6. Description too short to be a useful activation trigger.
    record(
      test('description under 20 chars is flagged', () => {
        const dir = path.join(tmpRoot, 'short-description');
        writeSkill(
          dir,
          '---\nname: short-description\ndescription: too short\n---\n\n## When to Activate\n\n- Something\n'
        );
        const { ok, findings } = validateSkillDir(dir);
        assert.strictEqual(ok, false);
        assert.ok(
          findings.some(f => f.includes('too short')),
          JSON.stringify(findings)
        );
      })
    );

    // 7. name doesn't match the directory it lives in.
    record(
      test('name mismatched with directory name is flagged', () => {
        const dir = path.join(tmpRoot, 'actual-dir-name');
        writeSkill(
          dir,
          '---\nname: some-other-name\ndescription: A description that is definitely long enough to pass the length check.\n---\n\n## When to Activate\n\n- Something\n'
        );
        const { ok, findings } = validateSkillDir(dir);
        assert.strictEqual(ok, false);
        assert.ok(
          findings.some(f => f.includes("does not match directory name")),
          JSON.stringify(findings)
        );
      })
    );

    // 8. Missing "When to Activate" / "When to Use" section.
    record(
      test('missing "When to Activate" section is flagged', () => {
        const dir = path.join(tmpRoot, 'no-activation-section');
        writeSkill(
          dir,
          '---\nname: no-activation-section\ndescription: A description that is definitely long enough to pass the length check.\n---\n\n## Core Concepts\n\nNo activation section here.\n'
        );
        const { ok, findings } = validateSkillDir(dir);
        assert.strictEqual(ok, false);
        assert.ok(
          findings.some(f => f.includes('When to Activate')),
          JSON.stringify(findings)
        );
      })
    );

    // 9. A minimal but fully valid skill should pass with zero findings.
    record(
      test('minimal well-formed skill passes with zero findings', () => {
        const dir = path.join(tmpRoot, 'minimal-valid-skill');
        writeSkill(
          dir,
          '---\nname: minimal-valid-skill\ndescription: A minimal but complete example used only to prove the validator accepts well-formed skills.\n---\n\n# Minimal Valid Skill\n\n## When to Activate\n\n- When testing the validator itself\n'
        );
        const { ok, findings } = validateSkillDir(dir);
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
