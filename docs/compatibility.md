# Compatibility Matrix

StackPilot `0.2.0-preview.6` is a preview release, not a stable production release. Support below means the release gates are designed for that target; it does not imply an SLA.

| Surface | Supported range | Evidence and limits |
| --- | --- | --- |
| Native server OS | Debian 12 and Ubuntu 24.04 LTS, x86_64 | systemd units target these distributions; runtime validation is a Linux CI gate |
| Containers | Docker Engine 27+ with Compose v2 on Linux x86_64 | images are built and scanned in CI; no arm64 claim yet |
| Node.js | `22.x`, release build pinned to `22.22.0` | Node 20 remains usable for development but is not a production release target |
| npm | 10 or 11 with committed lockfile | production installation uses `npm ci` |
| Database | embedded SQLite, schema `5` | direct upgrade from schemas 1, 2, 3 and 4; restore accepts schemas 1, 2, 3, 4 and 5 |
| Controller | `0.2.0-preview.6` | must match Web release version |
| Agent | `0.1.x` or `0.2.x`, protocol `1.0` | incompatible protocol major is rejected; future capabilities are not implied |
| Browser | current and previous major Chrome, Edge and Firefox | Chromium desktop/mobile E2E is automated; Firefox is a compatibility target, not yet an E2E gate |

Windows and macOS are development environments only. Native production deployment, systemd and host-management capabilities are not supported there. Windows telemetry uses a CIM-backed equivalent load estimate rather than a native Unix Load Average; CI verifies that collection on a Windows runner, but this does not expand the native production support range. Safari, arm64, clustered Controllers and external databases are not currently supported.

## Version Rules

StackPilot follows Semantic Versioning. During `0.x`, a minor version can contain breaking changes; patch versions preserve documented contracts within that minor. Prerelease suffixes (`preview`, `rc`) never imply stable support.

| Controller | Agent | Protocol | Database | Result |
| --- | --- | --- | --- | --- |
| `0.2.x` | `0.1.x` or `0.2.x` | `1.x` | 4 | supported preview combination |
| `0.2.x` | any | non-`1.x` | any | rejected before task processing |
| `0.2.x` | any | `1.x` | 1, 2 or 3 | upgrade required; back up before migration |
| `0.2.x` | any | `1.x` | greater than 4 | refuse startup/upgrade; newer database cannot be opened safely |

Schema 5 has no automatic down migration. Rollback to a Controller that only supports an older schema means restoring its verified pre-upgrade backup.
