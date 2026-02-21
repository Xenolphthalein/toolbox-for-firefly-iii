#!/usr/bin/env npx tsx

import * as fs from 'node:fs';
import * as path from 'node:path';

type BumpType = 'major' | 'minor' | 'bugfix';

interface PackageJsonFile {
  version?: unknown;
}

interface PackageLockFile {
  version?: unknown;
  packages?: Record<string, { version?: unknown }>;
}

const VERSION_REGEX = /^(\d+)\.(\d+)\.(\d+)$/;
const SETTINGS_VERSION_REGEX =
  /(\{\{\s*t\('settings\.version'\)\s*\}\}\s*<\/span>\s*[\r\n]+\s*<span class="text-body-2 font-weight-medium">)(\d+\.\d+\.\d+)(<\/span>)/m;

const ROOT_DIR = process.cwd();
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const PACKAGE_LOCK_PATH = path.join(ROOT_DIR, 'package-lock.json');
const SETTINGS_VIEW_PATH = path.join(ROOT_DIR, 'src/client/views/SettingsView.vue');

function printUsage(): void {
  console.log(`Usage: npm run bump -- <major|minor|bugfix>

Examples:
  npm run bump -- major
  npm run bump -- minor
  npm run bump -- bugfix`);
}

function parseBumpType(): BumpType {
  const bumpType = process.argv[2]?.toLowerCase();

  if (bumpType !== 'major' && bumpType !== 'minor' && bumpType !== 'bugfix') {
    printUsage();
    process.exit(1);
  }

  return bumpType;
}

function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function parseVersion(value: string, label: string): [number, number, number] {
  const match = VERSION_REGEX.exec(value);
  if (!match) {
    throw new Error(`Invalid version in ${label}: "${value}"`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function bumpVersion(currentVersion: string, bumpType: BumpType): string {
  const [major, minor, patch] = parseVersion(currentVersion, 'current version');

  switch (bumpType) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'bugfix':
      return `${major}.${minor}.${patch + 1}`;
  }
}

function extractSettingsVersion(fileContent: string): string {
  const match = SETTINGS_VERSION_REGEX.exec(fileContent);
  if (!match) {
    throw new Error(`Could not find app version markup in ${path.relative(ROOT_DIR, SETTINGS_VIEW_PATH)}`);
  }

  return match[2];
}

function replaceSettingsVersion(fileContent: string, newVersion: string): string {
  const match = SETTINGS_VERSION_REGEX.exec(fileContent);
  if (!match) {
    throw new Error(`Could not find app version markup in ${path.relative(ROOT_DIR, SETTINGS_VIEW_PATH)}`);
  }

  return fileContent.replace(SETTINGS_VERSION_REGEX, `$1${newVersion}$3`);
}

function ensureAllVersionsMatch(versionEntries: Array<[string, string]>): string {
  for (const [label, version] of versionEntries) {
    parseVersion(version, label);
  }

  const uniqueVersions = new Set(versionEntries.map(([, version]) => version));
  if (uniqueVersions.size !== 1) {
    const details = versionEntries
      .map(([label, version]) => `- ${label}: ${version}`)
      .join('\n');
    throw new Error(
      `Version mismatch detected. Align versions before bumping:\n${details}`
    );
  }

  return versionEntries[0][1];
}

function main(): void {
  const bumpType = parseBumpType();

  const packageJson = readJsonFile<PackageJsonFile>(PACKAGE_JSON_PATH);
  const packageLock = readJsonFile<PackageLockFile>(PACKAGE_LOCK_PATH);
  const settingsView = fs.readFileSync(SETTINGS_VIEW_PATH, 'utf-8');

  if (typeof packageJson.version !== 'string') {
    throw new Error(`Missing or invalid version in ${path.relative(ROOT_DIR, PACKAGE_JSON_PATH)}`);
  }

  if (typeof packageLock.version !== 'string') {
    throw new Error(`Missing or invalid version in ${path.relative(ROOT_DIR, PACKAGE_LOCK_PATH)}`);
  }

  const rootPackage = packageLock.packages?.[''];
  if (!rootPackage || typeof rootPackage.version !== 'string') {
    throw new Error(
      `Missing or invalid packages[""].version in ${path.relative(ROOT_DIR, PACKAGE_LOCK_PATH)}`
    );
  }

  const settingsVersion = extractSettingsVersion(settingsView);

  const currentVersion = ensureAllVersionsMatch([
    ['package.json version', packageJson.version],
    ['package-lock.json version', packageLock.version],
    ['package-lock.json packages[""].version', rootPackage.version],
    ['src/client/views/SettingsView.vue version', settingsVersion],
  ]);

  const nextVersion = bumpVersion(currentVersion, bumpType);

  packageJson.version = nextVersion;
  packageLock.version = nextVersion;
  rootPackage.version = nextVersion;
  const nextSettingsView = replaceSettingsVersion(settingsView, nextVersion);

  writeJsonFile(PACKAGE_JSON_PATH, packageJson);
  writeJsonFile(PACKAGE_LOCK_PATH, packageLock);
  fs.writeFileSync(SETTINGS_VIEW_PATH, nextSettingsView, 'utf-8');

  console.log(`Version bumped (${bumpType}): ${currentVersion} -> ${nextVersion}`);
  console.log('Updated files:');
  console.log(`- ${path.relative(ROOT_DIR, PACKAGE_JSON_PATH)}`);
  console.log(`- ${path.relative(ROOT_DIR, PACKAGE_LOCK_PATH)}`);
  console.log(`- ${path.relative(ROOT_DIR, SETTINGS_VIEW_PATH)}`);
}

main();
