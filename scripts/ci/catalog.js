#!/usr/bin/env node
/**
 * Verify repo catalog counts against tracked documentation files.
 *
 * Usage:
 *   node scripts/ci/catalog.js
 *   node scripts/ci/catalog.js --json
 *   node scripts/ci/catalog.js --md
 *   node scripts/ci/catalog.js --text
 *   node scripts/ci/catalog.js --write --text
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const AGENTS_PATH = path.join(ROOT, 'AGENTS.md');
const PLUGIN_JSON_PATH = path.join(ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_JSON_PATH = path.join(ROOT, '.claude-plugin', 'marketplace.json');
const WRITE_MODE = process.argv.includes('--write');

const OUTPUT_MODE = process.argv.includes('--md')
  ? 'md'
  : process.argv.includes('--text')
    ? 'text'
    : 'json';

function normalizePathSegments(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function listMatchingFiles(root, relativeDir, matcher) {
  const directory = path.join(root, relativeDir);
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => matcher(entry))
    .map(entry => normalizePathSegments(path.join(relativeDir, entry.name)))
    .sort();
}

function buildCatalog(root = ROOT) {
  const agents = listMatchingFiles(root, 'agents', entry => entry.isFile() && entry.name.endsWith('.md'));
  const commands = listMatchingFiles(root, 'commands', entry => entry.isFile() && entry.name.endsWith('.md'));
  const skills = listMatchingFiles(root, 'skills', entry => (
    entry.isDirectory() && fs.existsSync(path.join(root, 'skills', entry.name, 'SKILL.md'))
  )).map(skillDir => `${skillDir}/SKILL.md`);

  return {
    agents: { count: agents.length, files: agents, glob: 'agents/*.md' },
    commands: { count: commands.length, files: commands, glob: 'commands/*.md' },
    skills: { count: skills.length, files: skills, glob: 'skills/*/SKILL.md' }
  };
}

function readFileOrThrow(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read ${path.basename(filePath)}: ${error.message}`);
  }
}

function writeFileOrThrow(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
  } catch (error) {
    throw new Error(`Failed to write ${path.basename(filePath)}: ${error.message}`);
  }
}

function replaceOrThrow(content, regex, replacer, source) {
  if (!regex.test(content)) {
    throw new Error(`${source} is missing the expected catalog marker`);
  }

  return content.replace(regex, replacer);
}

function parseAgentsDocExpectations(agentsContent) {
  const summaryMatch = agentsContent.match(/providing\s+(\d+)\s+specialized agents,\s+(\d+)(\+)?\s+skills,\s+(\d+)\s+commands/i);
  if (!summaryMatch) {
    throw new Error('AGENTS.md is missing the catalog summary line');
  }

  const expectations = [
    { category: 'agents', mode: 'exact', expected: Number(summaryMatch[1]), source: 'AGENTS.md summary' },
    {
      category: 'skills',
      mode: summaryMatch[3] ? 'minimum' : 'exact',
      expected: Number(summaryMatch[2]),
      source: 'AGENTS.md summary'
    },
    { category: 'commands', mode: 'exact', expected: Number(summaryMatch[4]), source: 'AGENTS.md summary' }
  ];

  const structurePatterns = [
    {
      category: 'agents',
      mode: 'exact',
      regex: /^\s*agents\/\s*[—–-]\s*(\d+)\s+specialized subagents\s*$/im,
      source: 'AGENTS.md project structure'
    },
    {
      category: 'skills',
      mode: 'minimum',
      regex: /^\s*skills\/\s*[—–-]\s*(\d+)(\+)?\s+workflow skills and domain knowledge\s*$/im,
      source: 'AGENTS.md project structure'
    },
    {
      category: 'commands',
      mode: 'exact',
      regex: /^\s*commands\/\s*[—–-]\s*(\d+)\s+slash commands\s*$/im,
      source: 'AGENTS.md project structure'
    }
  ];

  for (const pattern of structurePatterns) {
    const match = agentsContent.match(pattern.regex);
    if (!match) {
      throw new Error(`${pattern.source} is missing the ${pattern.category} entry`);
    }

    expectations.push({
      category: pattern.category,
      mode: pattern.mode === 'minimum' && match[2] ? 'minimum' : pattern.mode,
      expected: Number(match[1]),
      source: `${pattern.source} (${pattern.category})`
    });
  }

  return expectations;
}

function parseCatalogDescriptionExpectations(content, source, getDescription) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`${source} is not valid JSON: ${error.message}`);
  }

  const description = getDescription(parsed);
  if (typeof description !== 'string') {
    throw new Error(`${source} is missing the catalog count description`);
  }

  const match = description.match(/(\d+)\s+agents,\s+(\d+)\s+skills,\s+(\d+)\s+legacy command shims?/i);
  if (!match) {
    throw new Error(`${source} is missing the catalog count description`);
  }

  return [
    { category: 'agents', mode: 'exact', expected: Number(match[1]), source },
    { category: 'skills', mode: 'exact', expected: Number(match[2]), source },
    { category: 'commands', mode: 'exact', expected: Number(match[3]), source },
  ];
}

function evaluateExpectations(catalog, expectations) {
  return expectations.map(expectation => {
    const actual = catalog[expectation.category].count;
    const ok = expectation.mode === 'minimum'
      ? actual >= expectation.expected
      : actual === expectation.expected;

    return {
      ...expectation,
      actual,
      ok
    };
  });
}

function formatExpectation(expectation) {
  const comparator = expectation.mode === 'minimum' ? '>=' : '=';
  return `${expectation.source}: ${expectation.category} documented ${comparator} ${expectation.expected}, actual ${expectation.actual}`;
}

function syncEnglishAgents(content, catalog) {
  let nextContent = content;

  nextContent = replaceOrThrow(
    nextContent,
    /(providing\s+)(\d+)(\s+specialized agents,\s+)(\d+)(\+?)(\s+skills,\s+)(\d+)(\s+commands)/i,
    (_, prefix, __, agentsSuffix, ___, skillsPlus, skillsSuffix, ____, commandsSuffix) =>
      `${prefix}${catalog.agents.count}${agentsSuffix}${catalog.skills.count}${skillsPlus}${skillsSuffix}${catalog.commands.count}${commandsSuffix}`,
    'AGENTS.md summary'
  );
  nextContent = replaceOrThrow(
    nextContent,
    /^(\s*agents\/\s*[—–-]\s*)(\d+)(\s+specialized subagents\s*)$/im,
    (_, prefix, __, suffix) => `${prefix}${catalog.agents.count}${suffix}`,
    'AGENTS.md project structure (agents)'
  );
  nextContent = replaceOrThrow(
    nextContent,
    /^(\s*skills\/\s*[—–-]\s*)(\d+)(\+?)(\s+workflow skills and domain knowledge\s*)$/im,
    (_, prefix, __, plus, suffix) => `${prefix}${catalog.skills.count}${plus}${suffix}`,
    'AGENTS.md project structure (skills)'
  );
  nextContent = replaceOrThrow(
    nextContent,
    /^(\s*commands\/\s*[—–-]\s*)(\d+)(\s+slash commands\s*)$/im,
    (_, prefix, __, suffix) => `${prefix}${catalog.commands.count}${suffix}`,
    'AGENTS.md project structure (commands)'
  );

  return nextContent;
}

function syncCatalogDescription(content, catalog, source, getDescription, setDescription) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`${source} is not valid JSON: ${error.message}`);
  }

  const description = getDescription(parsed);
  if (typeof description !== 'string') {
    throw new Error(`${source} is missing the catalog count description`);
  }

  const nextDescription = replaceOrThrow(
    description,
    /(\d+)(\s+agents,\s+)(\d+)(\s+skills,\s+)(\d+)(\s+legacy command shims?)/i,
    (_, __, agentsSuffix, ___, skillsSuffix, ____, commandsSuffix) =>
      `${catalog.agents.count}${agentsSuffix}${catalog.skills.count}${skillsSuffix}${catalog.commands.count}${commandsSuffix}`,
    source
  );

  setDescription(parsed, nextDescription);
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function createDocumentSpecs(paths = {}) {
  const {
    agentsPath = AGENTS_PATH,
    pluginJsonPath = PLUGIN_JSON_PATH,
    marketplaceJsonPath = MARKETPLACE_JSON_PATH,
  } = paths;

  return [
    {
      filePath: agentsPath,
      parseExpectations: parseAgentsDocExpectations,
      syncContent: syncEnglishAgents,
    },
    {
      filePath: pluginJsonPath,
      parseExpectations: content => parseCatalogDescriptionExpectations(
        content,
        '.claude-plugin/plugin.json description',
        parsed => parsed.description
      ),
      syncContent: (content, catalog) => syncCatalogDescription(
        content,
        catalog,
        '.claude-plugin/plugin.json description',
        parsed => parsed.description,
        (parsed, description) => { parsed.description = description; }
      ),
    },
    {
      filePath: marketplaceJsonPath,
      parseExpectations: content => parseCatalogDescriptionExpectations(
        content,
        '.claude-plugin/marketplace.json plugin description',
        parsed => parsed.plugins?.[0]?.description
      ),
      syncContent: (content, catalog) => syncCatalogDescription(
        content,
        catalog,
        '.claude-plugin/marketplace.json plugin description',
        parsed => parsed.plugins?.[0]?.description,
        (parsed, description) => { parsed.plugins[0].description = description; }
      ),
    },
  ];
}

function createDocumentSpecsForRoot(root) {
  return createDocumentSpecs({
    agentsPath: path.join(root, 'AGENTS.md'),
    pluginJsonPath: path.join(root, '.claude-plugin', 'plugin.json'),
    marketplaceJsonPath: path.join(root, '.claude-plugin', 'marketplace.json'),
  });
}

const DOCUMENT_SPECS = createDocumentSpecs();

function renderText(result) {
  console.log('Catalog counts:');
  console.log(`- agents: ${result.catalog.agents.count}`);
  console.log(`- commands: ${result.catalog.commands.count}`);
  console.log(`- skills: ${result.catalog.skills.count}`);
  console.log('');

  const mismatches = result.checks.filter(check => !check.ok);
  if (mismatches.length === 0) {
    console.log('Documentation counts match the repository catalog.');
    return;
  }

  console.error('Documentation count mismatches found:');
  for (const mismatch of mismatches) {
    console.error(`- ${formatExpectation(mismatch)}`);
  }
}

function renderMarkdown(result) {
  const mismatches = result.checks.filter(check => !check.ok);
  console.log('# ECC Catalog Verification\n');
  console.log('| Category | Count | Pattern |');
  console.log('| --- | ---: | --- |');
  console.log(`| Agents | ${result.catalog.agents.count} | \`${result.catalog.agents.glob}\` |`);
  console.log(`| Commands | ${result.catalog.commands.count} | \`${result.catalog.commands.glob}\` |`);
  console.log(`| Skills | ${result.catalog.skills.count} | \`${result.catalog.skills.glob}\` |`);
  console.log('');

  if (mismatches.length === 0) {
    console.log('Documentation counts match the repository catalog.');
    return;
  }

  console.log('## Mismatches\n');
  for (const mismatch of mismatches) {
    console.log(`- ${formatExpectation(mismatch)}`);
  }
}

function runCatalogCheck(options = {}) {
  const root = options.root || ROOT;
  const writeMode = options.writeMode ?? WRITE_MODE;
  const documentSpecs = options.documentSpecs || (
    root === ROOT ? DOCUMENT_SPECS : createDocumentSpecsForRoot(root)
  );
  const catalog = buildCatalog(root);

  if (writeMode) {
    for (const spec of documentSpecs) {
      const currentContent = readFileOrThrow(spec.filePath);
      const nextContent = spec.syncContent(currentContent, catalog);
      if (nextContent !== currentContent) {
        writeFileOrThrow(spec.filePath, nextContent);
      }
    }
  }

  const expectations = documentSpecs.flatMap(spec => (
    spec.parseExpectations(readFileOrThrow(spec.filePath))
  ));
  const checks = evaluateExpectations(catalog, expectations);
  return { catalog, checks };
}

function main(options = {}) {
  const outputMode = options.outputMode || OUTPUT_MODE;
  const result = runCatalogCheck(options);

  if (outputMode === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else if (outputMode === 'md') {
    renderMarkdown(result);
  } else {
    renderText(result);
  }

  if (result.checks.some(check => !check.ok)) {
    process.exit(1);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  buildCatalog,
  createDocumentSpecs,
  createDocumentSpecsForRoot,
  evaluateExpectations,
  formatExpectation,
  main,
  parseAgentsDocExpectations,
  parseCatalogDescriptionExpectations,
  runCatalogCheck,
  syncCatalogDescription,
  syncEnglishAgents,
};
