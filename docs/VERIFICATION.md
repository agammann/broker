# Verification evidence

Latest functional verification: September 19, 2026 (Pacific). This file records observed results, not an independent security certification or a real-customer acceptance study.

## Delivery closeout

On September 19, the owner limited the remaining work to what can be completed without an external test account. A final native `pnpm check` passed lint, type checking, all 34 unit/integration tests in six files, the production build and the owner browser workflow. The production dependency audit reported no known vulnerabilities. A fresh documentation audit passed all 50 local links/anchors and 16 public URLs across 14 Markdown files; GitHub's website field matches the public sample site. The live website returned HTTP 200 and retained its fictional simulation labeling.

The current delivery is complete as a tested release candidate with the bundled synthetic portal. Real external account integration is deferred and unavailable. The earlier Docker and visual browser results below were not rerun for this documentation-only closeout.

## September 19 functional verification

- The published [visitor website](https://broker-access.alx21.chatgpt.site/) passed a browser walkthrough of approval, reading two fictional records, revocation, blocked subsequent reads, reset, and denial. At 390 × 844, controls remained usable without horizontal overflow. No browser console errors were observed. This is the public simulation, not a connection to a private Broker vault.
- On Windows with Node 24.19.0 and pnpm 11.19.0, `pnpm check` passed lint, type checking, 34 unit/integration tests across six files, the production build, and one owner browser workflow. The browser workflow uses disposable state and includes mobile layout checks.
- A reproduced MCP configuration defect caused a gateway URL ending in `/` to request `//v1/tool` and fail with a route-not-found response. The integration regression failed before the bridge normalized trailing slashes; both URL variants passed after the fix through the actual gateway, Chromium login and invoice retrieval.
- A fresh disposable Docker Compose installation using Docker 29.8.0 with Linux containers passed owner setup, private enrollment, explicit owner denial, a separately approved request, sandboxed password/TOTP login, actual stdio MCP retrieval of two synthetic invoices, session closure, denied access after grant revocation, and encrypted backup/restore. Restore left the vault locked and restored agents revoked. No existing owner vault was used.
- `pnpm audit --prod` reported no known production dependency vulnerabilities at the time of the check.
- The documentation audit checked 14 Markdown files, 50 repository links/anchors and 16 public URLs without a broken destination. GitHub's website field points to the visitor website above. Native loopback URLs and private/example domains are intentionally documented setup values.

Test files now use OS temporary directories and Playwright's ignored `test-results/` output directory, so a fresh checkout does not require a `work` directory outside the repository. Installation and MCP instructions include the fixture workflow, expected output, current access windows versus invoice dates, and troubleshooting.

These results establish the bundled workflow only. A real external service has not been selected or implemented, private remote HTTPS has not been deployed here, and no tests with independent real users have been performed. Those remain prerequisites to claiming readiness for real customer accounts.

## September 11 verification record

The following record is retained from September 11, 2026 UTC / September 10 Pacific. Its test counts and security scan describe that earlier snapshot.

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
