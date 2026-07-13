#!/bin/sh
set -eu

component=${1:-}
case "$component" in controller|agent) ;; *) echo "Usage: install-systemd.sh controller|agent" >&2; exit 1;; esac
[ "$(id -u)" -eq 0 ] || { echo "Installation requires root; services still run as dedicated non-root users." >&2; exit 1; }

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
version=$(node -p "require('$root/package.json').version")
case "$component" in
  controller) prefix=/opt/stackpilot; unit=stackpilot-controller; entry=apps/controller/dist/server.js ;;
  agent) prefix=/opt/stackpilot-agent; unit=stackpilot-agent; entry=apps/agent/dist/main.js ;;
esac
release="$prefix/releases/$version"
unit_source="$root/deploy/systemd/$unit.service"
unit_target="/etc/systemd/system/$unit.service"

install_unit() {
  if [ ! -f "$unit_target" ] || ! cmp -s "$unit_source" "$unit_target"; then
    install -m 0644 "$unit_source" "$unit_target"
  fi
  systemctl daemon-reload
}

if [ -e "$release" ]; then
  [ -d "$release" ] && [ ! -L "$release" ] || { echo "Existing release is not a regular directory: $release" >&2; exit 1; }
  [ -f "$release/package.json" ] && [ -f "$release/$entry" ] || { echo "Existing release is incomplete: $release" >&2; exit 1; }
  [ -L "$prefix/current" ] && [ "$(readlink -f "$prefix/current")" = "$(readlink -f "$release")" ] || { echo "Existing release is not the current release: $release" >&2; exit 1; }
  install_unit
  echo "Release already installed: $release; systemd unit synchronized without changing the release, current link or service state. Restart $unit.service explicitly to apply unit changes."
  exit 0
fi

systemd-sysusers "$root/deploy/systemd/$unit.sysusers"
install -d -m 0755 "$prefix/releases" "$release"
cp -a "$root/." "$release/"
(cd "$release" && npm ci --omit=dev --workspaces --include-workspace-root)
chown -R root:root "$release"
chmod -R go-w "$release"
ln -sfn "$release" "$prefix/current"
install_unit
echo "Installed $component $version. Configure /etc before running: systemctl enable --now $unit.service"
