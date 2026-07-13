# StackPilot Agent

This workspace contains the independent TypeScript StackPilot Agent process. It connects only to a verified HTTPS Controller Agent API, enrolls with a short-lived one-time token, and then signs requests with its own Ed25519 identity.

The Agent must run as a dedicated non-root user and has no generic shell task. It always declares `system.summary.read`, `service.status.read`, and `sites.inventory.read`. A Linux Agent declares certificate renewal only while its certificate helper is ready, and declares privileged database capabilities only after protocol negotiation and while the local root-only `database-helper` is reachable. Enrollment authorizes only safe capabilities by default; an administrator must explicitly authorize privileged capabilities.

Every heartbeat may include a bounded, read-only monitoring snapshot with collection time, hostname, primary IP, CPU, memory, load average, all detected disk volumes, and uptime. Controllers also accept legacy `1.0` heartbeats without telemetry, so existing Agents remain compatible while they are upgraded.

Protocol `1.1` publishes database inventory and complete SQL uploads on separate signed endpoints every 60 seconds. Collection is single-flight, does not run from Web polling, and does not put database data or credentials in the heartbeat. Existing database credentials remain in root-only files owned by `database-helper`.

On Linux, a non-overlapping collector scans `/etc/nginx/conf.d` and `/etc/nginx/sites-enabled` at most once every 60 seconds. It reads only Nginx configuration and the public file named by `ssl_certificate`; `ssl_certificate_key` is never opened or reported. Other platforms report site inventory as unavailable.

Renewal uses only `/run/stackpilot-cert-helper/helper.sock`. The Agent sends a fixed JSON request containing an opaque certificate ID; it cannot supply a path, executable, arguments, or shell text. Docker Agents remain inventory-only because they do not manage host Nginx or Certbot state.
