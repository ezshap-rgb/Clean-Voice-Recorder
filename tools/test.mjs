// Compiles the pure audio core to CommonJS and runs the test suite with Node's
// built-in test runner. Everything is spawned with `process.execPath` so it works
// without a shell (some Windows setups block cmd.exe spawning from npm).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readdirSync, rmSync } from 'node:fs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = resolve(projectRoot, '.test-build');

function run(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`\nFailed to run ${label}:`, result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\n${label} failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

rmSync(buildDir, { recursive: true, force: true });

console.log('> Compiling audio core and tests...');
run([resolve(projectRoot, 'node_modules/typescript/lib/tsc.js'), '-p', 'tsconfig.test.json'], 'tsc');

/**
 * Node's test runner does not always expand a directory argument, so collect the
 * compiled test files explicitly.
 */
function collectTestFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) found.push(...collectTestFiles(fullPath));
    else if (entry.name.endsWith('.test.js')) found.push(fullPath);
  }
  return found;
}

const testFiles = collectTestFiles(resolve(buildDir, 'test'));
if (testFiles.length === 0) {
  console.error('No compiled test files found.');
  process.exit(1);
}

console.log(`\n> Running ${testFiles.length} test files...`);
run(['--test', ...testFiles], 'node --test');
