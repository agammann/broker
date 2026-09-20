# Broker

**Agent access. Your rules.**

[Website and interactive sample](https://broker-access.alx21.chatgpt.site/) · [Installation](docs/INSTALL.md) · [Documentation](docs/README.md)

Broker is a service you run yourself to give AI agents narrowly scoped account access. You enroll credentials privately and choose the allowed operation. Broker checks permission, handles authentication and the browser session, and returns structured invoice records through MCP.

**Early release candidate: 0.1.0-rc.1.** Only the bundled synthetic test portal is implemented. No real business portal is claimed compatible. The public website includes a fictional browser simulation; it does not host private customer vaults.

## Start here

| You want to…                                       | Start with…                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Understand the idea without installing anything    | [Public website and interactive sample](https://broker-access.alx21.chatgpt.site/)   |
| Run the owner dashboard locally                    | [Windows installation](docs/INSTALL.md#windows-first-run)                            |
| Exercise the complete account and invoice workflow | [Bundled test portal walkthrough](docs/INSTALL.md#try-the-bundled-test-portal)       |
| Run the services in containers                     | [Docker Compose](docs/INSTALL.md#docker-compose)                                     |
| Connect an MCP client                              | [MCP setup and first invoice read](docs/MCP.md)                                      |
| Review implementation and limitations              | [Security model](docs/SECURITY.md) and [verification evidence](docs/VERIFICATION.md) |

## What Broker does

1. **You define access.** Enroll an account privately, register an agent, and grant a specific operation with dates, expiration, and optional approval.
2. **Broker enforces it.** The trusted service checks policy before authentication, before reads, and before returning results.
3. **The agent gets the result.** The MCP interface returns invoice records. It does not export account passwords, authenticator secrets, or cookies.
4. **You can stop access.** Revoke a grant, rotate an agent credential, or lock the vault. Information already returned cannot be recalled.

The application includes an owner dashboard, an encrypted SQLite vault, a separate agent gateway, six MCP tools, temporary Chromium sessions, activity history, and encrypted backup and restore.

## Get the source

```sh
git clone https://github.com/agammann/broker.git
cd broker
```

For native Windows, use Node **24.19.0 or newer within 24.x** and pnpm **11.19.0**. Continue with the [installation guide](docs/INSTALL.md), which covers private initialization, filesystem permissions, service startup, and expected results. No AI API key is needed for the bundled workflow.

A default installation has an empty, locked vault and no enabled adapter. That is expected. Use the opt-in test portal instructions to retrieve synthetic invoices.

## Repository map

| Location                                                      | Purpose                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| [src/ui](src/ui)                                              | Owner dashboard                                          |
| [src/core](src/core)                                          | Vault, database, policy, and session lifecycle           |
| [src/server](src/server)                                      | Owner service and agent gateway                          |
| [src/mcp](src/mcp)                                            | MCP bridge and example client                            |
| [src/adapters](src/adapters) and [src/fixtures](src/fixtures) | Restricted browser adapter and synthetic portal          |
| [tests](tests)                                                | Unit, integration, browser, and manual Compose checks    |
| [deploy](deploy) and [compose.yaml](compose.yaml)             | Container configuration and sandbox policy               |
| [docs](docs/README.md)                                        | Setup, operation, compatibility, and verification guides |

The public visitor website is maintained separately from this application checkout. [Development instructions](CONTRIBUTING.md) explain the local checks and test artifacts. [Release notes](CHANGELOG.md) and the [implementation checklist](PLAN.md) record status and remaining integration work.

## Deployment boundary

Run Broker under an owner-controlled OS account or dedicated host. Agents must not have access to its administrator account, vault files, internal credentials, owner browser, or Docker socket. Running every component under one OS identity is a development topology, not filesystem isolation.

Delegating both password and TOTP removes the independence of a human-held second factor. Read the [security model](docs/SECURITY.md) before changing deployment boundaries. Passing tests is not an independent security certification.

## Licensing

This repository is public for review. No open source or commercial license is granted in this release candidate; licensing remains an owner decision before distribution. Third party notices are recorded in [deploy/NOTICE.md](deploy/NOTICE.md).
