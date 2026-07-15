# Changelog

All notable changes follow Semantic Versioning. The project is currently prerelease software.

## 0.3.0-preview.19 - 2026-07-15

### Changed

- Connected the global and failed-audit views to the authenticated Controller audit repository, with backend collection timestamps, visibility-aware 10-second polling, stable event details and real CSV export.
- Removed the Web audit fixture fallback and centralized the audit response schema in the shared contracts package.

### Security

- Preserved the explicitly global `audit:read` enforcement on the API, hides audit navigation and search actions from principals without that permission, and validates bounded read-only audit filters before querying SQLite.

## 0.3.0-preview.18 - 2026-07-15

### Fixed

- Granted the hardened Controller service the existing system `crontab` group and the narrow cron-spool write path required for the real managed schedule backend.
- Repaired the workspace lockfile so clean `npm ci` installations include every optional release-scanning dependency.

### Security

- Kept schedule writes behind the existing `STACKPILOT_ENABLE_CRONTAB_WRITE=1`, session, CSRF and `schedules:write` permission boundaries while limiting filesystem access to the Controller state and user-crontab spool.

## 0.3.0-preview.17 - 2026-07-15

### Changed

- Merged the Controller-host systemd helper path with the Agent node snapshot path, preserving bounded local journal and allowlisted lifecycle operations alongside node-scoped read-only monitoring.
- Kept the real deployment, rollback and schedule workflows from `0.3.0-preview.16` while aligning shared contracts, permissions and Web behavior across both systemd data sources.

### Security

- Preserved node-scoped `systemd:read` access for Agent snapshots and retained CSRF, RBAC, reauthentication, allowlist and audit enforcement for Controller-host lifecycle operations.

## 0.3.0-preview.16 - 2026-07-15

### Changed

- Added visibility-aware 10-second refresh, backend freshness display and explicit retry handling to the schedule workflow while preserving filters and open task details.
- Replaced schedule deletion with an accessible confirmation dialog and refined task details, empty states and source context for desktop and narrow layouts.
- Consolidated deployment and firewall surface overrides to retain CloudPulse hierarchy without decorative borders or unused action space.

## 0.3.0-preview.15 - 2026-07-15

### Fixed

- Removed settled database-runtime abort listeners after every collection interval, preventing the long-running Agent from accumulating listeners and emitting `MaxListenersExceededWarning`.
- Added regression coverage for repeated timer completion and an already-aborted shutdown signal.

## 0.3.0-preview.14 - 2026-07-15

### Fixed

- Extended Agent-side journal redaction to cover Basic authorization, cookies, OAuth client secrets, AWS secret keys, private keys and generic URI userinfo before systemd snapshots leave a node.
- Added systemd-specific regression coverage for 10-second polling, hidden-tab pause, non-overlapping requests, background failure retention, stable detail selection and strict read-only API validation.

### Changed

- Removed obsolete systemd lifecycle-action styles so the Web surface consistently represents the node-scoped read-only monitoring boundary.

## 0.3.0-preview.13 - 2026-07-15

### Fixed

- Serialized same-process site-helper lock contenders and tolerated lock handoff races while reading owner metadata, preventing concurrent activations from failing when the previous lock disappears between inspection and `readlink`.

## 0.3.0-preview.12 - 2026-07-15

### Security

- Revalidated the current principal node scope before returning an idempotent site-plan result, preventing a previously authorized plan from bypassing a later scope reduction.

## 0.3.0-preview.11 - 2026-07-15

### Added

- Added authenticated, node-scoped site rollback history and execution APIs backed by the existing Controller, RemoteTask, Agent and root-only site-helper boundary.
- Added strict rollback contracts, release/plan ownership checks, optimistic site versions, idempotency, protected-site guards and atomic success reconciliation.
- Added a real rollback workbench with backend freshness, visibility-aware 10-second polling, stable detail selection, permission-aware actions and reauthentication.

### Security

- Rollback execution requires a current user session, CSRF, `sites:deploy`, node scope and a one-time reauthentication proof; API tokens cannot execute rollbacks.
- The site helper accepts only opaque plan and release identities, validates immutable commit markers, serializes site changes and restores the previous release after a failed health check.

## 0.3.0-preview.10 - 2026-07-15

### Fixed

- Added explicit production/staging environments to site deployment plans and schema 8, preserving legacy staging refs during migration while preventing staging plans from switching production traffic.
- Made operation polling read-only, aligned it to the 10-second monitoring interval, and marked scoped deployment responses as `no-store`.
- Added an indexed, integrity-checked deployment projection and stabilized filters and detail selection across route and operation changes.

## 0.3.0-preview.9 - 2026-07-15

### Fixed

- Updated the disposable systemd installer verification fixture to include the Web entry required by a complete Controller release, preserving the production installer's fail-closed integrity check while restoring the Linux hardening gate.

### Changed

- Promoted the deployment workbench real-backend release to a new preview version after `0.3.0-preview.8` had already been published to `main`, keeping package, Agent runtime, lockfile and release-document versions traceable to the corrected CI revision.

## 0.3.0-preview.8 - 2026-07-15

### Added

- Added an authenticated, node-scoped deployment query API that projects real site plans, operations, managed releases and backend collection time.
- Added typed deployment contracts and a visibility-aware 10-second Web polling path with stable operation and release identities.

### Changed

- Replaced the deployment workbench's fixture queue, generated logs and simulated completion, redeploy and rollback mutations with real Controller state, explicit empty/error handling and release history.
- Reused the existing reauthenticated Git deployment plan for creation, and contained long node and release identifiers across desktop tables, mobile cards and detail drawers.

### Security

- Deployment reads require `sites:read` and honor the principal node scope; unsupported rollback and arbitrary command execution remain unavailable.

## 0.3.0-preview.7 - 2026-07-15

### Fixed

- Extended Agent-side journal redaction to cover JSON secrets, URL query credentials and database connection strings before snapshots leave a node.
- Rejected option-like service names in legacy `service.status.read` tasks and marked systemd activating/reloading states as warnings instead of healthy services.
- Added bounded pagination for aggregated systemd rows and logs, mobile-safe long-text wrapping and `no-store` API responses.

## 0.3.0-preview.6 - 2026-07-15

### Fixed

- Removed uncancelled animation-frame and timer retries from shared dialog and drawer focus restoration, preventing callbacks from escaping the owning document lifecycle.
- Made animated modal focus restoration deterministic after React unmount and covered both restored and removed trigger paths in the Web test suite.

## 0.3.0-preview.5 - 2026-07-15

### Added

- Added authenticated Controller-host systemd inventory, bounded journal reads and allowlisted start, stop and restart operations through a dedicated Controller-only root helper socket.
- Added strict shared systemd response contracts and Controller routes with CSRF, RBAC, one-time reauthentication and audit enforcement.
- Added bounded Agent-side systemd service and journal snapshot collection with credential redaction, strict shared contracts and node-scoped `systemd:read` access.
- Added authenticated `GET /api/systemd/services` and a visibility-aware 10-second Web polling path backed by saved Agent snapshots.

### Changed

- Replaced the systemd workbench fixtures, synthetic journal output and browser-only mutations with real backend data, visible collection timestamps and silent visibility-aware 10-second polling.
- Preserved service filters and stable detail selection across refreshes, while loading journal entries only when an operator opens a service.
- Added the Agent service account to `systemd-journal` so native Linux deployments can read system journal entries without running the Agent as root.

### Security

- systemd actions accept only validated service, timer, socket and target unit names and an explicit deployment allowlist; the Agent cannot access the dedicated socket and arbitrary commands and paths remain unavailable.
- Journal results are line-bounded, size-bounded and redact common credential fields before crossing the helper boundary.
- systemd collection uses only fixed `systemctl` and `journalctl` argument forms, enforces response bounds, redacts common credential forms before upload and preserves RBAC node scope.

## 0.3.0-preview.4 - 2026-07-14

### Fixed

- Updated desktop and mobile browser motion coverage to assert the modal enter and exit contract used by the file creation dialog.
- Restored clean `npm ci` installation in Linux, Windows and container release jobs by completing the CycloneDX optional dependency lock graph.

### Documentation

- Added complete rollout, compatibility and rollback guidance for physical-host identity and schema 7 releases.

## 0.3.0-preview.3 - 2026-07-14

### Added

- Added feature-negotiated physical-host identity so a Controller and its uniquely matching co-located Agent share one monitoring row and one set of resource totals while preserving Agent UUID, RBAC, heartbeat, audit and task-routing identity.

### Changed

- Refined deployment and rollback workspaces with responsive layouts, semantic status icons, accessible logs and a body-level creation modal.
- Improved firewall rule and deny-record surfaces with stable responsive actions, clearer detail and confirmation hierarchy, and semantic allow/deny indicators.
- Hardened shared dialog and drawer focus restoration across animated exits, with focused deployment and firewall interaction coverage.
- Preserved co-located Agent control-channel health on the merged Controller row, including degraded status and stable risks for offline or stale telemetry.

### Repository

- Added explicit Git submission and push requirements to the repository agent guidance.

## 0.3.0-preview.2 - 2026-07-14

### Changed

- Refined firewall rule and deny-record workflows with accessible confirmation, semantic results, compact controls and complete detail surfaces.
- Added focused systemd service, journal and log-stream views with responsive drawer behavior and operational status context.
- Improved shared detail-drawer focus restoration and modal class handling, with expanded firewall and systemd page coverage.

## 0.3.0-preview.1 - 2026-07-14

### Added

- Added real PostgreSQL, MySQL and MariaDB inventory, sessions, slow-query metadata, local backup plans, restore points and asynchronous database operations across registered Agent nodes.
- Added strict database contracts, SQLite schema 6 persistence, seven-day encrypted full-SQL retention, node-scoped RBAC and short-lived two-stage confirmation plans.
- Added the root-only `database-helper` boundary with a fixed operation vocabulary, local Unix socket transport, multi-instance port allocation and systemd/OpenRC deployment definitions.

### Changed

- Upgraded the Agent protocol to `1.1` while retaining Controller compatibility with `1.0` Agents; database capabilities require the new protocol and Controller-first rollout order.
- Replaced database-page fixtures and simulated success states with typed APIs, visibility-aware 10-second polling, real empty/error states and actual CSV export.
- Moved Controller SQLite backup management to Settings / System Backup so it remains separate from managed PostgreSQL/MySQL/MariaDB backups.

### Security

- Database SQL, credentials and connection strings are excluded from heartbeat, normal logs and audit payloads; complete SQL is encrypted at rest and automatically purged after seven days.
- High-risk install, read-only, session termination, index and restore actions require a current user session, CSRF, explicit database permission, node scope, an expiring plan and an idempotency key.

## 0.2.0-preview.6 - 2026-07-13

### Changed

- Replaced the website demo inventory and simulated actions with authenticated Nginx discovery, loopback health probes, certificate metadata and silent 10-second polling from `GET /api/sites`.
- Made unavailable site traffic, certificate and latency data explicit, and removed unsupported create, start/stop, renewal and access-log success simulations.
- Refined database instance, backup and slow-query workflows with stable operational summaries, focused details and responsive action layouts.
- Added clearer file upload, recycle-bin and terminal-session interactions, including keyboard-accessible confirmation dialogs and complete terminal session drawers.
- Split database, file and terminal visual treatments into focused CloudPulse styles and expanded corresponding page-level UI tests.

## 0.2.0-preview.5 - 2026-07-12

### Changed

- Refined website inventory, active-runtime, certificate-risk and runtime-group views with semantic statuses, focused risk workflows and complete body-level detail drawers.
- Added certificate risk and renewal-mode filters, runtime health summaries and compact action controls while preserving responsive long-domain handling.
- Expanded site-page and theme coverage, and hardened shell monitoring fallbacks for incomplete overview responses.

## 0.2.0-preview.4 - 2026-07-12

### Changed

- Added silent 10-second monitoring refresh with visibility-aware recovery for Overview and host surfaces while preserving filters and open details.
- Aggregated local disk utilization across all detected volumes and exposed per-volume capacity details through accessible host and metric detail views.
- Refined CloudPulse overview, host, drawer and sidebar layouts for stable responsive scanning, long-hostname handling and clearer operational freshness states.

## 0.2.0-preview.3 - 2026-07-11

### Changed

- Rebuilt the Web console around the CloudPulse visual system with local variable fonts, persistent light/dark themes and responsive shared navigation.
- Consolidated legacy mobile routes and CSS into the desktop/mobile application shell while retaining routing compatibility and operational page behavior.
- Added theme coverage and updated routing tests, mock data and interface documentation for the refreshed control console.

## 0.2.0-preview.1 - 2026-07-11

### Added

- TypeScript monorepo with modular Web, Controller, Agent and shared runtime contracts.
- Cookie identity, RBAC/node scopes, API tokens, SQLite migrations, encrypted secrets and chained audit records.
- TLS Controller-Agent protocol with per-node identities and a closed read-only task registry.
- Hardened Docker Compose/systemd deployment, reverse proxy examples and production operations documentation.
- HTTPS desktop/mobile E2E, upgrade/restore drills, CycloneDX SBOM, checksums and keyless release signing workflow.

### Security

- Strict CORS, bounded JSON bodies, explicit dangerous capability switches and trusted-proxy CIDRs.
- Non-root containers/services, minimized network exposure and high/critical vulnerability release gates.

### Known Issues

- Preview maturity only; no SLA, arm64 production support, automated Firefox E2E or published stable upgrade source.
- Web main chunk is approximately 650 kB after minification.
