# StackPilot Agent

This workspace contains the independent TypeScript StackPilot Agent process. It connects only to a verified HTTPS Controller Agent API, enrolls with a short-lived one-time token, and then signs requests with its own Ed25519 identity.

The Agent must run as a dedicated non-root user. Its initial task registry is read-only and contains only `system.summary.read` and `service.status.read`; there is no generic shell task. This remains a development prototype, not a production deployment package. See `docs/security/controller-agent-threat-model.md` and the root README for the local certificate and startup process.

Every heartbeat may include a bounded, read-only monitoring snapshot with collection time, hostname, primary IP, CPU, memory, load average, all detected disk volumes, and uptime. Controllers also accept legacy `1.0` heartbeats without telemetry, so existing Agents remain compatible while they are upgraded.
