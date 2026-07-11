# Docker Compose Installation

Use Linux x86_64, Docker Engine 27+ and Compose v2. Obtain a tagged release and verify its Cosign bundle and `SHA256SUMS` before installation. Never deploy from a mutable `latest` tag.

1. Create a real public TLS certificate/key for the Web hostname and a separate certificate/key plus CA chain for the private Agent endpoint. Production certificates must come from a public or organization CA; development self-signed certificates are forbidden. The bind-mounted Web key must be readable only by numeric UID 101 and the Agent-endpoint key only by UID 10001; certificates may be `0444`, keys should be `0400`.
2. Generate the Controller master key outside the repository: `openssl rand -base64 32 > /secure/stackpilot-master-key`, then set mode `0600`.
3. Set `STACKPILOT_VERSION`, `STACKPILOT_PUBLIC_ORIGIN`, certificate paths and master-key path in the operator shell or a root-readable deployment environment file. Do not put values in `deploy/`.
4. Validate before starting: `docker compose -f deploy/docker/compose.yaml config --quiet`.
5. Start Web and Controller: `docker compose -f deploy/docker/compose.yaml up -d --build web controller`.
6. Initialize the first administrator from a local Controller TTY: `docker compose -f deploy/docker/compose.yaml exec controller npm run db:init --workspace @stackpilot/controller`.

Only host TCP 443 is public by default. Controller port 8787 is internal. Agent TLS port 9443 binds to `127.0.0.1` by default; expose it only on a private management address protected by host/network firewall rules. The optional Agent profile uses a one-time token file:

```bash
STACKPILOT_AGENT_CA_PATH=/secure/agent-ca.crt \
STACKPILOT_AGENT_ENROLLMENT_TOKEN_PATH=/secure/one-time-token \
docker compose -f deploy/docker/compose.yaml --profile agent up -d agent
```

Delete the enrollment-token file and recreate the Agent container after enrollment. Web, Controller and Agent run as UIDs 101, 10001 and 10002 with read-only roots, dropped capabilities and no Docker socket. Confirm with `docker compose exec controller id` and `docker compose exec agent id`.
