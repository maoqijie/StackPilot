#!/bin/sh
set -eu

[ "$(id -u)" -eq 0 ] || { echo "database-helper installation requires root" >&2; exit 1; }
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
version=$(node -p "require('$root/package.json').version")
prefix=/opt/stackpilot-database-helper
release="$prefix/releases/$version"
[ ! -e "$release" ] || { echo "Release already exists: $release" >&2; exit 1; }
[ -f "$root/apps/database-helper/dist/main.js" ] || { echo "Build @stackpilot/database-helper before installation" >&2; exit 1; }
getent group stackpilot-agent >/dev/null 2>&1 || addgroup -S stackpilot-agent 2>/dev/null || groupadd --system stackpilot-agent
install -d -m 0755 "$prefix/releases" "$release"
cp -a "$root/." "$release/"
(cd "$release" && npm ci --omit=dev --workspaces --include-workspace-root)
chown -R root:root "$release"
chmod -R go-w "$release"
ln -sfn "$release" "$prefix/current"
if command -v systemctl >/dev/null 2>&1; then
  install -m 0644 "$root/deploy/systemd/stackpilot-database-helper.service" /etc/systemd/system/
  install -m 0644 "$root/deploy/systemd/stackpilot-database-helper.socket" /etc/systemd/system/
  systemctl daemon-reload
  echo "Installed database-helper $version. Start with: systemctl enable --now stackpilot-database-helper.socket"
else
  install -m 0755 "$root/deploy/openrc/stackpilot-database-helper" /etc/init.d/stackpilot-database-helper
  echo "Installed database-helper $version. Start with: rc-update add stackpilot-database-helper default && rc-service stackpilot-database-helper start"
fi
