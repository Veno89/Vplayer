import { readFileSync } from 'node:fs';

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const packageJson = readJson('package.json');
const packageLock = readJson('package-lock.json');
const tauriConfig = readJson('src-tauri/tauri.conf.json');
const cargoToml = readFileSync('src-tauri/Cargo.toml', 'utf8');
const cargoLock = readFileSync('src-tauri/Cargo.lock', 'utf8');
const musicBrainzApi = readFileSync('src/services/MusicBrainzAPI.ts', 'utf8');
const optionsWindow = readFileSync('src/windows/OptionsWindowEnhanced.tsx', 'utf8');
const advancedTab = readFileSync('src/windows/options/AdvancedTab.tsx', 'utf8');

const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const cargoLockVersion = cargoLock.match(/\[\[package\]\]\s*\r?\nname = "vplayer"\s*\r?\nversion = "([^"]+)"/m)?.[1];
const musicBrainzVersion = musicBrainzApi.match(/VPlayer\/(\d+\.\d+\.\d+)/)?.[1];
const optionsFallbackVersion = optionsWindow.match(/useState\('(\d+\.\d+\.\d+)'\)/)?.[1];
const advancedFallbackVersion = advancedTab.match(/useState\('(\d+\.\d+\.\d+)'\)/)?.[1];
const versions = new Map([
  ['package.json', packageJson.version],
  ['package-lock.json', packageLock.version],
  ['package-lock root package', packageLock.packages?.['']?.version],
  ['src-tauri/Cargo.toml', cargoVersion],
  ['src-tauri/Cargo.lock', cargoLockVersion],
  ['src-tauri/tauri.conf.json', tauriConfig.version],
  ['MusicBrainz user agent', musicBrainzVersion],
  ['About window fallback', optionsFallbackVersion],
  ['Advanced settings fallback', advancedFallbackVersion],
]);

const missing = [...versions].filter(([, value]) => !value).map(([name]) => name);
if (missing.length) {
  throw new Error(`Could not read a version from: ${missing.join(', ')}`);
}

const uniqueVersions = new Set(versions.values());
if (uniqueVersions.size !== 1) {
  const details = [...versions].map(([name, value]) => `${name}=${value}`).join(', ');
  throw new Error(`Version mismatch: ${details}`);
}

const version = [...uniqueVersions][0];
const githubTag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined;
const tag = process.env.RELEASE_TAG || githubTag;
if (tag && tag !== `v${version}`) {
  throw new Error(`Release tag ${tag} does not match application version v${version}`);
}

console.log(`Version contract verified: v${version}`);
