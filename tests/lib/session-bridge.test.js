/**
 * Tests for scripts/lib/session-bridge.js
 *
 * Run with: node tests/lib/session-bridge.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  sanitizeSessionId,
  getBridgePath,
  readBridge,
  writeBridgeAtomic,
  resolveSessionId,
  resolveSessionIdFromLatestTranscript,
  MAX_SESSION_ID_LENGTH,
} = require('../../scripts/lib/session-bridge');

// Mirrors the private slugifyProjectPath() in session-bridge.js, so tests can
// build a fixture transcript directory at the exact path the function under
// test will look for, without exporting an internal helper just for this.
function slugForTest(cwd) {
  return cwd.replace(/[\\/:]/g, '-');
}

function makeFakeProjectDir(homeDir, cwd) {
  const projectDir = path.join(homeDir, '.claude', 'projects', slugForTest(cwd));
  fs.mkdirSync(projectDir, { recursive: true });
  return projectDir;
}

function writeTranscript(projectDir, sessionId, mtime) {
  const file = path.join(projectDir, `${sessionId}.jsonl`);
  fs.writeFileSync(file, '{}\n');
  fs.utimesSync(file, mtime, mtime);
  return file;
}

// Test helper
function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    return true;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function runTests() {
  console.log('\n=== Testing session-bridge.js ===\n');

  let passed = 0;
  let failed = 0;

  // sanitizeSessionId tests
  console.log('sanitizeSessionId:');

  if (
    test('valid ID passes through', () => {
      assert.strictEqual(sanitizeSessionId('abc-123'), 'abc-123');
    })
  )
    passed++;
  else failed++;

  if (
    test('path traversal returns null', () => {
      assert.strictEqual(sanitizeSessionId('../etc/passwd'), null);
    })
  )
    passed++;
  else failed++;

  if (
    test('forward slash returns null', () => {
      assert.strictEqual(sanitizeSessionId('/tmp/evil'), null);
    })
  )
    passed++;
  else failed++;

  if (
    test('backslash returns null', () => {
      assert.strictEqual(sanitizeSessionId('a\\b'), null);
    })
  )
    passed++;
  else failed++;

  if (
    test('null input returns null', () => {
      assert.strictEqual(sanitizeSessionId(null), null);
    })
  )
    passed++;
  else failed++;

  if (
    test('empty string returns null', () => {
      assert.strictEqual(sanitizeSessionId(''), null);
    })
  )
    passed++;
  else failed++;

  if (
    test('long string is truncated to MAX_SESSION_ID_LENGTH', () => {
      const longId = 'a'.repeat(100);
      const result = sanitizeSessionId(longId);
      assert.ok(result, 'Should not return null for valid chars');
      assert.strictEqual(result.length, MAX_SESSION_ID_LENGTH);
    })
  )
    passed++;
  else failed++;

  // getBridgePath tests
  console.log('\ngetBridgePath:');

  if (
    test('returns path containing ecc-metrics-', () => {
      const p = getBridgePath('test-session');
      assert.ok(p.includes('ecc-metrics-'), `Expected ecc-metrics- in path, got: ${p}`);
    })
  )
    passed++;
  else failed++;

  // writeBridgeAtomic + readBridge roundtrip
  console.log('\nwriteBridgeAtomic / readBridge:');

  if (
    test('roundtrip write then read returns same data', () => {
      const testId = `test-bridge-${Date.now()}`;
      const data = { session_id: testId, tool_count: 42 };
      try {
        writeBridgeAtomic(testId, data);
        const result = readBridge(testId);
        assert.deepStrictEqual(result, data);
      } finally {
        // Clean up
        try {
          fs.unlinkSync(getBridgePath(testId));
        } catch {
          /* ignore */
        }
      }
    })
  )
    passed++;
  else failed++;

  if (
    test('readBridge with nonexistent session returns null', () => {
      const result = readBridge('nonexistent-session-id-999');
      assert.strictEqual(result, null);
    })
  )
    passed++;
  else failed++;

  // Concurrency contract: two processes writing to the same session
  // bridge must not throw ENOENT and must never leave a corrupt JSON
  // file behind. The previous implementation used a fixed `${target}.tmp`
  // suffix; with concurrent writers it raced over a shared tmp path,
  // producing both ENOENT on rename and (occasionally) a half-written
  // payload on the destination.
  //
  // This test exercises the atomic-rename primitive only — it does NOT
  // attempt to defend against the read-modify-write race in callers,
  // which is a separate concern. Each subprocess writes its own
  // independent payload N times; we assert (a) every process exits 0
  // (no ENOENT bubbled up) and (b) the final file is always parseable
  // JSON whose contents match one of the two writers' last payloads.

  if (
    test('concurrent writeBridgeAtomic does not throw ENOENT or corrupt the bridge file', () => {
      // Spawn two child processes that BOTH stay alive at the same time
      // and call writeBridgeAtomic in a tight loop. `spawnSync` would
      // run them sequentially (blocking on each), which would never
      // exercise the race the fix targets. Instead a sync runner script
      // launches both as async `spawn` children inside its own process,
      // waits for both to exit, and reports their statuses on stdout —
      // and the test calls *that* runner via `spawnSync`. The runner is
      // the only place that needs the event loop.
      const { spawnSync } = require('child_process');
      const path = require('path');
      const testId = `test-bridge-race-${Date.now()}-${process.pid}`;
      const writerPath = path.join(__dirname, '..', '__tmp_bridge_writer.js');
      const runnerPath = path.join(__dirname, '..', '__tmp_bridge_race_runner.js');
      const bridgeLib = path.join(__dirname, '..', '..', 'scripts', 'lib', 'session-bridge');
      fs.writeFileSync(
        writerPath,
        [
          "const { writeBridgeAtomic } = require(" + JSON.stringify(bridgeLib) + ");",
          "const [, , sid, tag] = process.argv;",
          "for (let i = 0; i < 200; i++) {",
          "  writeBridgeAtomic(sid, { writer: tag, i });",
          "}",
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(
        runnerPath,
        [
          "'use strict';",
          "const { spawn } = require('child_process');",
          "const [, , writerPath, sid] = process.argv;",
          "const c1 = spawn(process.execPath, [writerPath, sid, 'A'], { stdio: ['ignore','pipe','pipe'] });",
          "const c2 = spawn(process.execPath, [writerPath, sid, 'B'], { stdio: ['ignore','pipe','pipe'] });",
          "const exits = {};",
          "const stderrs = { A: '', B: '' };",
          "c1.stderr.on('data', chunk => { stderrs.A += chunk.toString(); });",
          "c2.stderr.on('data', chunk => { stderrs.B += chunk.toString(); });",
          "let done = 0;",
          "function onExit(tag) { return function(code) { exits[tag] = code; if (++done === 2) finish(); }; }",
          "c1.on('exit', onExit('A'));",
          "c2.on('exit', onExit('B'));",
          "function finish() {",
          "  process.stdout.write(JSON.stringify({ exits, stderrs }));",
          "  process.exit(0);",
          "}",
        ].join('\n'),
        'utf8'
      );
      try {
        const result = spawnSync('node', [runnerPath, writerPath, testId], { encoding: 'utf8' });
        assert.strictEqual(result.status, 0,
          `race runner should exit 0, got ${result.status}: ${result.stderr}`);
        const parsed = JSON.parse(result.stdout);
        assert.strictEqual(parsed.exits.A, 0,
          `writer A should exit 0 (no ENOENT), got ${parsed.exits.A}: ${parsed.stderrs.A}`);
        assert.strictEqual(parsed.exits.B, 0,
          `writer B should exit 0 (no ENOENT), got ${parsed.exits.B}: ${parsed.stderrs.B}`);
        // Final file must be parseable JSON and belong to one of the writers.
        const final = readBridge(testId);
        assert.ok(final && typeof final === 'object',
          `expected parseable JSON object, got: ${JSON.stringify(final)}`);
        assert.ok(final.writer === 'A' || final.writer === 'B',
          `expected last-writer-wins payload, got: ${JSON.stringify(final)}`);
      } finally {
        try { fs.unlinkSync(getBridgePath(testId)); } catch { /* ignore */ }
        try { fs.unlinkSync(writerPath); } catch { /* ignore */ }
        try { fs.unlinkSync(runnerPath); } catch { /* ignore */ }
      }
    })
  )
    passed++;
  else failed++;

  if (
    test('writeBridgeAtomic cleans up its tmp file on renameSync failure', () => {
      // Trigger renameSync failure by passing a sessionId whose path is
      // already a directory. The tmp file exists at this point; the fix
      // must not leak it behind.
      const path = require('path');
      const testId = `test-bridge-cleanup-${Date.now()}-${process.pid}`;
      const target = getBridgePath(testId);
      const os = require('os');
      const tmpDir = os.tmpdir();
      // Plant a directory at the target path so renameSync (target.tmp → target) fails.
      fs.mkdirSync(target);
      try {
        assert.throws(
          () => writeBridgeAtomic(testId, { x: 1 }),
          // renameSync of a regular file onto an existing directory throws
          // EISDIR on Linux, EPERM on macOS, ENOTDIR on some BSDs. Accept
          // any of those so the test stays portable across CI runners.
          /EISDIR|EPERM|ENOTDIR|ENOENT/,
          'expected rename failure to surface'
        );
        // Count any leaked tmp files. The pid+nonce suffix is unique per
        // call, so we look for any matching pattern under os.tmpdir().
        const prefix = path.basename(target) + '.' + process.pid + '.';
        const leaked = fs.readdirSync(tmpDir).filter(f => f.startsWith(prefix) && f.endsWith('.tmp'));
        assert.strictEqual(leaked.length, 0,
          `expected no leaked tmp files after rename failure, found: ${leaked.join(', ')}`);
      } finally {
        try { fs.rmdirSync(target); } catch { /* ignore */ }
      }
    })
  )
    passed++;
  else failed++;

  // resolveSessionId tests
  console.log('\nresolveSessionId:');

  if (
    test('resolveSessionId uses ECC_SESSION_ID env var', () => {
      const original = process.env.ECC_SESSION_ID;
      try {
        process.env.ECC_SESSION_ID = 'env-session-42';
        const result = resolveSessionId();
        assert.strictEqual(result, 'env-session-42');
      } finally {
        if (original === undefined) {
          delete process.env.ECC_SESSION_ID;
        } else {
          process.env.ECC_SESSION_ID = original;
        }
      }
    })
  )
    passed++;
  else failed++;

  if (
    test('MAX_SESSION_ID_LENGTH is 64', () => {
      assert.strictEqual(MAX_SESSION_ID_LENGTH, 64);
    })
  )
    passed++;
  else failed++;

  // resolveSessionIdFromLatestTranscript tests
  //
  // Regression coverage for the /estimate bug (session_id: null never joins
  // the Stop hook's session-rollup row): a plain Bash-tool subprocess never
  // receives ECC_SESSION_ID/CLAUDE_SESSION_ID, so resolveSessionId() must
  // fall back to inferring the current session from the most recently
  // modified transcript under ~/.claude/projects/<slug>/*.jsonl.
  console.log('\nresolveSessionIdFromLatestTranscript:');

  if (
    test('returns null when the project has no transcript directory', () => {
      const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'session-bridge-test-'));
      try {
        const result = resolveSessionIdFromLatestTranscript(path.join(tmpHome, 'no-such-project'), { homeDir: tmpHome });
        assert.strictEqual(result, null);
      } finally {
        fs.rmSync(tmpHome, { recursive: true, force: true });
      }
    })
  )
    passed++;
  else failed++;

  if (
    test('picks the most recently modified top-level transcript', () => {
      const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'session-bridge-test-'));
      try {
        const cwd = path.join(tmpHome, 'project');
        const projectDir = makeFakeProjectDir(tmpHome, cwd);
        const now = Date.now();
        writeTranscript(projectDir, 'older-session-id', new Date(now - 60000));
        writeTranscript(projectDir, 'newer-session-id', new Date(now));

        const result = resolveSessionIdFromLatestTranscript(cwd, { homeDir: tmpHome });
        assert.strictEqual(result, 'newer-session-id');
      } finally {
        fs.rmSync(tmpHome, { recursive: true, force: true });
      }
    })
  )
    passed++;
  else failed++;

  if (
    test('ignores a subdirectory named after a session id (subagent transcripts live there, not at top level)', () => {
      const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'session-bridge-test-'));
      try {
        const cwd = path.join(tmpHome, 'project');
        const projectDir = makeFakeProjectDir(tmpHome, cwd);
        const now = new Date();
        writeTranscript(projectDir, 'real-session-id', now);
        // A directory that shares a transcript's naming shape must never be
        // mistaken for a session file.
        fs.mkdirSync(path.join(projectDir, 'nested-session-id.jsonl'));

        const result = resolveSessionIdFromLatestTranscript(cwd, { homeDir: tmpHome });
        assert.strictEqual(result, 'real-session-id');
      } finally {
        fs.rmSync(tmpHome, { recursive: true, force: true });
      }
    })
  )
    passed++;
  else failed++;

  if (
    test('resolveSessionId falls back to the transcript heuristic when no env var is set', () => {
      const originalEcc = process.env.ECC_SESSION_ID;
      const originalClaude = process.env.CLAUDE_SESSION_ID;
      const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'session-bridge-test-'));
      try {
        delete process.env.ECC_SESSION_ID;
        delete process.env.CLAUDE_SESSION_ID;
        const cwd = path.join(tmpHome, 'project');
        const projectDir = makeFakeProjectDir(tmpHome, cwd);
        writeTranscript(projectDir, 'fallback-session-id', new Date());

        const result = resolveSessionId({ cwd, homeDir: tmpHome });
        assert.strictEqual(result, 'fallback-session-id');
      } finally {
        fs.rmSync(tmpHome, { recursive: true, force: true });
        if (originalEcc === undefined) delete process.env.ECC_SESSION_ID; else process.env.ECC_SESSION_ID = originalEcc;
        if (originalClaude === undefined) delete process.env.CLAUDE_SESSION_ID; else process.env.CLAUDE_SESSION_ID = originalClaude;
      }
    })
  )
    passed++;
  else failed++;

  if (
    test('resolveSessionId still prefers the env var over the transcript fallback', () => {
      const originalEcc = process.env.ECC_SESSION_ID;
      const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'session-bridge-test-'));
      try {
        const cwd = path.join(tmpHome, 'project');
        const projectDir = makeFakeProjectDir(tmpHome, cwd);
        writeTranscript(projectDir, 'transcript-session-id', new Date());
        process.env.ECC_SESSION_ID = 'env-wins-session-id';

        const result = resolveSessionId({ cwd, homeDir: tmpHome });
        assert.strictEqual(result, 'env-wins-session-id');
      } finally {
        fs.rmSync(tmpHome, { recursive: true, force: true });
        if (originalEcc === undefined) delete process.env.ECC_SESSION_ID; else process.env.ECC_SESSION_ID = originalEcc;
      }
    })
  )
    passed++;
  else failed++;

  // Summary
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

const { failed } = runTests();
process.exit(failed > 0 ? 1 : 0);
