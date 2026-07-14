# StackPilot database-helper

`database-helper` is the only root process in the database control plane. It accepts one bounded JSON request over a local Unix socket, validates the complete request with shared Zod contracts, and exposes no shell or arbitrary executable/path interface.

The non-root Agent owns Controller connectivity. Database credentials stay in `/var/lib/stackpilot-database-helper/credentials` with mode `0600`; the Agent receives only bounded database snapshots, query uploads, and operation status envelopes.

The helper currently executes collection, logical backup, instance read-only changes, protected session termination, read-only Explain and fixed online index DDL. Install and in-place restore return explicit structured refusal until the distro-specific multi-instance provisioner and offline rollback driver pass the compatibility integration suite; they never return simulated success.
