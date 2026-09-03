import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const readJson = path => JSON.parse(read(path));
const fail = message => {
  throw new Error(`Toolchain contract violation: ${message}`);
};

const parseVersion = value => {
  const match = String(value).trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!match) fail(`cannot parse version ${JSON.stringify(value)}`);
  return match.slice(1).map(part => Number(part ?? 0));
};

const compareVersions = (left, right) => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
};

const satisfiesSimpleRange = (version, range) => {
  const comparators = String(range).trim().split(/\s+/).filter(Boolean);
  if (!comparators.length) return false;
  return comparators.every(comparator => {
    const match = comparator.match(/^(>=|<=|>|<|=)?(\d+(?:\.\d+){0,2})$/);
    if (!match) fail(`unsupported engine comparator ${JSON.stringify(comparator)}`);
    const comparison = compareVersions(version, match[2]);
    switch (match[1] ?? '=') {
      case '>=': return comparison >= 0;
      case '<=': return comparison <= 0;
      case '>': return comparison > 0;
      case '<': return comparison < 0;
      default: return comparison === 0;
    }
  });
};

const packageJson = readJson('package.json');
const packageLock = readJson('package-lock.json');
const nodePin = read('.node-version').trim();
const rustToolchain = read('rust-toolchain.toml');
const cargoToml = read('src-tauri/Cargo.toml');
const workflows = [
  ['CI workflow', read('.github/workflows/ci.yml')],
  ['release workflow', read('.github/workflows/release.yml')],
];

const npmPin = packageJson.packageManager?.match(/^npm@(\d+\.\d+\.\d+)$/)?.[1];
const rustPin = rustToolchain.match(/^channel\s*=\s*"(\d+\.\d+\.\d+)"/m)?.[1];
const cargoRustVersion = cargoToml.match(/^rust-version\s*=\s*"(\d+\.\d+(?:\.\d+)?)"/m)?.[1];
const npmUserAgentVersion = process.env.npm_config_user_agent?.match(/\bnpm\/(\d+\.\d+\.\d+)\b/)?.[1];

if (!npmPin) fail('package.json must pin packageManager as npm@MAJOR.MINOR.PATCH');
if (!rustPin) fail('rust-toolchain.toml must pin an exact Rust channel');
if (!cargoRustVersion) fail('src-tauri/Cargo.toml must declare rust-version');
if (process.version.slice(1) !== nodePin) {
  fail(`running Node ${process.version.slice(1)} does not match .node-version ${nodePin}`);
}
if (!npmUserAgentVersion) fail('run this check through npm so its version can be verified');
if (npmUserAgentVersion !== npmPin) {
  fail(`running npm ${npmUserAgentVersion} does not match packageManager npm@${npmPin}`);
}
if (!satisfiesSimpleRange(nodePin, packageJson.engines?.node)) {
  fail(`Node pin ${nodePin} does not satisfy package.json engines.node ${packageJson.engines?.node}`);
}
if (!satisfiesSimpleRange(npmPin, packageJson.engines?.npm)) {
  fail(`npm pin ${npmPin} does not satisfy package.json engines.npm ${packageJson.engines?.npm}`);
}
const lockEngines = packageLock.packages?.['']?.engines;
if (lockEngines?.node !== packageJson.engines?.node || lockEngines?.npm !== packageJson.engines?.npm) {
  fail('package-lock root engines do not match package.json');
}

const rustMajorMinor = rustPin.split('.').slice(0, 2).join('.');
if (cargoRustVersion !== rustPin && cargoRustVersion !== rustMajorMinor) {
  fail(`Cargo rust-version ${cargoRustVersion} does not match Rust pin ${rustPin}`);
}

for (const [name, workflow] of workflows) {
  const setupNodeCount = [...workflow.matchAll(/uses:\s*actions\/setup-node@/g)].length;
  const nodePinRefs = [...workflow.matchAll(/node-version-file:\s*\.node-version/g)].length;
  const npmSetupVersions = [...workflow.matchAll(/npm install --global npm@(\d+\.\d+\.\d+)/g)]
    .map(match => match[1]);
  const setupRustCount = [...workflow.matchAll(/uses:\s*dtolnay\/rust-toolchain@/g)].length;
  const rustVersions = [...workflow.matchAll(/toolchain:\s*(\d+\.\d+\.\d+)/g)]
    .map(match => match[1]);

  if (setupNodeCount !== nodePinRefs || setupNodeCount !== npmSetupVersions.length) {
    fail(`${name} must use .node-version and install pinned npm for every setup-node step`);
  }
  if (npmSetupVersions.some(version => version !== npmPin)) {
    fail(`${name} npm setup does not match packageManager npm@${npmPin}`);
  }
  if (setupRustCount !== rustVersions.length || rustVersions.some(version => version !== rustPin)) {
    fail(`${name} Rust setup does not match rust-toolchain.toml ${rustPin}`);
  }
}

console.log(`Toolchain contract verified: Node ${nodePin}, npm ${npmPin}, Rust ${rustPin}`);
