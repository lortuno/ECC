#!/usr/bin/env node
/**
 * validate-skill.js — standalone structural check for a single skill directory.
 *
 * No dependencies beyond Node's stdlib, so it's safe to copy into any
 * project (yours doesn't need to carry the full ECC repo, or js-yaml, to
 * run this). It checks the same structural rules ECC's own
 * scripts/ci/validate-skills.js enforces on skills/*, simplified and
 * pointed at an arbitrary path instead of a hardcoded skills/ directory.
 *
 * Usage:
 *   node validate-skill.js <path-to-skill-directory>
 *   node validate-skill.js .claude/skills/my-skill
 *
 * Exit code 0 = pass (no findings), 1 = fail (findings printed to stdout).
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Extract top-level `key: value` pairs from a leading YAML frontmatter
 * block. Deliberately simple — good enough to catch the mistakes that
 * actually break skill activation (missing/empty name or description,
 * a block-scalar description). Not a full YAML parser.
 *
 * @param {string} content
 * @returns {Record<string,string>|null} null if no frontmatter block found
 */
function extractFrontmatter(content) {
  const clean = content.replace(/^\uFEFF/, ''); // strip BOM
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;

  const values = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    values[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return values;
}

/**
 * @param {string} skillDir absolute or relative path to a skill directory
 * @returns {{ok: boolean, findings: string[]}}
 */
function validateSkillDir(skillDir) {
  const skillMd = path.join(skillDir, 'SKILL.md');
  const dirName = path.basename(path.resolve(skillDir));

  if (!fs.existsSync(skillMd)) {
    return { ok: false, findings: [`Missing SKILL.md in ${skillDir}`] };
  }

  const content = fs.readFileSync(skillMd, 'utf-8');
  if (content.trim().length === 0) {
    return { ok: false, findings: ['SKILL.md is empty'] };
  }

  const fm = extractFrontmatter(content);
  if (!fm) {
    return { ok: false, findings: ["SKILL.md has no YAML frontmatter block (must start with '---')"] };
  }

  const findings = [];

  if (!fm.name) {
    findings.push('frontmatter missing required field: name');
  } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name)) {
    findings.push(`name '${fm.name}' is not lowercase-with-hyphens`);
  } else if (fm.name !== dirName) {
    findings.push(`name '${fm.name}' does not match directory name '${dirName}'`);
  }

  if (!fm.description) {
    findings.push('frontmatter missing required field: description');
  } else if (/^[|>]/.test(fm.description)) {
    findings.push(`description uses a YAML block-scalar indicator ('${fm.description}') — use a plain inline string`);
  } else if (fm.description.length < 20) {
    findings.push(
      `description is only ${fm.description.length} chars — too short for Claude to reliably match it against a task; aim for a full sentence describing when to use the skill`
    );
  }

  const lineCount = content.split('\n').length;
  if (lineCount > 800) {
    findings.push(`SKILL.md is ${lineCount} lines — over the 800-line maximum, split it into multiple skills`);
  }

  if (!/^##\s+When to (Activate|Use)/m.test(content)) {
    findings.push("no '## When to Activate' (or '## When to Use') section — activation triggers aren't explicit");
  }

  return { ok: findings.length === 0, findings };
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node validate-skill.js <path-to-skill-directory>');
    process.exit(2);
  }

  const { ok, findings } = validateSkillDir(path.resolve(target));

  if (ok) {
    console.log(`OK: ${target} passed structural validation`);
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

module.exports = { validateSkillDir, extractFrontmatter };
