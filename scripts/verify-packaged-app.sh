#!/usr/bin/env bash
set -euo pipefail

APP="${1:?usage: verify-packaged-app.sh <path to .app> [arch]}"
ARCH="${2:-$(uname -m)}"
RESOURCES="$APP/Contents/Resources"

fail() {
  echo "::error::$1"
  exit 1
}

[ -d "$APP" ] || fail "No packaged app at $APP"

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
  archs="$(lipo -archs "$path" 2>/dev/null)" || fail "$path is not a Mach-O executable"
  echo "$archs" | grep -qw "$ARCH" || fail "$path is $archs, expected $ARCH"
done

UPDATE_YML="$RESOURCES/app-update.yml"
[ -f "$UPDATE_YML" ] || fail "Missing $UPDATE_YML — the in-app updater will fail at startup"
grep -q '^provider:' "$UPDATE_YML" || fail "$UPDATE_YML has no provider"

echo "Packaged app looks complete: $APP ($ARCH)"
