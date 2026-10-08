# Development guide

[Repository overview](README.md) · [Documentation](docs/README.md)

This guide describes how to build on Broker 1.0.0. The original source uses the [MIT license](LICENSE); the bundled portal provides synthetic data for development and verification.

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

Use `broker-verification` as the disposable Compose project name. The check restarts only its trusted service and gateway, verifies that its volume retains restored state, and leaves the vault locked. A second run against that initialized volume refuses to perform owner setup.

To check the source delivery itself, use Git and Python 3.12 in addition to the runtime above:

```sh
pnpm package:release
pnpm test:consumer
```

Packaging requires a clean committed checkout. It creates `release-artifacts/` with the exact versioned source ZIP, manifest and SHA256SUMS. The consumer check rejects checksum or source-tree differences and requires a new extraction directory; it installs the frozen dependencies and runs the actual MCP/Chromium and owner browser checks from that extraction. It creates only disposable fixture state. Set `BROKER_PYTHON` or `BROKER_PNPM` to the corresponding executable/script path when those tools are outside PATH. CI publishes only an exact current main commit after the Windows, Linux, fresh-consumer and Compose jobs pass; an existing published version is left unchanged.

[GitHub Actions](https://github.com/agammann/broker/actions/workflows/check.yml) runs `pnpm check` on Windows and Linux, audits all locked dependencies, and builds a fresh `broker-verification` Compose project to run the encrypted backup/restore and actual MCP/browser workflow. That job deletes only its disposable CI stack and volume after verification. Browser screenshots use fictional fixture state and are saved as CI artifacts; secrets and backups are excluded.

## Make reviewable changes

1. Keep changes scoped and update the relevant guide when commands or behavior change.
2. Preserve the separation between owner, gateway, agent, and private vault data.
3. Use synthetic test data. Do not commit private files, downloaded credentials, backups, or generated output.
4. Run checks appropriate to the change. Security and policy behavior needs a regression that exercises the boundary.
5. State the behavior, validation performed, and limitations in the change description. A test portal result does not prove real service compatibility.

Historical results remain in [verification evidence](docs/VERIFICATION.md). Add dated evidence for new checks rather than rewriting an old scan as a review of newer code.
