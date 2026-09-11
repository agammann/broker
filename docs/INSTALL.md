# Installation

## Native Windows, verified development path

Requirements: supported Node 24 LTS, pnpm 11.19.0, about 2 GB free disk space, and at least 2 GB available RAM for Chromium and scrypt. Host time must be synchronized using the OS time service. Never share this OS account with an untrusted agent.

From the project directory:

```powershell
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
pnpm run init
$brokerPrincipal = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls .secrets /inheritance:r /grant:r "${brokerPrincipal}:(OI)(CI)F"
icacls data /inheritance:r /grant:r "${brokerPrincipal}:(OI)(CI)F"
pnpm start
```

Open the dashboard at `http://127.0.0.1:4310`. Read `.secrets/setup` in your own private editor. Enter that token, a new owner password, and a distinct vault passphrase in the setup form. The token cannot initialize the service again once setup is complete. Owner sessions expire after one hour. New login invalidates prior owner sessions. Vault unlock is separate and lasts 15 minutes by default; change this in settings.

Start `pnpm gateway` in another terminal. Both public listeners default to loopback; the authenticated internal listener uses loopback port 4312. No browser debugging port is opened. The gateway should be a separate OS identity or container for a real deployment. A native launch under a single OS account is a development/convenience topology, not filesystem isolation.

To stop, press Ctrl+C in gateway and trusted-service terminals. Shutdown locks the vault, stops tasks and closes contexts. Restart requires owner login and vault unlock. If a process is killed abruptly, restart marks old requests stopped; no browser sessions are restored.

## Bundled fixture portal

Fixture mode is opt-in and uses synthetic invoices. It never proves real portal compatibility.

```powershell
node scripts/fixture-init.mjs
$env:BROKER_FIXTURE_USERS_FILE = '.secrets/fixture-users.json'
pnpm portal
```

In the trusted service terminal, before `pnpm start`:

```powershell
$env:BROKER_ENABLE_FIXTURE = '1'
$env:BROKER_FIXTURE_ORIGIN = 'http://127.0.0.1:4313'
pnpm start
```

Open `.secrets/fixture-users.json` privately. Enroll its username, password, and TOTP secret using **Accounts** in Broker. Test the connection, register an agent and grant read-invoices permission for 2026-01-01 through 2026-12-31. Agent expiration must cover grant expiration. Save the agent's one-time credential privately, then run the MCP example.

The fixture-init command refuses to overwrite an existing fixture user file. Reuse the existing file or deliberately back it up and remove it before generating another. Never put real credentials in the fixture portal.

## Linux native

Use Node 24 LTS and the same pnpm commands. Install browser system dependencies with `pnpm exec playwright install --with-deps chromium`. Run as a dedicated unprivileged OS user with working Chromium sandbox support. Run `chmod 700 .secrets data` and `chmod 600 .secrets/*`. Linux native runtime is not claimed verified until it appears as passed in the platform matrix.

## Docker Compose

`compose.yaml` defines separate trusted and gateway containers on a private internal network, no Docker socket, read-only root filesystems, dropped capabilities and resource limits. A pinned Caddy 2.11.4 ingress publishes only loopback ports and forwards the two fixed services. Ingress is trusted because owner credentials pass through it; it has no vault volume or internal credential. The gateway has only the internal-channel secret; the vault volume and setup secret are exclusive to the trusted service. No real external adapter is installed, so the trusted service network has no Internet route. The ingress alone joins an ordinary bridge network so Docker can publish loopback ports.

```sh
node scripts/init.mjs
docker compose config --quiet
docker compose up --build -d
docker compose ps
docker compose down
```

Do not use `down --volumes` unless deliberately deleting the vault. Named volumes survive normal shutdown. Ensure mounted secret files are readable by container user UID 1000 without making them readable to untrusted host users. Compose file secrets are bind mounts, not a hardware or hosted secret manager.

For fixtures, first run `node scripts/fixture-init.mjs`, then:

```sh
docker compose -f compose.yaml -f compose.fixture.yaml up --build -d
```

Chromium runs with its Linux sandbox enabled. The included seccomp profile explicitly permits its namespace sandbox to call `chroot` while the outer container retains no capabilities. See deploy/NOTICE.md for the upstream source and precise modification. Caddy's image removes its unnecessary low port file capability so it can execute with all capabilities dropped. A host that disallows unprivileged user namespaces may prevent Chromium from starting. Fix the host's supported sandbox configuration; do not add `--no-sandbox`, privileged mode, a Docker socket or broad capabilities to make tests pass. Check the platform matrix for actual container verification status.

## Private remote HTTPS

Keep service ports bound to loopback and place an owner-managed HTTPS reverse proxy on the same host, reached over a private network/VPN. Configure a valid certificate, preserve Host, disable request/response body logging, restrict client access, and do not expose internal port 4312. Set `BROKER_OWNER_ORIGIN=https://broker.your-private-domain.example` and restart. Set gateway `BROKER_GATEWAY_HOST=broker-agent.your-private-domain.example` and configure MCP `BROKER_GATEWAY_URL=https://broker-agent.your-private-domain.example`. Forward gateway traffic only to port 4311. Owner cookies become Secure when the configured origin is HTTPS. Do not enable a wildcard origin, use a self-signed warning bypass, or disable TLS verification. This topology needs environment-specific verification before use; no private DNS name or certificate is provisioned by this repository.
