# Upgrade and Rollback Drill Record

The repository command `npm run release:drill` creates an isolated schema-1 SQLite database with a marker user, runs production preflight and the normal upgrade command, verifies schema 2 and retained data, verifies the backup SHA-256, deletes the test database, restores the schema-1 backup and verifies integrity, schema and marker data.

On 2026-07-11, Windows with Node 24.11.0 was correctly rejected by preflight because production supports Node 22.x only. A temporary official Node 22.22.0 runtime then ran locked `npm ci` and the drill successfully: schema-1 backup, schema-2 migration, audit verification, SHA-256 verification, test-database deletion and schema-1 restoration all passed. Transactional failure rollback is independently covered by `tests/deploy/upgrade.test.js`, which introduces a failing migration and confirms both schema and data remain at the prior state.

This is an isolated database drill, not evidence that Docker or systemd ran on Windows. Linux container and unit validation remain required CI gates.
