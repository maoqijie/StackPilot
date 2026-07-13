# Deployment Assets

- `docker/`: pinned multi-stage images and Compose topology. See [Docker Compose installation](../docs/installation/docker-compose.md).
- `systemd/`: separate non-root Controller/Agent users plus the optional local-only certificate helper socket and hardened root helper. See [systemd installation](../docs/installation/systemd.md).
- `nginx/`: HTTPS reverse proxies with bounded requests and security headers.
- `examples/`: non-secret environment templates; replace all `.invalid` values.
- `scripts/`: preflight, backup-aware upgrade, release generation/verification, installation and explicit uninstall.

Production uses real CA-issued certificates, exact allowed origins and explicit trusted proxy CIDRs. Only Web HTTPS is public; Controller 8787 remains internal/loopback and Agent 9443 remains private/loopback. Follow the [release checklist](../docs/release-checklist.md) before tagging.

The Docker Agent reports inventory only and cannot manage host certificates. Native Linux Nginx/Certbot renewal requires `stackpilot-cert-helper.socket` and explicit per-node capability authorization.
