# Versioning and Compatibility

Current version: `0.2.0-preview.6`. StackPilot uses Semantic Versioning, but this is preview software and not a stable production release. `0.x` minor releases may contain breaking changes; prerelease labels do not carry a support SLA.

Controller and Web versions must match. Controller-Agent compatibility is independently negotiated through protocol `1.0`; `0.1.x` and `0.2.x` Agents are accepted only while they use protocol major 1 and server policy permits their declared task capability. Database schema 2 can be upgraded directly from schema 1. There is no automatic down migration.

The normative platform, browser, Agent and schema table is [compatibility.md](compatibility.md). Tags and GitHub release artifacts are authoritative; a package version in an untagged checkout is not a release.
