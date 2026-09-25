import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'wiki-interest.ts');

test('CLI help gives a small-model usable command shape', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', cli, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /discover.*--source/);
  assert.match(result.stdout, /analyze.*--manifest/);
});

test('CLI rejects missing manifest with a useful error', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', cli, 'analyze', '--out', '/tmp/report'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--manifest/);
});

test('refresh flag is accepted without a value', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', cli, 'analyze', '--refresh', '--out', '/tmp/report'],
    { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--manifest is required/);
});
