# Version 1.0.0 verification

Local acceptance was run on October 8, 2026 using disposable synthetic accounts. Broker v1 is a self-hosted developer starter with the bundled invoice portal; the public visitor website is a separately maintained fictional simulation.

## Installed native source

Windows x64, Node 24.19.0, pnpm 11.19.0, Playwright 1.63.0 and matched Chromium 153.0.8010.12:

- Frozen installation, lint, TypeScript checks, 34 unit/integration tests in six files, production build and the owner browser workflow passed.
- Private initialization preserved existing setup/internal files, and fixture initialization refused an overwrite. The documented Windows ACL commands succeeded for disposable `.secrets` and `data` directories.
- The built owner service started with an empty adapter registry and locked vault. Browser setup, login, opt-in fixture enrollment, actual password/TOTP login and secret-field clearing passed.
- The documented example CLI used the built stdio bridge and gateway, waited for exact owner approval, read both synthetic invoices and closed its session. A separate denied request stayed denied. All six MCP tools were listed; request/session state and invoice retrieval used actual installed services.
- A live 30-second session expired after 31.075 seconds of measured waiting; subsequent session/read calls were rejected. No clock change was used for this check. Separate unit expiration regressions use controlled deadlines.
- Browser credential rotation invalidated the old MCP credential; the replacement authenticated successfully. Owner activity and API/backup output excluded generated password, TOTP, agent and internal credentials.
- The browser downloaded an encrypted backup. Wrong-passphrase and damaged-ciphertext attempts left existing accounts intact. Successful restore required sign-in again, left the vault locked, marked accounts unverified and revoked restored agents/grants. The original backup passphrase unlocked the restored data.
- The built process was stopped and restarted against the same private database. Encrypted accounts and revoked authority persisted; startup remained locked. Windows process termination was controlled by the verification driver; graceful container restart was tested separately below.
- All seven owner pages were usable at 1440, 390 and 320 pixels without page-wide horizontal overflow. Sign out remained visible and worked from the keyboard. The valid setup/recovery browser workflow had no console or page errors. The two deliberate invalid-restore HTTP 400 responses were retained separately as expected rejection evidence.

Testing first reproduced hidden mobile sign-out, stale dashboard state after restore/relogin, and a cancelled restore showing a success notice. Their fixes passed the owner browser regressions. Cancellation now leaves the current installation unchanged without claiming a restore happened.

## Docker Compose

Docker Desktop 4.93.0, Docker Engine 29.8.1 and Compose 5.5.1 with Linux containers were used for fresh, separately named disposable projects. The pinned Node 24.20.0 and Caddy 2.11.4 image digests and Playwright sandbox profile remain recorded in the source and release manifest.

Image builds, owner setup, private enrollment, exact approval/denial, sandboxed Chromium password/TOTP login, actual stdio MCP invoice retrieval, session closure, a real short-lived agent expiration, denied access after grant revocation, and encrypted backup/restore passed. Graceful restart of the trusted service and gateway retained the volume, owner login, restored account and revoked authority. Startup was locked; the restored account decrypted and connected again after unlock, then the vault was locked.

An immediate re-verification after a Broker-only restart first hit the still-running portal’s TOTP replay protection. The final recovery check waited an actual full authenticator period and passed without changing the portal or its replay rule. The same step is documented in [operations](OPERATIONS.md) and [troubleshooting](TROUBLESHOOTING.md).

## Source delivery and release gates

The full dependency audit reported zero known advisories after applying available compatible updates. This is a dated registry result.

The source package requires a clean committed tree and records its commit, tree, exact container inputs, ZIP size and SHA-256. Fresh extraction verifies checksums, paths and every tracked byte, excludes private/runtime files, installs the frozen lockfile and reruns the actual MCP/Chromium and owner browser workflow. [GitHub Actions](https://github.com/agammann/broker/actions/workflows/check.yml) repeats Windows, Linux and fresh-consumer checks, plus the actual disposable Compose recovery check. The publisher requires all jobs to pass, refuses a moved main commit or conflicting tag, and leaves an already published version unchanged.

## Supported boundary

Only the bundled synthetic portal adapter is implemented. These results do not establish compatibility with third-party accounts, private remote HTTPS deployments, every MCP host, macOS or independent customer onboarding. Migration 001 is the only schema; same-version persistence and encrypted recovery were tested, while cross-schema upgrades were not. The architecture and [historical evidence](VERIFICATION.md) remain available for developers building a separately verified integration.
