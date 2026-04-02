import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const packageLockPath = path.join(rootDir, 'package-lock.json');
const tauriConfigPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
const cargoLockPath = path.join(rootDir, 'src-tauri', 'Cargo.lock');

const semverPattern = /^(\d+)\.(\d+)\.(\d+)$/;

const parseVersion = (value) => {
  const match = value.match(semverPattern);
  if (!match) {
    throw new Error(`Unsupported version format: ${value}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
};

const formatVersion = ({ major, minor, patch }) => `${major}.${minor}.${patch}`;

const getNextVersion = (currentVersion, mode) => {
  if (semverPattern.test(mode)) {
    return mode;
  }

  const current = parseVersion(currentVersion);

  switch (mode) {
    case 'major':
      return formatVersion({ major: current.major + 1, minor: 0, patch: 0 });
    case 'minor':
      return formatVersion({ major: current.major, minor: current.minor + 1, patch: 0 });
    case 'patch':
      return formatVersion({ major: current.major, minor: current.minor, patch: current.patch + 1 });
    default:
      throw new Error(`Unknown bump mode: ${mode}`);
  }
};

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));

const writeJson = async (filePath, data) => {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

const syncCargoTomlVersion = async (version) => {
  const source = await readFile(cargoTomlPath, 'utf8');
  const replaced = source.replace(
    /(\[package\][\s\S]*?version = ")([^"]+)(")/,
    `$1${version}$3`
  );

  if (replaced === source) {
    throw new Error('Unable to update version in Cargo.toml');
  }

  await writeFile(cargoTomlPath, replaced, 'utf8');
};

const syncCargoLockVersion = async (version) => {
  const source = await readFile(cargoLockPath, 'utf8');
  const replaced = source.replace(
    /(\[\[package\]\]\r?\nname = "supersplat-desktop-viewer"\r?\nversion = ")([^"]+)(")/,
    `$1${version}$3`
  );

  if (replaced === source) {
    throw new Error('Unable to update version in Cargo.lock');
  }

  await writeFile(cargoLockPath, replaced, 'utf8');
};

const mode = process.argv[2] ?? 'patch';

const packageJson = await readJson(packageJsonPath);
const nextVersion = getNextVersion(packageJson.version, mode);

packageJson.version = nextVersion;
await writeJson(packageJsonPath, packageJson);

const packageLock = await readJson(packageLockPath);
packageLock.version = nextVersion;
if (packageLock.packages?.['']) {
  packageLock.packages[''].version = nextVersion;
}
await writeJson(packageLockPath, packageLock);

const tauriConfig = await readJson(tauriConfigPath);
tauriConfig.version = nextVersion;
await writeJson(tauriConfigPath, tauriConfig);

await syncCargoTomlVersion(nextVersion);
await syncCargoLockVersion(nextVersion);

process.stdout.write(`${nextVersion}\n`);
