#!/usr/bin/env bash
#
# Asserts that a long-lived screen-memory-appstate reports the frontmost app as
# it actually changes.
#
# This exists because the helper once reported a frozen answer for its entire
# life and nothing caught it. It built, spawned, replied to every request, and
# passed verify-packaged-app.sh — it simply named whichever app was in front
# when it started, forever. Usage tracking recorded nothing for weeks and the
# only visible symptom was an empty Usage view.
#
# The cause was structural: AppKit refreshes NSWorkspace from notifications
# delivered on the run loop, and the helper blocked its only thread reading
# stdin. Nothing static can catch that, and a one-shot invocation cannot either
# — a fresh process always answers correctly. It takes a long-lived process
# watched across a real app switch, which is what this does.
#
# Needs a human at the keyboard, so it is not wired into CI. Run it before
# tagging a release; see docs/release-guide.md.
set -euo pipefail

HELPER="${1:-swift-ocr/.build/release/screen-memory-appstate}"
SECONDS_TO_RUN="${2:-30}"
INTERVAL=1.5

[ -x "$HELPER" ] || {
  echo "::error::No executable helper at $HELPER"
  exit 1
}

WORK="$(mktemp -d)"
FIFO="$WORK/commands"
OUT="$WORK/replies"
mkfifo "$FIFO"

cleanup() {
  exec 3>&- 2>/dev/null || true
  [ -n "${HELPER_PID:-}" ] && kill "$HELPER_PID" 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT

"$HELPER" < "$FIFO" > "$OUT" 2>&1 &
HELPER_PID=$!
# Holding the write end open is what keeps the helper alive between commands;
# without it the first write would be followed by EOF and the process would exit.
exec 3> "$FIFO"

cat <<EOF

Watching one long-lived helper for ${SECONDS_TO_RUN}s.

  >>> Switch between at least two apps while this runs. <<<

EOF

SAMPLES=$(python3 -c "print(int($SECONDS_TO_RUN / $INTERVAL))")
for _ in $(seq 1 "$SAMPLES"); do
  echo state >&3
  sleep "$INTERVAL"
done
exec 3>&-
sleep 0.5

# The reply is one JSON object per line; frontmost is absent when no app is
# active, which is a valid answer and simply not a distinct app.
DISTINCT="$(
  python3 - "$OUT" <<'PY'
import json, sys
seen = []
for line in open(sys.argv[1]):
    line = line.strip()
    if not line:
        continue
    try:
        front = (json.loads(line).get("frontmost") or {}).get("bundleId")
    except ValueError:
        continue
    if front and front not in seen:
        seen.append(front)
print("\n".join(seen))
PY
)"

REPLIES="$(grep -c . "$OUT" || true)"
COUNT="$(printf '%s' "$DISTINCT" | grep -c . || true)"

echo "$REPLIES replies, $COUNT distinct frontmost app(s):"
printf '%s\n' "$DISTINCT" | sed 's/^/  /'

if [ "$REPLIES" -eq 0 ]; then
  echo "::error::The helper answered nothing at all"
  exit 1
fi

if [ "$COUNT" -lt 2 ]; then
  cat <<'EOF'
::error::The helper reported one frontmost app for the whole run.

Either no app switch happened while it ran — re-run and switch apps — or the
helper is frozen again, which is the bug this script exists to catch. Check that
main.swift still reads stdin off the main thread and calls CFRunLoopRun().
EOF
  exit 1
fi

echo "Helper tracks the frontmost app."
