# Operations and recovery

## Health, limits and shutdown

Owner and gateway `/health` report only status. The owner dashboard provides local event counts and average authentication/operation duration. Failed login categories and unexpected human-action interruptions are separate from initial setup and configured owner approvals. Request bodies, headers, passwords, cookies, TOTP and invoice contents are not logged. Fastify request logging is disabled. The MCP bridge logs no authentication material.

Limits: 100 accounts, 100 agents, 500 grants, 50 pending/authenticating requests, 3 authentication jobs and 12 sessions globally. Per-grant concurrency 1–3; per-grant rate 1–120 per minute, separately enforced for session requests and invoice operations. Each session accepts one read at a time. Session lifetime 30–3600 seconds and bounded by agent/grant/vault expiry. Authentication has a 60-second deadline; invoice reads have 30 seconds. Browser selectors time out after 10 seconds. Requests awaiting approval expire within five minutes. There is no persistent work queue: over-capacity calls receive busy/concurrency_limited/queue_full. Expiration cleanup runs every second; access checks enforce deadlines even before cleanup.

Use Ctrl+C or SIGTERM for native shutdown and `docker compose down` for containers. Allow 75 seconds for cleanup. Avoid force-killing where practical. Host crashes can prevent remote logout; restart never reuses a session.

## Encrypted backup

1. Authenticate as owner and unlock the vault.
2. In **Vault & maintenance**, download an encrypted backup. Save it to owner-controlled storage separate from the Broker host.
3. Keep the vault passphrase used at backup time separately. Losing it and the live unlocked service means encrypted credentials cannot be recovered by Broker.
4. Regularly test restore into a fresh isolated installation. A downloaded file alone is not a verified recovery procedure.

The backup envelope includes wrapped DEK and cryptographic metadata, with the account/agent/grant/settings payload authenticated and encrypted under that DEK. Account credentials remain encrypted within it. Owner authentication credentials, browser sessions, request history and audit logs are not included. Audit retention is separately configured, 1–365 days; default 90. Backups remain readable with their original passphrase after later passphrase changes. Rotate/delete old backup copies according to your own retention policy.

## Verified restore

1. Install Broker on an isolated host; initialize a new owner login if needed.
2. Sign in. Select the backup and privately enter its **original vault passphrase**.
3. Type RESTORE and confirm replacement. Broker authenticates/decrypts the envelope and every account record before changing the database. Wrong passphrases or damaged ciphertext fail without replacing accounts.
4. Successful restore atomically replaces account/grant/agent configuration, closes existing sessions and leaves the vault locked. The current owner login verifier is retained, but owner sessions are invalidated.
5. Sign in again and unlock using the restored backup passphrase. Accounts are unverified; all restored agents and grants are revoked. Re-test identities, rotate the agents you intend to re-enable, and create new grants deliberately.

Tests exercise both failure-preserving and successful restore paths, including decrypting the restored account with the original passphrase. Independent storage, actual host disaster recovery and external session invalidation must be verified in the deployment environment.

If you forget only the owner login, create a fresh isolated installation with a new owner login and restore a known encrypted backup using its vault passphrase. There is no hidden password-reset endpoint or default administrator. If you have no readable backup and cannot log in, recovery requires owner-controlled offline administration; there is no supported way to recover a forgotten vault passphrase. Do not ask an AI agent to inspect plaintext process memory.

## Upgrade and rollback

1. Read release notes and check the target release's schema version and runtime requirements.
2. Export and test an encrypted backup. Record the source commit/version. Save the previous application directory/image.
3. Stop Broker gracefully. For a fast same-version rollback, also take an owner-only **cold** copy of the entire data directory/volume after shutdown. Do not copy only the main SQLite file while WAL writes are active.
4. Install the locked dependencies in a new directory, build, run checks, then start against a copy of the data first. SQLite migrations use a transaction; binaries reject schema versions newer than they understand. This candidate has only migration 001.
5. Verify owner login, locked startup, unlock, fixture/actual adapter reads and revocation before replacing the live instance.
6. Roll back by stopping the upgraded service and starting the previous binary against the cold pre-upgrade data copy. If schemas differ, never blindly point an old binary at upgraded data. A fresh install plus encrypted backup restore is the alternative, with re-verification and credential rotation required.

A true cross-version upgrade/rollback cannot be claimed tested until a second schema version exists. The suite tests initial migration and same-version restart/restore. Do not delete old recovery material until the new installation has been verified.

## Secret and account deletion

Revocation immediately prevents new authorization and closes affected contexts. Account deletion removes that account's ciphertext, grants and requests from the live database. SQLite secure_delete is enabled, but old WAL pages, filesystem snapshots, storage remanence and backups may retain encrypted copies. Secure erasure of all historical copies is a host/storage responsibility. Deleting Broker data does not delete the destination account or undo returned invoices.
