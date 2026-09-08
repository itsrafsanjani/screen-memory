# Anti-Slop Provenance

- **Source Repository**: https://github.com/dmmulroy/anti-slop
- **Source Commit**: `95a56e5d24fb3d849673c2d51eb0908b8bd2d33b`
- **Installation Date**: 2026-09-08
- **Installed Plugin Path**: `tools/oxlint/anti-slop/`
- **Entry Point**: `tools/oxlint/anti-slop/index.ts`
- **Dependencies**:
  - `oxlint`: `1.82.0`
  - `@oxlint/plugins`: `1.82.0`
- **Configuration**:
  - Registered in `oxlint.config.ts`
  - All generic rules enabled at `"error"`
  - Companion native rule `oxc/no-accumulating-spread` enabled at `"error"`
- **Deviations**:
  - None (fresh vendored copy of generic plugin and rules from `install-anti-slop` skill assets)
