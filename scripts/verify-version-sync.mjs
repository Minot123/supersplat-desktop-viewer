import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const fixture = await mkdtemp(path.join(os.tmpdir(), 'supersplat-version-test-'));
try {
  await mkdir(path.join(fixture, 'scripts'));
  await mkdir(path.join(fixture, 'src-tauri'));
  await cp(new URL('./bump-version.mjs', import.meta.url), path.join(fixture, 'scripts/bump-version.mjs'));
  const files = {
    'package.json': JSON.stringify({ version: '3.0.3' }),
    'package-lock.json': JSON.stringify({ version: '3.0.3', packages: { '': { version: '3.0.3' } } }),
    'upstream-versions.json': JSON.stringify({ editor: { version: '3.5.2' } }),
    'src-tauri/tauri.conf.json': JSON.stringify({ version: '3.0.3' }),
    'src-tauri/Cargo.toml': '[package]\nname = "supersplat-desktop-viewer"\nversion = "3.0.3"\n',
    'src-tauri/Cargo.lock': '[[package]]\nname = "supersplat-desktop-viewer"\nversion = "3.0.3"\n'
  };
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(fixture, name), content);
  }
  for (let run = 0; run < 2; run++) {
    assert.equal(execFileSync(process.execPath, ['scripts/bump-version.mjs', 'editor'], {
      cwd: fixture, encoding: 'utf8'
    }).trim(), '3.5.2');
    for (const name of ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json']) {
      assert.equal(JSON.parse(await readFile(path.join(fixture, name), 'utf8')).version, '3.5.2');
    }
    const lock = JSON.parse(await readFile(path.join(fixture, 'package-lock.json'), 'utf8'));
    assert.equal(lock.packages[''].version, '3.5.2');
    for (const name of ['src-tauri/Cargo.toml', 'src-tauri/Cargo.lock']) {
      assert.match(await readFile(path.join(fixture, name), 'utf8'), /version = "3\.5\.2"/);
    }
  }
  await writeFile(path.join(fixture, 'upstream-versions.json'), JSON.stringify({ editor: { version: 'invalid' } }));
  assert.throws(() => execFileSync(process.execPath, ['scripts/bump-version.mjs', 'editor'], {
    cwd: fixture, stdio: 'pipe'
  }));
  assert.equal(JSON.parse(await readFile(path.join(fixture, 'package.json'), 'utf8')).version, '3.5.2');
  console.log('Editor version sync: all manifests updated, repeated builds stable, invalid versions rejected');
} finally {
  await rm(fixture, { recursive: true, force: true });
}
