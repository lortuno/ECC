/**
 * Direct coverage for scripts/ci/catalog.js.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildCatalog,
  formatExpectation,
  runCatalogCheck,
} = require('../../scripts/ci/catalog');

function createTestDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-ci-catalog-'));
}

function cleanupTestDir(testDir) {
  fs.rmSync(testDir, { recursive: true, force: true });
}

function writeCountedFiles(root, category, count) {
  const dir = path.join(root, category);
  fs.mkdirSync(dir, { recursive: true });

  for (let index = 1; index <= count; index += 1) {
    if (category === 'skills') {
      const skillDir = path.join(dir, `skill-${index}`);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# Skill ${index}\n`);
    } else {
      fs.writeFileSync(path.join(dir, `${category}-${index}.md`), `# ${category} ${index}\n`);
    }
  }
}

function writePluginMetadata(root, counts) {
  const pluginDir = path.join(root, '.claude-plugin');
  fs.mkdirSync(pluginDir, { recursive: true });

  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
    name: 'ecc',
    description: `Fixture plugin — ${counts.agents} agents, ${counts.skills} skills, ${counts.commands} legacy command shims`,
  }, null, 2));
  fs.writeFileSync(path.join(pluginDir, 'marketplace.json'), JSON.stringify({
    plugins: [{
      name: 'ecc',
      description: `Fixture marketplace plugin — ${counts.agents} agents, ${counts.skills} skills, ${counts.commands} legacy command shims`,
    }],
  }, null, 2));
}

function writeEnglishAgents(root, counts, options = {}) {
  const plus = options.skillsMinimum ? '+' : '';

  fs.writeFileSync(path.join(root, 'AGENTS.md'), `This is a production plugin providing ${counts.agents} specialized agents, ${counts.skills}${plus} skills, ${counts.commands} commands.

\`\`\`
agents/ - ${counts.agents} specialized subagents
skills/ - ${counts.skills}${plus} workflow skills and domain knowledge
commands/ - ${counts.commands} slash commands
\`\`\`
`);
}

function writeCatalogFixture(root, options = {}) {
  const actualCounts = options.actualCounts || { agents: 1, skills: 1, commands: 1 };
  const documentedCounts = options.documentedCounts || actualCounts;
  const skillsMinimum = Boolean(options.skillsMinimum);

  writeCountedFiles(root, 'agents', actualCounts.agents);
  writeCountedFiles(root, 'commands', actualCounts.commands);
  writeCountedFiles(root, 'skills', actualCounts.skills);

  fs.writeFileSync(path.join(root, 'agents', 'notes.txt'), 'not counted\n');
  fs.writeFileSync(path.join(root, 'commands', 'notes.txt'), 'not counted\n');
  fs.mkdirSync(path.join(root, 'skills', 'missing-skill-file'), { recursive: true });

  writeEnglishAgents(root, documentedCounts, { skillsMinimum });
  writePluginMetadata(root, documentedCounts);
}

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    return true;
  } catch (error) {
    console.log(`  FAIL ${name}`);
    console.log(`    Error: ${error.message}`);
    return false;
  }
}

function runTests() {
  console.log('\n=== Testing CI catalog.js ===\n');

  let passed = 0;
  let failed = 0;

  if (test('builds catalog counts from a supplied root', () => {
    const testDir = createTestDir();
    try {
      writeCatalogFixture(testDir, {
        actualCounts: { agents: 2, skills: 1, commands: 3 },
        documentedCounts: { agents: 2, skills: 1, commands: 3 },
      });

      const catalog = buildCatalog(testDir);

      assert.deepStrictEqual(
        {
          agents: catalog.agents.count,
          skills: catalog.skills.count,
          commands: catalog.commands.count,
        },
        { agents: 2, skills: 1, commands: 3 }
      );
      assert.ok(catalog.agents.files.every(file => file.endsWith('.md')));
      assert.ok(catalog.skills.files.every(file => file.endsWith('/SKILL.md')));
    } finally {
      cleanupTestDir(testDir);
    }
  })) passed++; else failed++;

  if (test('reports mismatches from every tracked catalog document', () => {
    const testDir = createTestDir();
    try {
      writeCatalogFixture(testDir, {
        actualCounts: { agents: 1, skills: 1, commands: 1 },
        documentedCounts: { agents: 9, skills: 9, commands: 9 },
      });

      const result = runCatalogCheck({ root: testDir });
      const formatted = result.checks
        .filter(check => !check.ok)
        .map(formatExpectation)
        .join('\n');

      assert.ok(formatted.includes('AGENTS.md summary'));
      assert.ok(formatted.includes('.claude-plugin/plugin.json description'));
      assert.ok(formatted.includes('.claude-plugin/marketplace.json plugin description'));
    } finally {
      cleanupTestDir(testDir);
    }
  })) passed++; else failed++;

  if (test('write mode syncs counts while preserving plus suffixes', () => {
    const testDir = createTestDir();
    try {
      writeCatalogFixture(testDir, {
        actualCounts: { agents: 1, skills: 1, commands: 1 },
        documentedCounts: { agents: 7, skills: 7, commands: 7 },
        skillsMinimum: true,
      });

      const result = runCatalogCheck({ root: testDir, writeMode: true });

      assert.strictEqual(result.checks.filter(check => !check.ok).length, 0);

      const agentsDoc = fs.readFileSync(path.join(testDir, 'AGENTS.md'), 'utf8');
      const pluginJson = fs.readFileSync(path.join(testDir, '.claude-plugin', 'plugin.json'), 'utf8');
      const marketplaceJson = fs.readFileSync(path.join(testDir, '.claude-plugin', 'marketplace.json'), 'utf8');

      assert.ok(agentsDoc.includes('providing 1 specialized agents, 1+ skills, 1 commands'));
      assert.ok(agentsDoc.includes('skills/ - 1+ workflow skills and domain knowledge'));
      assert.ok(pluginJson.includes('1 agents, 1 skills, 1 legacy command shims'));
      assert.ok(marketplaceJson.includes('1 agents, 1 skills, 1 legacy command shims'));
    } finally {
      cleanupTestDir(testDir);
    }
  })) passed++; else failed++;

  if (test('throws a clear error for missing tracked documents', () => {
    const testDir = createTestDir();
    try {
      writeCatalogFixture(testDir);
      fs.rmSync(path.join(testDir, 'AGENTS.md'));

      assert.throws(
        () => runCatalogCheck({ root: testDir }),
        /Failed to read AGENTS\.md/
      );
    } finally {
      cleanupTestDir(testDir);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
