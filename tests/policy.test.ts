import { it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { DB } from "../src/core/db.js";
import { Broker } from "../src/core/broker.js";
import {
  setup,
  req,
  ready,
  invoiceQuery,
  FakeAdapter,
  passphrase,
  fixture,
} from "./helpers.js";
let current: Broker | undefined;
it("reserves the final global session slot while authentication is pending", async () => {
  const adapter = new FakeAdapter();
  const { b, agent, account, config } = await context(false, adapter);
  const accounts = [account];
  for (let i = 0; i < 4; i++) {
    const a = await b.enroll({ ...fixture, label: `Capacity ${i}` });
    await b.verifyAccount(a.id);
    await b.putGrant({ ...config, account_id: a.id, concurrency: 3 });
    accounts.push(a);
  }
  for (let i = 0; i < 11; i++) {
    const a = accounts[i < 2 ? 0 : 1 + Math.floor((i - 2) / 3)];
    const r = (await b.tool(
      agent.credential,
      "broker.request_session",
      req(a.id),
    )) as { request_id: string };
    expect((await ready(b, agent.credential, r.request_id)).status).toBe(
      "ready",
    );
  }
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  adapter.loginWait = () => gate;
  try {
    await b.tool(
      agent.credential,
      "broker.request_session",
      req(accounts[4].id),
    );
    await expect(
      b.tool(agent.credential, "broker.request_session", req(accounts[4].id)),
    ).rejects.toThrow("busy");
  } finally {
    release();
    await Promise.allSettled([...b.jobs.values()].map((j) => j.promise));
  }
  expect(b.sessions.size).toBe(12);
});
afterEach(async () => {
  await current?.shutdown();
  current = undefined;
});
async function context(approval = false, adapter = new FakeAdapter()) {
  const c = await setup(approval, adapter);
  current = c.b;
  return c;
}
it("denies impersonation, unknown fields, operations and cross-agent requests/sessions", async () => {
  const { b, account, agent, other } = await context();
  await expect(
    b.tool(agent.agent.id, "broker.list_accounts", {}),
  ).rejects.toThrow("invalid_agent");
  await expect(
    b.tool(agent.credential, "broker.list_accounts", {
      agent_id: other.agent.id,
    }),
  ).rejects.toThrow();
  expect(await b.tool(other.credential, "broker.list_accounts", {})).toEqual({
    accounts: [],
  });
  await expect(
    b.tool(other.credential, "broker.request_session", req(account.id)),
  ).rejects.toThrow("permission_denied");
  const r = (await b.tool(
    agent.credential,
    "broker.request_session",
    req(account.id),
  )) as { request_id: string };
  const s = await ready(b, agent.credential, r.request_id);
  expect(s.status).toBe("ready");
  await expect(
    b.tool(other.credential, "broker.get_request", {
      request_id: r.request_id,
    }),
  ).rejects.toThrow("not_found");
  await expect(
    b.tool(other.credential, "broker.get_session", {
      session_id: s.session_id,
    }),
  ).rejects.toThrow("not_found");
  await expect(
    b.tool(
      other.credential,
      "broker.read_invoices",
      invoiceQuery(s.session_id),
    ),
  ).rejects.toThrow("not_found");
  await expect(
    b.tool(agent.credential, "broker.request_session", {
      ...req(account.id),
      requested_operation: "delete_invoice",
    }),
  ).rejects.toThrow();
});
it("binds idempotency to identity and exact content under concurrent requests", async () => {
  const { b, account, agent } = await context();
  const p = req(account.id);
  const [a, c] = (await Promise.all([
    b.tool(agent.credential, "broker.request_session", p),
    b.tool(agent.credential, "broker.request_session", p),
  ])) as { request_id: string }[];
  expect(a.request_id).toBe(c.request_id);
  expect(b.db.all("SELECT id FROM requests")).toHaveLength(1);
  await expect(
    b.tool(agent.credential, "broker.request_session", {
      ...p,
      reason: "different",
    }),
  ).rejects.toThrow("idempotency_conflict");
});
it("consumes exact approvals once and denies replay", async () => {
  const { b, agent, account } = await context(true);
  const r = (await b.tool(
    agent.credential,
    "broker.request_session",
    req(account.id),
  )) as { request_id: string; status: string };
  expect(r.status).toBe("pending_approval");
  const results = await Promise.allSettled([
    b.approve(r.request_id, true),
    b.approve(r.request_id, true),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await ready(b, agent.credential, r.request_id)).status).toBe("ready");
});
it("rejects expired approvals and closes sessions on expiration", async () => {
  const { b, agent, account } = await context(true);
  const r = (await b.tool(
    agent.credential,
    "broker.request_session",
    req(account.id),
  )) as { request_id: string };
  b.db.run(
    "UPDATE requests SET deadline=? WHERE id=?",
    Date.now() - 1,
    r.request_id,
  );
  await expect(b.approve(r.request_id, true)).rejects.toThrow(
    "approval_expired_or_consumed",
  );
  await b.cleanup();
  expect(
    (
      (await b.tool(agent.credential, "broker.get_request", {
        request_id: r.request_id,
      })) as { status: string }
    ).status,
  ).toBe("expired");
});
it("policy changes invalidate pending approval and active work", async () => {
  const { b, agent, account, grant, config } = await context(true);
  const r = (await b.tool(
    agent.credential,
    "broker.request_session",
    req(account.id),
  )) as { request_id: string };
  await b.putGrant({ ...config, rate: 5 }, grant.id);
  await expect(b.approve(r.request_id, true)).rejects.toThrow(
    "approval_expired_or_consumed",
  );
  expect(
    (
      (await b.tool(agent.credential, "broker.get_request", {
        request_id: r.request_id,
      })) as { status: string }
    ).status,
  ).toBe("revoked");
});
it("suppresses data if revoked during invoice retrieval", async () => {
  let resume!: () => void;
  const adapter = new FakeAdapter(),
    c = await context(false, adapter);
  const r = (await c.b.tool(
    c.agent.credential,
    "broker.request_session",
    req(c.account.id),
  )) as { request_id: string };
  const s = await ready(c.b, c.agent.credential, r.request_id);
  adapter.readWait = () =>
    new Promise<void>((r) => {
      resume = r;
    });
  const read = c.b.tool(
    c.agent.credential,
    "broker.read_invoices",
    invoiceQuery(s.session_id),
  );
  const assertion = expect(read).rejects.toThrow();
  await c.b.invalidate("grant", c.grant.id);
  resume();
  await assertion;
  expect(c.b.sessions.size).toBe(0);
  expect(
    c.b.db.all("SELECT * FROM audit WHERE event='operation_completed'"),
  ).toHaveLength(0);
});
it("cancels authentication on revocation before returning a session", async () => {
  let resume!: () => void;
  const adapter = new FakeAdapter(),
    { b, agent, account } = await context(false, adapter);
  adapter.loginWait = () =>
    new Promise<void>((r) => {
      resume = r;
    });
  const r = (await b.tool(
    agent.credential,
    "broker.request_session",
    req(account.id),
  )) as { request_id: string };
  await b.invalidate("account", account.id);
  resume();
  await Promise.allSettled([...b.jobs.values()].map((j) => j.promise));
  expect(b.sessions.size).toBe(0);
  expect(
    (
      (await b.tool(agent.credential, "broker.get_request", {
        request_id: r.request_id,
      })) as { status: string }
    ).status,
  ).toBe("revoked");
});
it("locks, cancels pending approvals, denies reads and discards sessions", async () => {
  const { b, account, agent } = await context();
  const r = (await b.tool(
    agent.credential,
    "broker.request_session",
    req(account.id),
  )) as { request_id: string };
  const s = await ready(b, agent.credential, r.request_id);
  await b.vault.lock();
  expect(b.sessions.size).toBe(0);
  await expect(
    b.tool(
      agent.credential,
      "broker.read_invoices",
      invoiceQuery(s.session_id),
    ),
  ).rejects.toThrow();
  await expect(
    b.tool(agent.credential, "broker.request_session", req(account.id)),
  ).rejects.toThrow("vault_locked");
});
it("restricts invoice dates, rate, concurrency, and credential rotation", async () => {
  const { b, account, agent, grant, config } = await context();
  await b.putGrant({ ...config, concurrency: 1, rate: 2 }, grant.id);
  const r = (await b.tool(
    agent.credential,
    "broker.request_session",
    req(account.id),
  )) as { request_id: string };
  const s = await ready(b, agent.credential, r.request_id);
  await expect(
    b.tool(agent.credential, "broker.request_session", req(account.id)),
  ).rejects.toThrow("concurrency_limited");
  await expect(
    b.tool(agent.credential, "broker.read_invoices", {
      ...invoiceQuery(s.session_id),
      from: "2025-12-31",
      to: "2026-01-01",
    }),
  ).rejects.toThrow("parameters_denied");
  await b.tool(
    agent.credential,
    "broker.read_invoices",
    invoiceQuery(s.session_id),
  );
  await b.tool(
    agent.credential,
    "broker.read_invoices",
    invoiceQuery(s.session_id),
  );
  await expect(
    b.tool(
      agent.credential,
      "broker.read_invoices",
      invoiceQuery(s.session_id),
    ),
  ).rejects.toThrow("rate_limited");
  const rotated = await b.rotateAgent(agent.agent.id);
  await expect(
    b.tool(agent.credential, "broker.list_accounts", {}),
  ).rejects.toThrow("invalid_agent");
  expect(
    await b.tool(rotated.credential, "broker.list_accounts", {}),
  ).toHaveProperty("accounts");
  expect(b.sessions.size).toBe(0);
});
it("validates backup integrity before replacement and restores locked with revoked agents", async () => {
  const { b, agent, account } = await context();
  const backup = b.vault.backup();
  expect(JSON.stringify(backup)).not.toContain(fixture.password);
  await expect(
    b.restore(
      { ...backup, payload: { ...backup.payload, data: "AAAA" } },
      passphrase,
    ),
  ).rejects.toThrow();
  expect(b.snapshot().accounts).toHaveLength(1);
  await b.restore(backup, passphrase);
  expect(b.vault.unlocked).toBe(false);
  await expect(
    b.tool(agent.credential, "broker.list_accounts", {}),
  ).rejects.toThrow("invalid_agent");
  expect(b.snapshot().accounts[0].state).toBe("unverified");
  await b.vault.unlock(passphrase);
  expect(
    b.vault.decrypt(
      account.id,
      b.db.get<{ secret: string }>(
        "SELECT secret FROM accounts WHERE id=?",
        account.id,
      )!.secret,
    ).username,
  ).toBe(fixture.username);
});
it("restarts locked, migrates fresh files and terminates stale requests", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "broker-restart-"));
  try {
    const c = await setup(
      true,
      new FakeAdapter(),
      new DB(resolve(root, "test.db")),
    );
    await c.b.tool(
      c.agent.credential,
      "broker.request_session",
      req(c.account.id),
    );
    await c.b.shutdown();
    const b = new Broker(new DB(resolve(root, "test.db")), new Map());
    expect(b.vault.unlocked).toBe(false);
    expect(
      b.db.get<{ status: string }>("SELECT status FROM requests")!.status,
    ).toBe("revoked");
    await b.shutdown();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it("enforces actual session and agent expiry before cleanup and automatically locks", async () => {
  const { b, account, agent } = await context();
  const r = (await b.tool(
    agent.credential,
    "broker.request_session",
    req(account.id),
  )) as { request_id: string };
  const readySession = await ready(b, agent.credential, r.request_id);
  b.sessions.get(readySession.session_id)!.expires = Date.now() - 1;
  await expect(
    b.tool(
      agent.credential,
      "broker.read_invoices",
      invoiceQuery(readySession.session_id),
    ),
  ).rejects.toThrow("session_expired");
  await b.cleanup();
  expect(b.sessions.size).toBe(0);
  b.db.run(
    "UPDATE agents SET expires=? WHERE id=?",
    Date.now() - 1,
    agent.agent.id,
  );
  await expect(
    b.tool(agent.credential, "broker.list_accounts", {}),
  ).rejects.toThrow("invalid_agent");
  b.vault.deadline = Date.now() - 1;
  await b.cleanup();
  expect(b.vault.unlocked).toBe(false);
  expect(b.vault.deadline).toBe(0);
});
it("rejects invalid enrollment without writing an account", async () => {
  const { b } = await context();
  for (const changes of [
    { totp: "not-a-secret" },
    { username: "" },
    { adapter: "arbitrary-website" },
    { url: "https://evil.test" },
  ])
    await expect(b.enroll({ ...fixture, ...changes })).rejects.toThrow();
  expect(b.snapshot().accounts).toHaveLength(1);
});
