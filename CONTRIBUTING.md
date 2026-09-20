# Development guide

[Repository overview](README.md) · [Documentation](docs/README.md)

This guide describes how to inspect and validate the release candidate. The repository is public for review; this document does not grant a source license or change the licensing statement in the README.

## Prepare the checkout

Use Node 24.19.0 or newer within 24.x and pnpm 11.19.0. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

For Linux, Chromium also needs its system dependencies; see [installation](docs/INSTALL.md#linux-native). Keep the lockfile in sync with deliberate dependency changes.

## Run the checks

```sh
pnpm check
```

This runs lint, TypeScript checks, unit/integration tests, a production build, and the owner browser workflow. The tests supply disposable synthetic state; private initialization and an existing owner account are not required. Keep ports 14310, 14311, and 14313 available.

| Command             | Purpose                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| `pnpm lint`         | ESLint                                                                 |
| `pnpm typecheck`    | TypeScript without output                                              |
| `pnpm test`         | Unit, integration, and actual stdio MCP checks                         |
| `pnpm build`        | Server output in `dist/` and dashboard output in `web-dist/`           |
| `pnpm test:e2e`     | Owner setup, enrollment, grant, revocation, and mobile layout          |
| `pnpm audit --prod` | Current production dependency advisory check; requires registry access |

Temporary test databases and agent credential files use unique OS temporary directories and are removed by their test cleanup. Playwright screenshots contain disposable fixture state and live under ignored `test-results/`. No directory above the repository needs to be created. Do not enable recordings against real credentials.

`tests/compose-smoke.ts` is a manual, state-changing verification script for a fresh disposable Compose project. It is not part of `pnpm check` and must not be pointed at an existing owner installation.

## Make reviewable changes

1. Keep changes scoped and update the relevant guide when commands or behavior change.
2. Preserve the separation between owner, gateway, agent, and private vault data.
3. Use synthetic test data. Do not commit private files, downloaded credentials, backups, or generated output.
4. Run checks appropriate to the change. Security and policy behavior needs a regression that exercises the boundary.
5. State the behavior, validation performed, and limitations in the change description. A test portal result does not prove real service compatibility.

Historical results remain in [verification evidence](docs/VERIFICATION.md). Add dated evidence for new checks rather than rewriting an old scan as a review of newer code.
