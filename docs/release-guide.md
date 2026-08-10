# Release Guide

This document describes the release process for Screen Memory.

## Overview

Screen Memory is distributed via:

- **GitHub Releases** - Primary distribution channel with auto-updates
- **Homebrew Cask** - For macOS users who prefer package managers

## Prerequisites

- GitHub CLI (`gh`) installed and authenticated
- Write access to `itsrafsanjani/screen-memory` repository
- Write access to `itsrafsanjani/homebrew-screen-memory` tap repository

> **Releasing from a fork.** The `gh` commands below name the upstream repo explicitly. In a fork,
> `gh` still resolves the default repo to upstream, so **every `gh` command needs `-R <owner>/screen-memory`
> for your own fork** or it will read — and in the case of `gh release edit`, write — upstream instead.
> The workflows themselves need no changes: both derive the publish target from `github.repository_owner`
> and `github.event.repository.name`, so a fork releases to itself.

## Release Steps

### 1. Prepare the Release

Ensure all changes are merged to `main` and the codebase is in a releasable state:

```bash
git checkout main
git pull origin main
```

### 2. Version Bump (if needed)

The version is defined in `package.json`. Update it if necessary:

```bash
# Example: bump to 0.0.2
npm version 0.0.2 --no-git-tag-version
```

Then commit the version change:

```bash
git add package.json
git commit -m "chore: bump version to 0.0.2"
git push origin main
```

### 3. Create Git Tag and Trigger Release

This is the point of no return: a tag push publishes a live release, and the workflow refuses to
overwrite one (see step 5). Make sure CI is green on the exact commit you are about to tag — it runs
the same build, verify, sign and package sequence with `--publish never`, so a green CI run is a full
dry run of the release.

The tag must match `package.json`. The workflow reconciles the two and fails loudly if they differ,
rather than quietly publishing the package.json version under a different tag name.

```bash
# Create an annotated tag
git tag -a v0.0.1 -m "Release v0.0.1"

# Push it BY NAME to trigger the GitHub Actions workflow
git push origin v0.0.1
```

Push the tag **by name**, not with `git push --tags`. Every local tag matches the workflow's `v*`
trigger, so `--tags` can start extra release runs for old versions — which then fail the
version-match check above.

Recreating a tag (`git tag -d` / `git push origin :refs/tags/...`) only works while the release is
still a draft. Once a release is published, re-pushing the tag will not republish it; bump the
version instead.

The `.github/workflows/release.yml` workflow will automatically:

- Build the Swift helper binaries (`screen-memory-ocr` and `screen-memory-appstate`)
- Build the Electron app for macOS ARM64
- Write the auto-updater feed (`app-update.yml`) into the bundle
- Verify the packaged app carries its helpers, migrations and update feed
- Ad-hoc sign the app bundle
- Create DMG and ZIP artifacts
- Publish to GitHub Releases

### 4. Monitor Release Build

Check the workflow status:

```bash
gh run list -R itsrafsanjani/screen-memory
gh run watch <run-id> -R itsrafsanjani/screen-memory
```

Or view at: https://github.com/itsrafsanjani/screen-memory/actions

### 5. Publish the Release

A tag push publishes the release live — there is no draft step to complete. The release is only
created as a draft when it is started manually from the Actions tab (`workflow_dispatch`) with the
`draft` input left on. In that case, publish it with:

```bash
gh release edit v0.0.1 --draft=false -R itsrafsanjani/screen-memory
```

Because a tag push publishes directly, the workflow guards against clobbering a live release: if the
tag already has a _published_ release it fails immediately rather than replacing its assets. A
published version number cannot be reused — bump the version and tag again.

Verify the release assets — expect five:

- `Screen-Memory-{version}-arm64.dmg` and its `.blockmap`
- `Screen-Memory-{version}-arm64.zip` and its `.blockmap`
- `latest-mac.yml` (required for auto-updates)

```bash
gh release view v0.0.1 -R itsrafsanjani/screen-memory --json assets --jq '.assets[].name'
```

The build is ad-hoc signed and never notarized, so a downloaded DMG is blocked by Gatekeeper. The
release notes need to say so, or the app looks broken to everyone who downloads it:

> Right-click the app and choose **Open**, or run
> `xattr -dr com.apple.quarantine "/Applications/Screen Memory.app"`.

### 6. Update Homebrew Cask

#### 6.1 Get the SHA256 of the DMG

```bash
curl -L -o /tmp/screen-memory.dmg \
  https://github.com/itsrafsanjani/screen-memory/releases/download/v0.0.1/Screen-Memory-0.0.1-arm64.dmg

shasum -a 256 /tmp/screen-memory.dmg
# Output: f8e96fd562cffea0b54860ac2557a5c4ce75126c4365ce24d37725aad744a8b2
```

#### 6.2 Update the Cask File

Clone the tap repository:

```bash
git clone https://github.com/itsrafsanjani/homebrew-screen-memory.git
cd homebrew-screen-memory
```

Edit `Casks/screen-memory.rb`:

```ruby
cask "screen-memory" do
  version "0.0.1"  # Update version
  sha256 "f8e96fd562cffea0b54860ac2557a5c4ce75126c4365ce24d37725aad744a8b2"  # Update SHA256

  url "https://github.com/itsrafsanjani/screen-memory/releases/download/v#{version}/Screen-Memory-#{version}-arm64.dmg"
  name "Screen Memory"
  desc "Screen recording and memory application"
  homepage "https://github.com/itsrafsanjani/screen-memory"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true

  app "Screen Memory.app"

  zap trash: [
    "~/Library/Application Support/Screen Memory",
    "~/Library/Caches/com.screenmemory.app",
    "~/Library/Preferences/com.screenmemory.app.plist",
    "~/Library/Saved Application State/com.screenmemory.app.savedState",
  ]
end
```

#### 6.3 Commit and Push

```bash
git add Casks/screen-memory.rb
git commit -m "Update Screen Memory to v0.0.1"
git push origin main
```

### 7. Verify Installation

Test the Homebrew installation:

```bash
# Install from the tap
brew install --cask itsrafsanjani/screen-memory/screen-memory

# Or add tap first, then install
brew tap itsrafsanjani/screen-memory
brew install --cask screen-memory
```

## Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** - Incompatible API changes
- **MINOR** - New functionality (backwards compatible)
- **PATCH** - Bug fixes (backwards compatible)

## Troubleshooting

### Release Workflow Fails

Check the GitHub Actions logs for errors:

```bash
gh run view <run-id> -R itsrafsanjani/screen-memory --log
```

Common issues:

- **Swift build failure** - Ensure macOS runner has Xcode installed
- **Signing issues** - Check entitlements file exists at `build/entitlements.mac.plist`
- **Publishing failure** - Verify `GITHUB_TOKEN` has `contents: write` permission

### Homebrew Cask Issues

If users report installation issues:

1. Verify the SHA256 matches the uploaded DMG
2. Check the download URL is accessible
3. Ensure `auto_updates true` is set correctly

### Auto-Updater Not Working

The auto-updater requires:

1. `latest-mac.yml` in the GitHub release — the manifest the app checks against
2. `Contents/Resources/app-update.yml` inside the packaged app — where the app learns which repo to
   check. **electron-builder does not write this file for our build**: it only emits it during a pack
   whose targets include `dmg`/`zip`, and the release runs `--dir` first and `--prepackaged` second,
   neither of which qualifies. The workflows write it explicitly, and
   `scripts/verify-packaged-app.sh` fails the build if it goes missing. Without it every update check
   throws at startup and is swallowed by the error handler, so the symptom is silence, not an error.
3. Valid version comparison (new version > current version)

To check a built app:

```bash
cat "/Applications/Screen Memory.app/Contents/Resources/app-update.yml"
```

The `owner`/`repo` must name the repository the release was published to — a fork's build must point
at the fork, not at upstream.

## Release Checklist

- [ ] All tests passing
- [ ] Version bumped in `package.json`
- [ ] CI green on the exact commit being tagged
- [ ] Git tag matches the `package.json` version, created and pushed by name (`vX.X.X`)
- [ ] GitHub Actions workflow completed successfully
- [ ] Release published (not draft)
- [ ] DMG, ZIP, both blockmaps and `latest-mac.yml` uploaded
- [ ] Release notes include the Gatekeeper workaround
- [ ] DMG downloaded from the release page, mounted, and launched on real hardware
- [ ] Homebrew cask updated with new version and SHA256
- [ ] Installation tested via Homebrew
- [ ] Auto-update tested (if applicable)

## References

- [GitHub Releases](https://github.com/itsrafsanjani/screen-memory/releases)
- [Homebrew Tap](https://github.com/itsrafsanjani/homebrew-screen-memory)
- [electron-builder Documentation](https://www.electron.build/)
- [Homebrew Cask Documentation](https://docs.brew.sh/Cask-Cookbook)
