# Production Security Hardening

Expose only HTTPS 443 publicly. Keep Controller HTTP on loopback or the internal Compose network; keep Agent 9443 on a private management network with firewall allowlists. Database files, master key and TLS keys are never network services.

Set `STACKPILOT_PRODUCTION=1`, `STACKPILOT_COOKIE_SECURE=1`, one exact HTTPS allowed origin, and the smallest proxy IP/CIDR set. Forwarded headers from any other peer are ignored; even trusted forwarded addresses are audit context, never authentication.

Use Docker secrets or systemd credentials, owner-only files and an external secret backup. Rotate the master key and Agent identities independently. Keep crontab write and restart compatibility switches disabled unless their operational risk is accepted. Do not mount the Docker socket, use privileged/host modes, add capabilities, or run Controller/Agent as root.

For native certificate renewal, install the socket-activated helper instead of granting Agent sudo access. Keep `/run/stackpilot-cert-helper/helper.sock` at `0660 root:stackpilot-cert`, review the helper unit before upgrades, and authorize `sites.certificates.renew` only for intended nodes. Docker Agents intentionally cannot renew host certificates. A renewal can be cancelled only while queued. Once execution starts, timeout, disconnect, restart, or any other uncertain outcome is stored as `RESULT_UNKNOWN`, remains certificate-locked, and is never retried automatically.

Patch the supported OS, Node 22 and images regularly. Block a release on high/critical dependency or image findings. Verify Cosign identity, checksums and SBOM before installation. Route security reports through GitHub Private Vulnerability Reporting, not public issues.
