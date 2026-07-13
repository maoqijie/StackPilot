# StackPilot Agent

This workspace contains the independent TypeScript StackPilot Agent process. It connects only to a verified HTTPS Controller Agent API, enrolls with a short-lived one-time token, and then signs requests with its own Ed25519 identity.

The Agent must run as a dedicated non-root user. Its remote task registry is read-only and contains only `system.summary.read` and `service.status.read`; there is no generic shell task. Database work is delegated to the local root-only `database-helper` over a Unix socket with strict operation schemas.

Every heartbeat may include a bounded, read-only monitoring snapshot with collection time, hostname, primary IP, CPU, memory, load average, all detected disk volumes, and uptime. Controllers also accept legacy `1.0` heartbeats without telemetry, so existing Agents remain compatible while they are upgraded.

Protocol `1.1` publishes database inventory and complete SQL uploads on separate signed endpoints every 60 seconds. Collection is single-flight, does not run from Web polling, and does not put database data or credentials in the heartbeat. Existing database credentials remain in root-only files owned by `database-helper`.
