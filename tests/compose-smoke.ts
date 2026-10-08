// Run only against a fresh disposable `broker-verification` Compose project.
// This never prints setup tokens, owner/vault passwords or agent credentials.
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { token } from "../src/core/crypto.js";
const origin = "http://127.0.0.1:4310";
const project =
  process.env.BROKER_SMOKE_COMPOSE_PROJECT ?? "broker-verification";
if (!/^broker-(verification|v1-\d{8}(?:-recovery|-final)?)$/.test(project))
  throw Error("Restart check requires a named disposable verification project");
for (let attempt = 0; ; attempt++) {
  try {
    const health = await fetch(origin + "/health", {
      signal: AbortSignal.timeout(2000),
    });
    if (health.ok) break;
  } catch {
    /* Await Compose health dependencies before owner setup. */
  }
  if (attempt >= 59) throw Error("Compose ingress did not become healthy");
  await delay(1000);
}
let cookie = "",
  csrf = "";
async function owner(path: string, body?: unknown) {
  const r = await fetch(origin + "/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin,
      host: "127.0.0.1:4310",
      "Content-Type": "application/json",
      "X-Broker-Client": "owner",
      "X-CSRF-Token": csrf,
      cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await r.json()) as Record<string, unknown>;
  if (!r.ok) throw Error("Owner endpoint " + path + ": " + String(data.code));
  if (r.headers.get("set-cookie"))
    cookie = r.headers.get("set-cookie")!.split(";")[0];
  if (data.csrf) csrf = String(data.csrf);
  return data;
}
if ((await owner("status")).initialized)
  throw Error("Smoke test requires a fresh disposable data volume");
const password = token(),
  passphrase = token();
await owner("setup", {
  setup_token: readFileSync(".secrets/setup", "utf8").trim(),
  password,
  passphrase,
});
await owner("login", { password });
await owner("vault/unlock", { passphrase });
const [fixture] = JSON.parse(
  readFileSync(".secrets/fixture-users.json", "utf8"),
) as {
  username: string;
  password: string;
  totp: { secret: string; period: number };
}[];
const account = await owner("accounts", {
  label: "Compose synthetic account",
  adapter: "test-portal",
  username: fixture.username,
  password: fixture.password,
  totp: fixture.totp.secret,
});
await owner(`accounts/${account.id}/verify`, {});
const agent = await owner("agents", {
  label: "Compose MCP client",
  expires: Date.now() + 3600000,
});
const config = {
  agent_id: (agent.agent as { id: string }).id,
  account_id: account.id,
  adapter: "test-portal",
  operation: "read_invoices",
  starts: Date.now() - 1000,
  expires: Date.now() + 1800000,
  max_session_seconds: 60,
  rate: 60,
  concurrency: 1,
  approval_required: true,
  from: "2026-01-01",
  to: "2026-12-31",
};
const grant = await owner("grants", config);
const root = mkdtempSync(resolve(tmpdir(), "broker-compose-")),
  file = resolve(root, "agent");
writeFileSync(file, String(agent.credential), { mode: 0o600 });
const client = new Client({ name: "compose-verification", version: "1.0.0" });
try {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [resolve("dist/mcp/bridge.js")],
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            (v): v is [string, string] => v[1] !== undefined,
          ),
        ),
        BROKER_AGENT_CREDENTIAL_FILE: file,
        BROKER_GATEWAY_URL: "http://127.0.0.1:4311",
      },
      stderr: "pipe",
    }),
  );
  async function call(name: string, args: Record<string, unknown>) {
    const r = await client.callTool({ name, arguments: args });
    if (r.isError)
      throw Error("MCP error: " + JSON.stringify(r.structuredContent));
    return (r.structuredContent as { result: Record<string, unknown> }).result;
  }
  let request = await call("broker.request_session", {
    account_id: account.id,
    requested_operation: "read_invoices",
    reason: "Disposable Compose verification",
    idempotency_key: randomUUID(),
  });
  if (request.status !== "pending_approval")
    throw Error("Session must wait for owner approval");
  await owner(`approvals/${request.request_id}`, { approve: false });
  const denied = await call("broker.get_request", {
    request_id: request.request_id,
  });
  if (denied.status !== "denied") throw Error("Owner denial was not enforced");
  request = await call("broker.request_session", {
    account_id: account.id,
    requested_operation: "read_invoices",
    reason: "Disposable Compose verification after denied request",
    idempotency_key: randomUUID(),
  });
  if (request.status !== "pending_approval")
    throw Error("New request must require its own approval");
  await owner(`approvals/${request.request_id}`, { approve: true });
  request = await call("broker.get_request", {
    request_id: request.request_id,
  });
  for (let i = 0; i < 120 && request.status === "authenticating"; i++) {
    await delay(500);
    request = await call("broker.get_request", {
      request_id: request.request_id,
    });
  }
  if (request.status !== "ready")
    throw Error("Session failed: " + String(request.code));
  const result = await call("broker.read_invoices", {
    session_id: request.session_id,
    from: "2026-01-01",
    to: "2026-12-31",
  });
  if ((result.invoices as unknown[]).length !== 2)
    throw Error("Fixture invoice count mismatch");
  await call("broker.close_session", { session_id: request.session_id });
  const expiry = Date.now() + 5000;
  const expiringAgent = await owner("agents", {
    label: "Compose expiry check",
    expires: expiry,
  });
  const expiryFile = resolve(root, "expiring-agent");
  writeFileSync(expiryFile, String(expiringAgent.credential), { mode: 0o600 });
  const expiryClient = new Client({ name: "compose-expiry", version: "1.0.0" });
  try {
    await expiryClient.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [resolve("dist/mcp/bridge.js")],
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              (entry): entry is [string, string] => entry[1] !== undefined,
            ),
          ),
          BROKER_AGENT_CREDENTIAL_FILE: expiryFile,
          BROKER_GATEWAY_URL: "http://127.0.0.1:4311",
        },
        stderr: "pipe",
      }),
    );
    if (
      (
        await expiryClient.callTool({
          name: "broker.list_accounts",
          arguments: {},
        })
      ).isError
    )
      throw Error("Fresh short-lived agent was rejected before expiry");
    await delay(Math.max(0, expiry - Date.now() + 200));
    const expired = await expiryClient.callTool({
      name: "broker.list_accounts",
      arguments: {},
    });
    if (
      !expired.isError ||
      (expired.structuredContent as { code?: string })?.code !== "invalid_agent"
    )
      throw Error("Actual agent expiration was not enforced");
  } finally {
    await expiryClient.close();
  }
  const backup = await owner("vault/backup", {});
  await owner("revoke", {
    kind: "grant",
    id: grant.id,
    confirmation: "REVOKE",
  });
  const rejected = await client.callTool({
    name: "broker.request_session",
    arguments: {
      account_id: account.id,
      requested_operation: "read_invoices",
      reason: "Must fail after revocation",
      idempotency_key: randomUUID(),
    },
  });
  if (
    !rejected.isError ||
    (rejected.structuredContent as { code?: string })?.code !==
      "permission_denied"
  )
    throw Error("Revocation did not deny the next session request");
  await owner("vault/restore", { backup, passphrase, confirmation: "RESTORE" });
  cookie = "";
  csrf = "";
  await owner("login", { password });
  const state = await owner("state");
  if ((state.vault as { unlocked: boolean }).unlocked)
    throw Error("Restore must lock vault");
  if (!(state.agents as { revoked: boolean }[]).every((a) => a.revoked))
    throw Error("Restore must revoke agents");
  execFileSync(
    "docker",
    [
      "compose",
      "-p",
      project,
      "-f",
      "compose.yaml",
      "-f",
      "compose.fixture.yaml",
      "restart",
      "trusted",
      "gateway",
    ],
    { stdio: "pipe", windowsHide: true },
  );
  for (let attempt = 0; ; attempt++) {
    try {
      const health = await fetch(origin + "/health", {
        signal: AbortSignal.timeout(2000),
      });
      if (health.ok) break;
    } catch {
      /* Wait for the owned Compose restart. */
    }
    if (attempt >= 59)
      throw Error("Restarted Compose owner did not become healthy");
    await delay(1000);
  }
  cookie = "";
  csrf = "";
  await owner("login", { password });
  const restarted = await owner("state");
  if (
    (restarted.vault as { unlocked: boolean }).unlocked ||
    (restarted.accounts as unknown[]).length !== 1 ||
    !(restarted.agents as { revoked: boolean }[]).every((a) => a.revoked)
  )
    throw Error(
      "Restart did not preserve locked restored state and revoked authority",
    );
  await owner("vault/unlock", { passphrase });
  // The portal still retains replay state across a Broker-only restart.
  // Await an actual new code period; never reuse or weaken its replay rule.
  await delay(fixture.totp.period * 1000 + 200);
  await owner(`accounts/${account.id}/verify`, {});
  await owner("vault/lock", {});
  process.stdout.write(
    "PASS: Compose owner setup, private enrollment, exact approval and denial, sandboxed browser login, real MCP invoice read, session close, actual agent expiry, blocked access after revocation, encrypted backup/restore, graceful restart with retained volume, locked startup and restored-account re-verification.\n",
  );
} finally {
  await client.close();
  rmSync(root, { recursive: true, force: true });
}
