import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { register } from 'node:module';

register('./typescript-loader.mjs', import.meta.url);
const { BLENDER_SCRIPT } = await import('../src/data/blenderScript.ts');

test('download and copy use exactly the standalone Python script', () => {
  assert.equal(BLENDER_SCRIPT, readFileSync(new URL('../public/khufu_great_pyramid.py', import.meta.url), 'utf8'));
});

const blender = process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender';
test('Blender generates, saves, reopens and imports a usable animated project', {
  skip: !existsSync(blender) && !process.env.BLENDER_BIN ? 'Set BLENDER_BIN to run Blender integration checks' : false,
  timeout: 120_000,
}, () => {
  const folder = mkdtempSync(join(tmpdir(), 'khufu-export-test-'));
  const output = join(folder, 'nested output', '金字塔');
  try {
    const result = spawnSync(blender, ['--background', '--factory-startup', '--python-exit-code', '1',
      '--python', new URL('./blender_export_check.py', import.meta.url).pathname, '--', output], {
      encoding: 'utf8', timeout: 110_000, maxBuffer: 5 * 1024 * 1024,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /KHUFU_BLENDER_CHECKS_PASSED/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
