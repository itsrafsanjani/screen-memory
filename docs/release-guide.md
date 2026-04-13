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

Create an annotated tag to trigger the release workflow:

```bash
# Delete existing tag if recreating (optional)
git tag -d v0.0.1
git push origin :refs/tags/v0.0.1

# Create new annotated tag
git tag -a v0.0.1 -m "Release v0.0.1"

# Push tag to trigger GitHub Actions workflow
git push origin v0.0.1
```

The `.github/workflows/release.yml` workflow will automatically:

- Build the Swift OCR binary
- Build the Electron app for macOS ARM64
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

If the release is created as a draft, publish it:

```bash
gh release edit v0.0.1 --draft=false -R itsrafsanjani/screen-memory
```

Verify the release assets:

- `Screen-Memory-{version}-arm64.dmg`
- `Screen-Memory-{version}-arm64.zip`
- `latest-mac.yml` (required for auto-updates)

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

1. `latest-mac.yml` in the GitHub release
2. Correct `electron-builder.yml` publish configuration
3. Valid version comparison (new version > current version)

## Release Checklist

- [ ] All tests passing
- [ ] Version bumped in `package.json`
- [ ] Git tag created and pushed (`vX.X.X`)
- [ ] GitHub Actions workflow completed successfully
- [ ] Release published (not draft)
- [ ] DMG and ZIP assets uploaded
- [ ] Homebrew cask updated with new version and SHA256
- [ ] Installation tested via Homebrew
- [ ] Auto-update tested (if applicable)

## References

- [GitHub Releases](https://github.com/itsrafsanjani/screen-memory/releases)
- [Homebrew Tap](https://github.com/itsrafsanjani/homebrew-screen-memory)
- [electron-builder Documentation](https://www.electron.build/)
- [Homebrew Cask Documentation](https://docs.brew.sh/Cask-Cookbook)
