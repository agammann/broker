# Verification evidence

Final verification: 2026-09-11 UTC / 2026-09-10 Pacific. This file records observed results, not an independent security certification.

## Native checks

Native Windows x64: Node 24.19.0, pnpm 11.19.0, Playwright 1.63.0, Chromium 153.0.8010.12. Type checking, ESLint, production TypeScript/Vite build, 33 unit/integration/MCP tests and one owner browser workflow passed in the consolidated check. Two added regressions reproduced the global capacity and owner restore overlap defects before their fixes, then passed afterward.

Test coverage includes all 18 RFC 6238 vectors across SHA-1/256/512; TOTP enrollment parsing; wrong passphrase, GCM tampering and AAD binding; backup validation/restoration; locked startup/restart; cross-agent isolation and impersonation; strict tool inputs; idempotent concurrent requests; one-time approval consumption and expiry; policy change invalidation; authentication/read revocation races; lock cancellation; rate/concurrency/date restrictions; credential rotation; owner Host/Origin/CSRF/cookie checks; authenticated internal calls; IP and proxy destination rejection; actual portal replay rejection; real MCP over stdio through gateway and Chromium; fixture pagination/decimal output; secret exclusion from audit/results; human-action/layout/identity/lockout statuses.

The owner Playwright workflow covers fresh setup, login, vault unlock, private credential enrollment, actual test-portal identity verification, agent registration, grant creation, revocation, all dashboard sections, vault lock, empty states and 390px responsive layout without horizontal overflow or page errors. Browser traces/video are disabled. Screenshots contain only disposable test state.

## Dependency audit

`pnpm audit --prod`: no known vulnerabilities after upgrading @fastify/static to 10.1.3. This is a registry advisory snapshot, not proof that dependencies contain no vulnerabilities.

## Platform matrix

| Environment                                           | Status                                                                                                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows native Node 24.19.0 / Chromium 153            | Passed lint, types, build, 33 tests and owner browser workflow                                                                                            |
| Docker Desktop 29.7.2, Linux containers, Node 24.20.0 | Passed image builds and owner setup, private enrollment, sandboxed Chromium login, real MCP invoice read, close, revocation, encrypted backup and restore |
| Linux native                                          | Not separately tested                                                                                                                                     |
| macOS                                                 | Not tested                                                                                                                                                |
| Private remote HTTPS                                  | Documented, not deployed or tested here                                                                                                                   |
| Real external invoice portal                          | Not selected, implemented or verified                                                                                                                     |

## Scope and residual gaps

Fixture tests use the actual bundled Fastify portal with synthetic credentials and invoices; they do not contact a real billing service. TOTP codes are generated and submitted internally by Chromium, not returned through MCP. Browser network regression tests attempt redirected navigation, cross-origin subresources, popups, WebSockets, service workers and an unapproved same-origin mutation, with a listening trap used to detect unauthorized requests. This is targeted regression coverage, not an exhaustive browser escape assessment.

Backup/restore and same-version migration/restart are tested. A separate physical-host disaster-recovery drill, cross-version migrations/downgrades, external remote logout semantics, real account lockout behavior and independent penetration testing remain outside these results.

## Codex Security review

Standard scan 181093d7-efba-4dfe-8277-dfdc48340885 completed on September 11, 2026 UTC. An independent AI baseline auditor, architecture reviewer and focused policy investigator reviewed 71 of 73 source files. No substantiated vulnerabilities were reported. Coverage is recorded as partial: dependency lock metadata and nonexecutable third party license were not fully audited; installed dependencies, generated bundles and private runtime files were excluded. This does not certify production security.

The scan snapshot preceded the following reviewed correctness and packaging fixes: combined session and authentication capacity reservation with a final admission check; restore exclusion of overlapping unlock/passphrase changes; Caddy file capability removal; and the precise Chromium namespace chroot syscall allowance described in deploy/NOTICE.md. The first two have regressions that failed before the fix and passed afterward. Native checks and the complete Docker workflow passed after these fixes. The owner form also now uses local time for access defaults, verified in a Pacific timezone browser.

The actual external portal, private HTTPS deployment and browser engine internals remain unverified. The generated scan report is retained separately with the local release artifacts; this summary does not replace it.
