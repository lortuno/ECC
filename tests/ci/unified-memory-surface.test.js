'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const RUNTIME_DOC_PATHS = [
  'skills/unified-memory/SKILL.md',
];

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`  FAIL ${name}`);
    console.log(`    ${error.stack || error.message}`);
    failed += 1;
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

console.log('\n=== Testing unified-memory install and adapter surfaces ===\n');

test('documents the separately installed ECC runtime on every exposed surface', () => {
  for (const relativePath of RUNTIME_DOC_PATHS) {
    const source = read(relativePath);
    assert.match(
      source,
      /npm install -g ecc-universal/i,
      `${relativePath} must state how to install the required CLI runtime`
    );
    assert.match(
      source,
      /ecc-memory-mcp/,
      `${relativePath} must identify the optional MCP binary`
    );
  }
});

console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
