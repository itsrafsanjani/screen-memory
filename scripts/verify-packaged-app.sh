#!/usr/bin/env bash
#
# Asserts that a packaged .app carries everything it needs at runtime.
#
# Every one of these is an extraResources entry, which means it exists in a dev
# checkout no matter what and only ever goes missing in the packaged bundle —
# the one build local development never exercises. A missing migrations journal
# in particular does not fail the build: the app installs, launches, and then
# cannot open its database.
set -euo pipefail

APP="${1:?usage: verify-packaged-app.sh <path to .app> [arch]}"
ARCH="${2:-$(uname -m)}"
RESOURCES="$APP/Contents/Resources"

fail() {
  echo "::error::$1"
  exit 1
}

[ -d "$APP" ] || fail "No packaged app at $APP"

# Drizzle's migrator reads the journal, not the .sql files, so a bundle without
# it has no migrations at all even though the folder looks populated.
JOURNAL="$RESOURCES/db-migrations/meta/_journal.json"
[ -f "$JOURNAL" ] || fail "Missing $JOURNAL"
node -e '
  const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
  if (!Array.isArray(j.entries) || j.entries.length === 0) throw new Error("journal has no entries")
  console.log(`migrations journal: ${j.entries.length} entries`)
' "$JOURNAL" || fail "$JOURNAL is not a usable Drizzle journal"

for sql in "$RESOURCES"/db-migrations/*.sql; do
  [ -f "$sql" ] || fail "No migration .sql files in $RESOURCES/db-migrations"
  break
done

for binary in screen-memory-ocr screen-memory-appstate; do
  path="$RESOURCES/bin/$binary"
  [ -x "$path" ] || fail "Missing or non-executable helper: $path"
  # A helper built for the wrong architecture spawns and dies, which the app
  # reports as "feature unavailable" rather than as a broken build. `file` alone
  # would accept an x86_64 binary in an arm64 bundle, so the arch is checked.
  archs="$(lipo -archs "$path" 2>/dev/null)" || fail "$path is not a Mach-O executable"
  echo "$archs" | grep -qw "$ARCH" || fail "$path is $archs, expected $ARCH"
done

echo "Packaged app looks complete: $APP ($ARCH)"
