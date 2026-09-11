import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createPortal } from "../src/fixtures/portal.js";
import { TestPortalAdapter } from "../src/adapters/test-portal.js";
import { internalServer } from "../src/server/http.js";
import { gateway } from "../src/server/gateway.js";
import { parseTotp, codeAt } from "../src/core/totp.js";
import { token } from "../src/core/crypto.js";
import { setup, fixture } from "./helpers.js";
it("real stdio MCP client authenticates through gateway, Chromium, password + TOTP and retrieves only authorized invoice fields", async () => {
  const portal = await createPortal([
    {
      username: fixture.username,
      password: fixture.password,
      totp: parseTotp(fixture.totp),
    },
  ]);
  await portal.listen({ host: "127.0.0.1", port: 0 });
  const adapter = new TestPortalAdapter(portal.listeningOrigin);
  const { b, agent, account } = await setup(false, adapter);
  const key = token(),
    internal = await internalServer(b, key);
  await internal.listen({ host: "127.0.0.1", port: 0 });
  const gw = await gateway({
    key,
    internalUrl: internal.listeningOrigin,
    host: "127.0.0.1:14311",
  });
  await gw.listen({ host: "127.0.0.1", port: 14311 });
  const dir = mkdtempSync(resolve("../../work/mcp-")),
    file = resolve(dir, "agent");
  writeFileSync(file, agent.credential, { mode: 0o600 });
  const client = new Client({
    name: "broker-regression-client",
    version: "1.0.0",
  });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ["--import", "tsx", "src/mcp/bridge.ts"],
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              (v): v is [string, string] => v[1] !== undefined,
            ),
          ),
          BROKER_AGENT_CREDENTIAL_FILE: file,
          BROKER_GATEWAY_URL: "http://127.0.0.1:14311",
        },
        stderr: "pipe",
      }),
    );
    const listed = await client.listTools();
    expect(listed.tools.map((t) => t.name).sort()).toEqual([
      "broker.close_session",
      "broker.get_request",
      "broker.get_session",
      "broker.list_accounts",
      "broker.read_invoices",
      "broker.request_session",
    ]);
    async function call(name: string, args: Record<string, unknown>) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError, JSON.stringify(result.structuredContent)).not.toBe(
        true,
      );
      return (result.structuredContent as { result: Record<string, unknown> })
        .result;
    }
    expect((await call("broker.list_accounts", {})).accounts).toHaveLength(1);
    let r = await call("broker.request_session", {
      account_id: account.id,
      requested_operation: "read_invoices",
      reason: "MCP regression fixture only",
      idempotency_key: randomUUID(),
    });
    for (let i = 0; i < 120 && r.status === "authenticating"; i++) {
      await delay(500);
      r = await call("broker.get_request", { request_id: r.request_id });
    }
    expect(r.status, JSON.stringify(r)).toBe("ready");
    const data = await call("broker.read_invoices", {
      session_id: r.session_id,
      from: "2026-01-01",
      to: "2026-12-31",
      page: 1,
      page_size: 1,
    });
    expect(data).toMatchObject({
      has_more: true,
      data_trust: "untrusted",
      invoices: [
        {
          invoice_id: "FIXTURE-001",
          amount: "125.40",
          currency: "USD",
          status: "paid",
        },
      ],
    });
    expect(Object.keys((data.invoices as object[])[0]).sort()).toEqual([
      "amount",
      "currency",
      "date",
      "invoice_id",
      "status",
    ]);
    const second = await call("broker.read_invoices", {
      session_id: r.session_id,
      from: "2026-01-01",
      to: "2026-12-31",
      page: 2,
      page_size: 1,
    });
    expect((second.invoices as { invoice_id: string }[])[0].invoice_id).toBe(
      "FIXTURE-002",
    );
    const closed = await call("broker.close_session", {
      session_id: r.session_id,
    });
    expect(closed.remote_logout).toBe("confirmed");
    const serialized = JSON.stringify({
      data,
      audit: b.snapshot().activity,
      snapshot: b.snapshot(),
    });
    for (const secret of [
      fixture.password,
      fixture.totp,
      agent.credential,
      key,
    ])
      expect(serialized).not.toContain(secret);
  } finally {
    await client.close();
    await gw.close();
    await internal.close();
    await b.shutdown();
    await portal.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 120000);
it("test portal rejects TOTP replay within a time step", async () => {
  const t = parseTotp(fixture.totp),
    portal = await createPortal([
      { username: fixture.username, password: fixture.password, totp: t },
    ]);
  try {
    const epoch = Math.floor(Date.now() / 1000);
    if (epoch % 30 > 26) await delay((31 - (epoch % 30)) * 1000);
    const code = await codeAt(t);
    async function attempt() {
      const a = await portal.inject({
        method: "POST",
        url: "/login",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: new URLSearchParams({
          username: fixture.username,
          password: fixture.password,
        }).toString(),
      });
      const cookie = String(a.headers["set-cookie"]).split(";")[0];
      await portal.inject({
        method: "POST",
        url: "/challenge",
        headers: {
          cookie,
          "content-type": "application/x-www-form-urlencoded",
        },
        payload: "code=" + code,
      });
      return portal.inject({ url: "/invoices", headers: { cookie } });
    }
    expect((await attempt()).body).toContain('data-state="invoices"');
    expect((await attempt()).body).toContain('data-state="incorrect"');
  } finally {
    await portal.close();
  }
});
for (const [mode, expected] of [
  ["human", "human_action_required"],
  ["layout", "changed_website_layout"],
  ["identity", "identity_verification_failed"],
  ["lockout", "account_lockout"],
] as const)
  it(`handles ${mode} without exposing raw browser state`, async () => {
    const portal = await createPortal(
      [
        {
          username: fixture.username,
          password: fixture.password,
          totp: parseTotp(fixture.totp),
        },
      ],
      { mode },
    );
    await portal.listen({ host: "127.0.0.1", port: 0 });
    try {
      const adapter = new TestPortalAdapter(portal.listeningOrigin);
      await expect(
        adapter.connect(
          {
            username: fixture.username,
            password: fixture.password,
            totp: parseTotp(fixture.totp),
          },
          new AbortController().signal,
        ),
      ).rejects.toThrow(expected);
    } finally {
      await portal.close();
    }
  });
