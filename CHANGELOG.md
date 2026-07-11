# Changelog

All notable changes follow Semantic Versioning. The project is currently prerelease software.

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
