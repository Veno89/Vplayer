# VPlayer release policy

VPlayer releases are built from immutable `vMAJOR.MINOR.PATCH` tags. The tag must match
`package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and
`src-tauri/tauri.conf.json`. Run `npm run check:versions` before creating a tag.

## Required gates

The release workflow must pass the frontend typecheck, tests, and production build; the
production npm advisory gate; Rust formatting, compilation, strict Clippy, and all Rust
tests. The workflow also installs a pinned `cargo-audit` release and checks the lockfile
against current RustSec data. `RUSTSEC-2026-0235` is explicitly ignored because it exists
only behind `rust_decimal`'s inactive optional `rkyv` feature and is absent from the Windows
release target graph; the exception must be removed if that feature ever becomes active.
Release actions are pinned to full commit SHAs, the Rust toolchain is pinned to 1.91.0,
and the workflow checks out full history so the exact tagged revision is retained.

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
