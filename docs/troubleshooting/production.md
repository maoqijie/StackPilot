# Production Troubleshooting

Start with `/healthz` (process alive) and `/readyz` (dependencies ready), then inspect structured Controller logs by request ID. Never paste cookies, Authorization headers, enrollment tokens, private keys or complete Agent output into an issue.

- Login loops: confirm public HTTPS origin exactly matches `STACKPILOT_ALLOWED_ORIGINS`, Secure cookies are enabled and proxy headers come from an explicitly trusted proxy CIDR.
- `403` on writes: distinguish missing permission, node scope, CSRF, expired reauthentication and disabled dangerous capability. Do not enable crontab globally as a diagnostic shortcut.
- Agent offline: verify DNS/SAN, CA file, system time, protocol version, node revocation and private firewall path to 9443. Never disable TLS verification.
- Upgrade blocked: resolve every preflight failure; ensure the database volume has 512 MiB free and take a new verified backup.
- Audit failure: stop high-risk operations, preserve database/log evidence and use the private vulnerability channel if compromise is suspected.

Expected listeners are public 443, loopback 8787 for native Controller, and private/loopback 9443 for Agent management. Use `ss -lntp` on Linux and investigate any additional public listener.
