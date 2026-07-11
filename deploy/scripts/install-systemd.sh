#!/bin/sh
set -eu

component=${1:-}
case "$component" in controller|agent) ;; *) echo "Usage: install-systemd.sh controller|agent" >&2; exit 1;; esac
[ "$(id -u)" -eq 0 ] || { echo "Installation requires root; services still run as dedicated non-root users." >&2; exit 1; }

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
version=$(node -p "require('$root/package.json').version")
case "$component" in
  controller) prefix=/opt/stackpilot; unit=stackpilot-controller ;;
  agent) prefix=/opt/stackpilot-agent; unit=stackpilot-agent ;;
esac
release="$prefix/releases/$version"
[ ! -e "$release" ] || { echo "Release already installed: $release" >&2; exit 1; }

systemd-sysusers "$root/deploy/systemd/$unit.sysusers"
install -d -m 0755 "$prefix/releases" "$release"
cp -a "$root/." "$release/"
(cd "$release" && npm ci --omit=dev --workspaces --include-workspace-root)
chown -R root:root "$release"
chmod -R go-w "$release"
ln -sfn "$release" "$prefix/current"
install -m 0644 "$root/deploy/systemd/$unit.service" "/etc/systemd/system/$unit.service"
systemctl daemon-reload
echo "Installed $component $version. Configure /etc before running: systemctl enable --now $unit.service"
