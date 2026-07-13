# Backup and Restore

Back up four classes separately: SQLite database, `/etc/stackpilot*` configuration, TLS/CA material, and the Controller master key. Keep the master key in a different protected location from database backups. Recommended minimum retention is 7 daily, 4 weekly and 6 monthly copies, adjusted to site policy.

Create and verify an online database backup:

```bash
npm run db:backup --workspace @stackpilot/controller -- /backup/stackpilot-$(date +%F).sqlite3
sha256sum /backup/stackpilot-YYYY-MM-DD.sqlite3 > /backup/stackpilot-YYYY-MM-DD.sqlite3.sha256
sha256sum --check /backup/stackpilot-YYYY-MM-DD.sqlite3.sha256
node deploy/scripts/verify-backup.mjs /backup/stackpilot-YYYY-MM-DD.sqlite3
```

Quarterly, restore into an isolated Controller: verify checksum, stop that test Controller, set its database path and matching master key, run `db:restore`, start it without Agent/public network access, run `PRAGMA integrity_check` through the preflight command and `audit:verify`, then confirm users/nodes/tasks are present. Do not test restoration against the production path.

For production restore, stop Controller first. `db:restore` accepts supported schema 1, 2, 3 or 4 backups, validates SQLite integrity, installs atomically and retains the displaced database as `.before-restore`. A restored database must be paired with a compatible application version or migrated again after investigation.
