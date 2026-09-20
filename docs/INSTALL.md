# Installation

[Documentation index](README.md) · [Troubleshooting](TROUBLESHOOTING.md)

Choose Windows native for development or Docker Compose for container separation. The public website is an introduction and browser simulation, not your private owner dashboard.

## Before you start

Install Git, Node **24.19.0 or newer within 24.x**, and pnpm **11.19.0**. Check `node --version` and `pnpm --version`. If pnpm is missing, install the pinned version with `npm install --global pnpm@11.19.0`.

```powershell
git clone https://github.com/agammann/broker.git
cd broker
```

Run all commands from this repository directory, including commands in additional terminals. PowerShell `$env:` settings apply only to that terminal and its child processes. `.env.example` documents settings; native startup does not automatically load `.env`.

## Windows first run

Requirements: supported Node 24 LTS, pnpm 11.19.0, about 2 GB free disk space, and at least 2 GB available RAM for Chromium and scrypt. Host time must be synchronized using the OS time service. Never share this OS account with an untrusted agent.

### 1. Install and initialize

```powershell
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
pnpm run init
```

Initialization creates `data/` and private setup/internal files under `.secrets/`. It does not create an owner password or vault passphrase and does not overwrite existing initialization files.

Restrict the directories before starting:

```powershell
$brokerPrincipal = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls .secrets /inheritance:r /grant:r "${brokerPrincipal}:(OI)(CI)F"
icacls data /inheritance:r /grant:r "${brokerPrincipal}:(OI)(CI)F"
```

On reused directories, inspect existing explicit permissions with `icacls .secrets` and `icacls data`. These commands remove inherited permissions but do not remove other users' explicit entries.

### 2. Start the trusted service

In terminal A, leave this command running:

```powershell
pnpm start
```

Open the dashboard at `http://127.0.0.1:4310`. Read `.secrets/setup` in your own private editor. Enter that token, a new owner password, and a distinct vault passphrase in the setup form. The token cannot initialize the service again once setup is complete. Owner sessions expire after one hour. New login invalidates prior owner sessions. Vault unlock is separate and lasts 15 minutes by default; change this in settings.

### 3. Start the gateway

In terminal B, from the same repository directory:

```powershell
pnpm gateway
```

Both public listeners default to loopback; the authenticated internal listener uses loopback port 4312. No browser debugging port is opened. The gateway should be a separate OS identity or container for a real deployment. A native launch under a single OS account is a development/convenience topology, not filesystem isolation.

Expected results: the owner dashboard shows setup on first run, and `http://127.0.0.1:4310/health` and `http://127.0.0.1:4311/health` return successful status responses. An empty account list and no adapter in default mode are expected. Unlock the vault before enrolling an account.

To stop, press Ctrl+C in gateway and trusted-service terminals. Shutdown locks the vault, stops tasks and closes contexts. Restart requires owner login and vault unlock. If a process is killed abruptly, restart marks old requests stopped; no browser sessions are restored.

## Try the bundled test portal

Fixture mode is opt-in and uses two fixed synthetic invoices from January and February 2026. It never proves real portal compatibility. Complete native installation and the build first. In terminal C:

```powershell
node scripts/fixture-init.mjs
$env:BROKER_FIXTURE_USERS_FILE = '.secrets/fixture-users.json'
pnpm portal
```

Keep the portal and gateway running. Stop terminal A with Ctrl+C, then restart the trusted service with:

```powershell
$env:BROKER_ENABLE_FIXTURE = '1'
$env:BROKER_FIXTURE_ORIGIN = 'http://127.0.0.1:4313'
pnpm start
```

1. Sign in again and unlock the vault after restart.
2. Open `.secrets/fixture-users.json` privately. In **Accounts**, select the installed test portal adapter and enter a label, `username`, `password`, and `totp.secret` from that file. Keep the generated default TOTP settings.
3. Select **Save account privately**, then test the connection. The account should show **connected**.
4. In **Agents & grants**, register an agent and use **Download credential**. Store the file in a private location outside the repository. The agent UUID is not its credential.
5. Create a grant for that agent and account. Set **Access starts** to now or earlier and **Access expires** in the future. Agent expiration must cover grant expiration.
6. Set **Earliest invoice date** to `2026-01-01` and **Latest invoice date** to `2026-12-31`. These are invoice coverage dates, not grant start/expiry times. Leave **Session approval** at **Ask me each time** to exercise approval.
7. Run the [MCP example](MCP.md#run-without-an-ai-model), approving the exact request in **Approvals** while the client waits. Success means two synthetic records are returned and the session is closed.

Revoke the grant and run the client again to confirm it no longer has authorized access. Previously returned information cannot be recalled.

The fixture-init command refuses to overwrite an existing fixture user file. Reuse the existing file or deliberately back it up and remove it before generating another. Never put real credentials in the fixture portal.

To stop, press Ctrl+C in all three terminals and allow up to 75 seconds for cleanup. To return to default mode, clear `BROKER_ENABLE_FIXTURE` and `BROKER_FIXTURE_ORIGIN` in terminal A before restarting; closing that terminal also discards its session environment settings.

## Linux native

Use Node 24 LTS and the same pnpm commands. Install browser system dependencies with `pnpm exec playwright install --with-deps chromium`. Run as a dedicated unprivileged OS user with working Chromium sandbox support. Run `chmod 700 .secrets data` and `chmod 600 .secrets/*`. Linux native runtime is not claimed verified until it appears as passed in the platform matrix.

## Docker Compose

Use Docker with Linux containers and Compose available. Start from the cloned repository with Node available on the host. Check `docker version` and `docker compose version`. Stop native services if they occupy ports 4310 or 4311.

`compose.yaml` defines separate trusted and gateway containers on a private internal network, no Docker socket, read-only root filesystems, dropped capabilities and resource limits. A pinned Caddy 2.11.4 ingress publishes only loopback ports and forwards the two fixed services. Ingress is trusted because owner credentials pass through it; it has no vault volume or internal credential. The gateway has only the internal-channel secret; the vault volume and setup secret are exclusive to the trusted service. No real external adapter is installed, so the trusted service network has no Internet route. The ingress alone joins an ordinary bridge network so Docker can publish loopback ports.

```sh
node scripts/init.mjs
docker compose config --quiet
docker compose up --build -d
docker compose ps
```

Leave the services running. When trusted and gateway are healthy, open `http://127.0.0.1:4310` and complete private owner setup with the host `.secrets/setup` file. Container data is stored in the named vault volume, separately from native `data/`.

Do not use `down --volumes` unless deliberately deleting the vault. Named volumes survive normal shutdown. Ensure mounted secret files are readable by container user UID 1000 without making them readable to untrusted host users. Compose file secrets are bind mounts, not a hardware or hosted secret manager.

For fixtures, the generator imports a project dependency. Run `pnpm install --frozen-lockfile` on the host first, then `node scripts/fixture-init.mjs` if the fixture file does not already exist:

```sh
docker compose -f compose.yaml -f compose.fixture.yaml up --build -d
docker compose -f compose.yaml -f compose.fixture.yaml ps
```

Do not also run `pnpm portal`: Compose runs its own portal on the private network. Enroll the host file's synthetic credentials and create the agent/grant using the walkthrough above. To run the MCP example on the host, run `pnpm build` first and use gateway `http://127.0.0.1:4311`.

When finished, stop the default stack with `docker compose down`. For fixture mode, include both files so the portal stops too:

```sh
docker compose -f compose.yaml -f compose.fixture.yaml down
```

After stopping the fixture stack, starting only `compose.yaml` returns to default mode. Normal shutdown preserves the vault volume.

Chromium runs with its Linux sandbox enabled. The included seccomp profile explicitly permits its namespace sandbox to call `chroot` while the outer container retains no capabilities. See deploy/NOTICE.md for the upstream source and precise modification. Caddy's image removes its unnecessary low port file capability so it can execute with all capabilities dropped. A host that disallows unprivileged user namespaces may prevent Chromium from starting. Fix the host's supported sandbox configuration; do not add `--no-sandbox`, privileged mode, a Docker socket or broad capabilities to make tests pass. Check the platform matrix for actual container verification status.

## Private remote HTTPS

Keep service ports bound to loopback and place an owner-managed HTTPS reverse proxy on the same host, reached over a private network/VPN. Configure a valid certificate, preserve Host, disable request/response body logging, restrict client access, and do not expose internal port 4312. Set `BROKER_OWNER_ORIGIN=https://broker.your-private-domain.example` and restart. Set gateway `BROKER_GATEWAY_HOST=broker-agent.your-private-domain.example` and configure MCP `BROKER_GATEWAY_URL=https://broker-agent.your-private-domain.example`. Forward gateway traffic only to port 4311. Owner cookies become Secure when the configured origin is HTTPS. Do not enable a wildcard origin, use a self-signed warning bypass, or disable TLS verification. This topology needs environment-specific verification before use; no private DNS name or certificate is provisioned by this repository.
