# Broker

**Give your agents the access they need, with control you keep.**

**[Visit the Broker website and interactive sample](https://broker-access.alx21.chatgpt.site/)**

The public website introduces Broker and includes a browser simulation with fictional data. Private account vaults run in your own installation.

Broker is a self-hosted, single-owner service for delegating narrow account operations to agents. An owner privately enrolls credentials and grants access. A trusted service checks permission, authenticates with password and TOTP, owns the browser session, and returns structured invoice records through MCP.

**Status: early release candidate, 0.1.0-rc.1. The bundled test portal is implemented. No real business portal is claimed compatible.** The first usable release remains blocked on owner selection and authorized verification of a real integration. Passing tests does not constitute an independent security audit or establish production security.

## What is included

- React owner dashboard: overview, accounts, agents and grants, approvals, sessions, activity, vault and maintenance.
- Separate agent gateway and trusted owner/vault service; internal authentication and repeated trusted policy checks.
- AES-256-GCM encrypted records; random data key wrapped using a separate vault passphrase and scrypt. Locked after restart.
- Agent credentials stored as SHA-256 verifiers; expiration, rotation, revocation, exact single-use approvals, bounded sessions, request rate and concurrency limits.
- Ephemeral Chromium contexts, fixed adapter destinations, DNS-checked connection proxy, no exported cookies, passwords, or TOTP tools.
- Invoice-only MCP tools, encrypted backup and verified restore, migrations, retention, local activity and metrics.

## Run locally

Use Node **24 LTS** (24.19.0 or newer in the 24.x line), pnpm **11.19.0**, and Chromium installed by Playwright. See [installation](docs/INSTALL.md) for Windows permissions, fixture mode and Compose.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
pnpm run init
pnpm start
```

In a second terminal, start the agent gateway:

```sh
pnpm gateway
```

Open **http://127.0.0.1:4310**. Read `.secrets/setup` privately, then create an owner password and a **different** vault passphrase in Broker. Never paste them into an agent conversation. Default installation has no external adapter and no sample account. Follow the fixture instructions to exercise the bundled portal.

## Agent connection

Register an agent in the dashboard and save its one-time credential to a private file outside the agent's repository. Configure its MCP client with an absolute bridge path and private credential file:

```json
{
  "mcpServers": {
    "broker": {
      "command": "node",
      "args": ["/absolute/path/to/broker/dist/mcp/bridge.js"],
      "env": {
        "BROKER_AGENT_CREDENTIAL_FILE": "/private/path/agent-credential.txt",
        "BROKER_GATEWAY_URL": "http://127.0.0.1:4311"
      }
    }
  }
}
```

Use Windows absolute paths with escaped backslashes where appropriate. This credential authorizes the agent; account passwords, authenticator secrets and cookies never go to the agent. No AI API key is needed. [MCP reference and executable client](docs/MCP.md).

## Documentation

- [Installation and shutdown](docs/INSTALL.md)
- [Architecture and threat model](docs/SECURITY.md)
- [Adapters and compatibility](docs/ADAPTERS.md)
- [Backup, recovery, upgrade and rollback](docs/OPERATIONS.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Verification evidence and platform matrix](docs/VERIFICATION.md)
- [Release notes and blockers](CHANGELOG.md)
- [Implementation checklist](PLAN.md)

Run `pnpm check` for lint, types, unit/integration/MCP tests, production build and owner browser tests. Tests use clearly marked synthetic credentials and invoices, with recording disabled. No external telemetry is configured.

## Security model

Run Broker under an owner-controlled OS account or dedicated host. Do not give agents access to that host, its administrator account, vault volumes, internal credentials, owner browser, or Docker socket. An unrestricted agent on the Broker host can defeat the boundary. Unattended delegation of both password and TOTP removes the independence of a human-held second factor. Vault lock or revocation cannot erase invoice information already returned.

## Repository and licensing

This repository is public for review. No open-source or commercial license is granted in this release candidate; licensing is an owner decision before distribution. Do not interpret public visibility as permission to use proprietary code under an unstated license.
