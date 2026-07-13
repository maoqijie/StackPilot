# Changelog

All notable changes follow Semantic Versioning. The project is currently prerelease software.

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
