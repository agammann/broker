# Broker documentation

[Repository overview](../README.md) · [Public website](https://broker-access.alx21.chatgpt.site/)

Start with installation, then the bundled test portal and MCP example. The website demo is fictional; the installed application exercises the actual bundled portal with synthetic data. Real external services are not yet supported.

| Task                                                 | Guide                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| Install, initialize, start, try the portal, and stop | [Installation](INSTALL.md)                                                  |
| Configure an MCP host and retrieve invoices          | [MCP bridge and example client](MCP.md)                                     |
| Understand an error or empty result                  | [Troubleshooting](TROUBLESHOOTING.md)                                       |
| Back up, restore, upgrade, or roll back              | [Operations and recovery](OPERATIONS.md)                                    |
| Review trust boundaries and deployment limitations   | [Architecture and threat model](SECURITY.md)                                |
| Understand adapter scope and unsupported flows       | [Adapters and compatibility](ADAPTERS.md)                                   |
| Review recorded tests and unverified environments    | [Verification evidence](VERIFICATION.md)                                    |
| Find implementation reference material               | [Official references](REFERENCES.md)                                        |
| Work on the repository and run its checks            | [Development guide](../CONTRIBUTING.md)                                     |
| Review release status and remaining work             | [Release notes](../CHANGELOG.md) and [implementation checklist](../PLAN.md) |

Keep passwords, setup tokens, agent credentials, TOTP material, cookies, backups, and private account data out of public issues and logs. Use fictional reproduction data when describing a problem.
