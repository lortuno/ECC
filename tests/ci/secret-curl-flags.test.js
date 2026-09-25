#!/usr/bin/env node
/**
 * Guard agent-facing curl examples from exposing credentials in argv.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

const jiraDocs = [
  'skills/jira-integration/SKILL.md',
];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    return false;
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function shellExamples(source) {
  const examples = [];
  const fencePattern = /```(?:bash|sh|shell)\r?\n([\s\S]*?)```/g;
  let match;

  while ((match = fencePattern.exec(source)) !== null) {
    examples.push(match[1].replace(/\\\r?\n\s*/g, ' '));
  }

  return examples.join('\n');
}

function run() {
  console.log('\n=== Testing secret-safe curl examples ===\n');

  let passed = 0;
  let failed = 0;

  for (const relativePath of jiraDocs) {
    if (test(`${relativePath} keeps Jira credentials out of curl argv`, () => {
      const source = read(relativePath);
      const shell = shellExamples(source);

      assert.match(shell, /jira_curl\(\)/, 'Expected a Jira curl wrapper');
      assert.match(shell, /\bcurl -s -K - "\$@"/, 'Expected curl config stdin in Jira wrapper');
      assert.doesNotMatch(
        shell,
        /\bcurl\b[^\n]*(?:-u|--user)(?:=|\s+)(?:"|')?\$JIRA_EMAIL:\$JIRA_API_TOKEN/,
        'Jira credentials must not be passed with curl -u/--user',
      );
    })) passed++; else failed++;
  }

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

run();
