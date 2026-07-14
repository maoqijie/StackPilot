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
install -d -m 0755 "$prefix/releases" "$release" "$release/apps/database-helper" "$release/packages/contracts"
install -m 0644 "$root/package.json" "$root/package-lock.json" "$release/"
install -m 0644 "$root/apps/database-helper/package.json" "$release/apps/database-helper/"
install -m 0644 "$root/packages/contracts/package.json" "$release/packages/contracts/"
cp -a "$root/apps/database-helper/dist" "$release/apps/database-helper/dist"
cp -a "$root/packages/contracts/dist" "$release/packages/contracts/dist"
(cd "$release" && npm ci --omit=dev --workspace @stackpilot/database-helper --include-workspace-root)
chown -R root:root "$release"
chmod -R go-w "$release"
ln -sfn "$release" "$prefix/current"
if command -v systemctl >/dev/null 2>&1; then
  install -m 0644 "$root/deploy/systemd/stackpilot-database-helper.service" /etc/systemd/system/
  install -m 0644 "$root/deploy/systemd/stackpilot-database-helper.socket" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now stackpilot-database-helper.socket
else
  install -m 0755 "$root/deploy/openrc/stackpilot-database-helper" /etc/init.d/stackpilot-database-helper
  rc-update add stackpilot-database-helper default
  rc-service stackpilot-database-helper start
fi
/usr/bin/node --preserve-symlinks-main "$prefix/current/apps/database-helper/dist/cli.js" backup-plan install-scheduler
echo "Installed and started database-helper $version with local backup scheduling enabled."
