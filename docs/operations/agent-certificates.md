# Controller-Agent Certificates

Use a dedicated organization CA or restricted intermediate CA for the private Agent endpoint. The certificate SAN must match `STACKPILOT_CONTROLLER_URL`; Agents retain normal chain and hostname verification.

Issuance: create the Controller key on the Controller host, send only a CSR to the CA, install the returned leaf/full chain as root-readable `0600`, and distribute only the CA certificate to Agents. Never reuse the Web key or copy the Controller private key to an Agent.

Rotation: issue an overlapping certificate, deploy the new CA bundle first when the issuer changes, replace the Controller credential atomically, restart, verify `/readyz` and two Agent heartbeats, then retire the old certificate. Rotate before expiry and monitor the CA's expiry externally.

Revocation: revoke at the CA, replace the Controller certificate if its key is suspected, update Agent trust stores, and revoke affected node identities in StackPilot. TLS certificate revocation and per-node credential revocation are separate controls; perform both after compromise.

An expired or untrusted certificate must stop communication. Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0`, use `curl -k`, or make a self-signed production exception. Development certificates from `npm run agent:cert` are local-only and must never be promoted.
