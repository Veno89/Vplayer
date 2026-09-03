# VPlayer release policy

VPlayer releases are built from immutable `vMAJOR.MINOR.PATCH` tags. The tag must match
every application version source enforced by `scripts/check-version.mjs`, including the npm,
Cargo, and Tauri manifests plus network and UI fallback versions. Run
`npm run check:versions` before creating a tag.

## Required gates

The release workflow must pass the frontend typecheck, tests, and production build; the
full npm dependency advisory gate; Rust formatting, compilation, strict Clippy, and all Rust
tests. The workflow also installs a pinned `cargo-audit` release and checks the lockfile
against current RustSec data without ignored advisories. Release actions are pinned to full
commit SHAs, Node is pinned by `.node-version` to 24.20.0 LTS, Rust is pinned by
`rust-toolchain.toml` and the workflow to 1.98.0, and the workflow checks out full history so
the exact tagged revision is retained.

The same frontend and native gates, including a no-bundle Tauri integration build, run on
every pull request and every push to `main`. This validates Dependabot and ordinary changes
before a release tag is created. CI deliberately uses `windows-latest` as an early compatibility
signal. Artifact-producing release jobs use the explicit `windows-2025` runner family, and the
generated evidence records the actual hosted image, Node, npm, rustc, and Cargo versions.

The workflow creates a **draft** GitHub release only after those gates pass. It requires the
Tauri updater private key and password, verifies that updater `.sig` files exist, and attaches:

- SHA-256 checksums for every generated bundle artifact;
- the source commit, tag, workflow run, installer hashes, and signature state;
- an npm CycloneDX SBOM and locked Cargo dependency metadata.

## Two distinct Windows signatures

Tauri updater signatures authenticate update files to an installed VPlayer client. They do
not establish a trusted Windows publisher or suppress SmartScreen warnings. Authenticode is
the Windows publisher signature and requires a separate code-signing certificate or signing
service.

Do not publish the draft until `release-evidence.json` reports `Valid` Authenticode status for
every NSIS installer. If it reports `NotSigned`, keep the release as a draft, configure the
Windows signing certificate/service using Tauri's Windows signing support, rebuild from the
same tag, and re-check the evidence. Never describe updater-only signing as Authenticode.

## Release procedure

1. Update the changelog and every version source, then run `npm run check:versions`.
2. Run `npm run verify:frontend` and all Rust gates used by the workflow.
3. Commit and push `main` without unrelated working-tree files.
4. Create the annotated version tag on that exact commit and push the tag.
5. Inspect the draft's checksums, dependency manifests, updater signature, commit, and
   Authenticode status. Publish only when all evidence is correct and Authenticode is valid.

## Dependency and toolchain maintenance

Dependabot checks npm, Cargo, and GitHub Actions weekly. At least monthly, also check the
current Node LTS patch and npm release, the current stable Rust release, and the pinned
`cargo-audit` release. Keep `.node-version`, `package.json` (`engines` and `packageManager`),
`rust-toolchain.toml`, `src-tauri/Cargo.toml` (`rust-version`), and both workflows synchronized,
then regenerate the relevant lockfile and run the full frontend and native gates.
