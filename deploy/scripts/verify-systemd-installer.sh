#!/bin/sh
set -eu

[ "${CI:-}" = "true" ] && [ "${GITHUB_ACTIONS:-}" = "true" ] && [ "${STACKPILOT_DISPOSABLE_SYSTEMD_TEST:-}" = "1" ] || { echo "installer verification is restricted to disposable GitHub Actions hosts" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || { echo "installer verification requires root" >&2; exit 1; }

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
version=$(node -p "require('$root/package.json').version")
controller_prefix=/opt/stackpilot
agent_prefix=/opt/stackpilot-agent
controller_unit=/etc/systemd/system/stackpilot-controller.service
agent_unit=/etc/systemd/system/stackpilot-agent.service

for target in "$controller_prefix" "$agent_prefix" "$controller_unit" "$agent_unit"; do
  [ ! -e "$target" ] || { echo "CI host is not disposable: $target already exists" >&2; exit 1; }
done

cleanup() {
  systemctl stop stackpilot-controller.service stackpilot-agent.service 2>/dev/null || true
  rm -rf "$controller_prefix" "$agent_prefix"
  rm -f "$controller_unit" "$agent_unit"
  systemctl daemon-reload
}
trap cleanup EXIT HUP INT TERM

for component in controller agent; do
  case "$component" in
    controller) prefix=$controller_prefix; unit=stackpilot-controller; entry=apps/controller/dist/server.js ;;
    agent) prefix=$agent_prefix; unit=stackpilot-agent; entry=apps/agent/dist/main.js ;;
  esac
  release="$prefix/releases/$version"
  current="$prefix/current"
  unit_target="/etc/systemd/system/$unit.service"

  install -d -m 0755 "$release/$(dirname "$entry")"
  printf '{"sentinel":"%s"}\n' "$component" > "$release/package.json"
  printf '// sentinel\n' > "$release/$entry"
  if [ "$component" = "controller" ]; then
    install -d -m 0755 "$release/apps/web/dist"
    printf '<!doctype html>\n' > "$release/apps/web/dist/index.html"
  fi
  ln -s "$release" "$current"
  printf '[Unit]\nDescription=stale-%s\n[Service]\nType=simple\nExecStart=/bin/sleep 300\n[Install]\nWantedBy=multi-user.target\n' "$component" > "$unit_target"
  systemctl daemon-reload
  systemctl start "$unit.service"

  release_hash=$(find "$release" -printf '%P %y %s\n' | sort | sha256sum)
  current_target=$(readlink -f "$current")
  main_pid=$(systemctl show "$unit.service" -p MainPID --value)
  active_state=$(systemctl show "$unit.service" -p ActiveState --value)
  unit_file_state=$(systemctl show "$unit.service" -p UnitFileState --value)
  /bin/sh "$root/deploy/scripts/install-systemd.sh" "$component"

  test "$(find "$release" -printf '%P %y %s\n' | sort | sha256sum)" = "$release_hash"
  test "$(readlink -f "$current")" = "$current_target"
  cmp -s "$root/deploy/systemd/$unit.service" "$unit_target"
  test "$(stat -c '%a' "$unit_target")" = "644"
  test "$(systemctl show "$unit.service" -p Description --value)" != "stale-$component"
  test "$(systemctl show "$unit.service" -p MainPID --value)" = "$main_pid"
  test "$(systemctl show "$unit.service" -p ActiveState --value)" = "$active_state"
  test "$(systemctl show "$unit.service" -p UnitFileState --value)" = "$unit_file_state"

  systemctl stop "$unit.service"
  rm -rf "$prefix"
  rm -f "$unit_target"
  systemctl daemon-reload
done

unit_target=$controller_unit
printf '[Unit]\nDescription=must-remain\n' > "$unit_target"
unit_hash=$(sha256sum "$unit_target")
for invalid in file symlink incomplete noncurrent; do
  rm -rf "$controller_prefix"
  install -d -m 0755 "$controller_prefix/releases"
  release="$controller_prefix/releases/$version"
  case "$invalid" in
    file) : > "$release" ;;
    symlink) install -d -m 0755 "$controller_prefix/invalid-target"; ln -s "$controller_prefix/invalid-target" "$release" ;;
    incomplete) install -d -m 0755 "$release"; printf '{}\n' > "$release/package.json" ;;
    noncurrent)
      install -d -m 0755 "$release/apps/controller/dist" "$controller_prefix/releases/other"
      printf '{}\n' > "$release/package.json"
      printf '// sentinel\n' > "$release/apps/controller/dist/server.js"
      ln -s "$controller_prefix/releases/other" "$controller_prefix/current"
      ;;
  esac
  if /bin/sh "$root/deploy/scripts/install-systemd.sh" controller; then
    echo "invalid $invalid release was accepted" >&2
    exit 1
  fi
  test "$(sha256sum "$unit_target")" = "$unit_hash"
done

echo systemd-installer-ok
