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

# A helper that dies at startup leaves the fifo with no reader, and the very next
# write would kill this script with SIGPIPE before it could say why — silently,
# and precisely in the case it exists to diagnose. Ignoring the signal turns that
# write into a failed command the send loop can notice and report.
trap '' PIPE

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
ERR="$WORK/stderr"
mkfifo "$FIFO"

# Every step is tolerant of having already happened, and none may abort the
# function: an EXIT trap that dies under `set -e` both skips the rest of its own
# cleanup and hands its failure to the shell as the script's exit status. That is
# not hypothetical — closing fd 3 below is what makes the helper exit, so the
# `kill` that follows normally fails, and this script used to report failure on
# every single run, including its successes.
cleanup() {
  exec 3>&- || true
  if [ -n "${HELPER_PID:-}" ]; then
    kill "$HELPER_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

# Helper stderr is kept out of $OUT so a crash message cannot be counted as a
# reply — miscounting one would make the "answered nothing at all" branch
# unreachable and print the wrong diagnosis.
"$HELPER" < "$FIFO" > "$OUT" 2> "$ERR" &
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
  # Stop as soon as the helper is gone rather than writing into a fifo nobody is
  # reading. Whatever it managed to say is diagnosed below.
  kill -0 "$HELPER_PID" 2>/dev/null || break
  echo state >&3 || break
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
  echo "::error::The helper answered nothing at all — it never started, or died immediately."
  if [ -s "$ERR" ]; then
    echo "Its stderr:"
    sed 's/^/  /' "$ERR"
  fi
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
# Explicit, because the EXIT trap's status becomes the script's when the main
# body never sets one.
exit 0
