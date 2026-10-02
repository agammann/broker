# October 2, 2026 UTC verification

Environment: Windows, Node 24.19.0, pnpm 11.19.0 and Playwright Chromium 153.0.8010.12. All account data and credentials used here were disposable fixtures.

- Frozen installation, lint, TypeScript, 34 tests, production build and the owner browser workflow passed. The tests use actual stdio MCP, a gateway and Chromium password/TOTP login to retrieve both synthetic invoice records.
- The current dependency audit initially reported nine advisories. Updating Fastify and compatible transitive dependencies reduced the audit to zero advisories at all severity levels.
- Equal character counts do not imply equal UTF-8 byte counts. A malformed CSRF header reproduced an HTTP 500 through an actual loopback TCP request. The fixed comparison checks byte lengths before constant-time comparison; the same request now returns HTTP 403 with `csrf_failed`, and the vault stays unlocked. The concise HTTP regression failed before the fix and passed afterward; a valid owner request still works.

The [October 2 workflow run](https://github.com/agammann/broker/actions/runs/36964873703) passed all three jobs:

- Windows and Ubuntu 22.04 each passed lint, TypeScript, all 34 tests, the production build, the owner browser workflow and the full dependency audit.
- The disposable Docker Compose stack built and started successfully. Its smoke test passed owner setup, private enrollment, exact approval and denial, sandboxed password/TOTP login, actual stdio MCP invoice retrieval, session closure, blocked access after revocation, and encrypted backup with verified restore.

Docker verification ran on the Linux CI runner; local Docker was unavailable during this run. The stack's fixture credentials and database were disposable. The [workflow](https://github.com/agammann/broker/actions/workflows/check.yml) retains these checks for future changes.

These results cover the bundled synthetic portal. No real external business portal, private remote HTTPS installation, cross-version recovery or independent participant onboarding has been verified by these checks.
