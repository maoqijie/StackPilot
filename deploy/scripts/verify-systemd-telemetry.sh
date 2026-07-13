#!/bin/sh
set -eu

[ "$(id -u)" -eq 0 ] || { echo "systemd telemetry verification requires root" >&2; exit 1; }
command -v systemd-run >/dev/null 2>&1 || { echo "systemd-run is required" >&2; exit 1; }

probe_user=stackpilot-controller
other_pid=$(runuser -u nobody -- sh -c 'sleep 30 >/dev/null 2>&1 & echo $!')
trap 'kill "$other_pid" 2>/dev/null || true' EXIT HUP INT TERM
kill -0 "$other_pid"
test "$(stat -c '%u' "/proc/$other_pid")" = "$(id -u nobody)"

output=$(systemd-run --wait --pipe --quiet \
  --property="User=$probe_user" \
  --property="Group=$probe_user" \
  --property=ProtectProc=invisible \
  --property=NoNewPrivileges=yes \
  --property=CapabilityBoundingSet= \
  --property=AmbientCapabilities= \
  /bin/sh -eu -c '
    test -r /proc/stat
    test -r /proc/meminfo
    test -r /proc/loadavg
    test -r /proc/uptime
    grep -q "^cpu " /proc/stat
    grep -q "^MemAvailable:" /proc/meminfo
    grep -Eq "^[0-9]+([.][0-9]+)?( [0-9]+([.][0-9]+)?){2} " /proc/loadavg
    grep -Eq "^[0-9]+([.][0-9]+)? [0-9]+([.][0-9]+)?$" /proc/uptime
    if test -e "/proc/$1" || find /proc -maxdepth 1 -name "$1" -print -quit | grep -q .; then
      echo "cross-uid process is visible" >&2
      exit 1
    fi
    echo systemd-telemetry-ok
  ' verify-systemd-telemetry "$other_pid")

test "$output" = "systemd-telemetry-ok"
