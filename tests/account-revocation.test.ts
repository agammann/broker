import { afterEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Broker } from "../src/core/broker.js";
import { FakeAdapter, fixture, ready, req, setup } from "./helpers.js";

let current: Broker | undefined;
afterEach(async () => {
  await current?.shutdown();
  current = undefined;
});

it("requires a new owner grant after account revocation and reconnection", async () => {
  const { b, account, agent, config, grant } = await setup();
  current = b;
  const otherAccount = await b.enroll({ ...fixture, label: "Other account" });
  await b.verifyAccount(otherAccount.id);
  await b.putGrant({ ...config, account_id: otherAccount.id });
  await b.invalidate("account", account.id);
  await b.verifyAccount(account.id);
  const visible = (await b.tool(
    agent.credential,
    "broker.list_accounts",
    {},
  )) as { accounts: { id: string }[] };
  expect(visible.accounts.map((a) => a.id)).toEqual([otherAccount.id]);
  await expect(
    b.tool(agent.credential, "broker.request_session", req(account.id)),
  ).rejects.toThrow("permission_denied");
  expect(
    b.db.get<{ revoked: number }>(
      "SELECT revoked FROM grants WHERE id=?",
      grant.id,
    )?.revoked,
  ).toBe(1);
  await b.putGrant(config, grant.id);
  const request = (await b.tool(
    agent.credential,
    "broker.request_session",
    req(account.id),
  )) as { request_id: string };
  expect((await ready(b, agent.credential, request.request_id)).status).toBe(
    "ready",
  );
});

it("keeps an existing grant after ordinary credential replacement", async () => {
  const { b, account, agent } = await setup();
  current = b;
  await b.enroll({ ...fixture, password: "replacement-only" }, account.id);
  await b.verifyAccount(account.id);
  const request = (await b.tool(
    agent.credential,
    "broker.request_session",
    req(account.id),
  )) as { request_id: string };
  expect((await ready(b, agent.credential, request.request_id)).status).toBe(
    "ready",
  );
});

it.each(["verify", "replace"])(
  "retire legacy disabled-account grants on %s",
  async (action) => {
    const { b, account, agent } = await setup();
    current = b;
    // Models an account disabled by an older version, which retained grants.
    b.db.run(
      "UPDATE accounts SET state='disabled',version=version+1 WHERE id=?",
      account.id,
    );
    if (action === "replace")
      await b.enroll({ ...fixture, password: "replacement-only" }, account.id);
    await b.verifyAccount(account.id);
    await expect(
      b.tool(agent.credential, "broker.request_session", req(account.id)),
    ).rejects.toThrow("permission_denied");
  },
);

it("reuses a revoked grant without reviving old sessions or request history", async () => {
  const { b, account, agent, config, grant } = await setup();
  current = b;
  const request = (await b.tool(
    agent.credential,
    "broker.request_session",
    req(account.id),
  )) as { request_id: string };
  const session = await ready(b, agent.credential, request.request_id);
  await b.invalidate("account", account.id);
  await b.verifyAccount(account.id);
  for (let i = 0; i < 499; i++)
    b.db.run(
      "INSERT INTO grants VALUES(?,?,?,?,?,?)",
      randomUUID(),
      agent.agent.id,
      account.id,
      1,
      1,
      JSON.stringify(config),
    );
  const saved = await b.putGrant(config);
  expect(b.db.all("SELECT id FROM grants")).toHaveLength(500);
  expect(saved.version).toBeGreaterThan(1);
  expect(
    (
      (await b.tool(agent.credential, "broker.get_request", {
        request_id: request.request_id,
      })) as { status: string }
    ).status,
  ).not.toBe("ready");
  await expect(
    b.tool(agent.credential, "broker.get_session", {
      session_id: session.session_id,
    }),
  ).rejects.toThrow();
  expect(
    b.db.all("SELECT id FROM audit WHERE event='grant_saved'"),
  ).toHaveLength(2);
  const next = (await b.tool(
    agent.credential,
    "broker.request_session",
    req(account.id),
  )) as { request_id: string };
  expect((await ready(b, agent.credential, next.request_id)).status).toBe(
    "ready",
  );
  expect(
    b.db.get<{ revoked: number }>(
      "SELECT revoked FROM grants WHERE id=?",
      grant.id,
    ),
  ).toBeDefined();
});

it("does not revive a pending approval when its revoked grant is reused", async () => {
  const { b, account, agent, config } = await setup(true);
  current = b;
  const old = (await b.tool(
    agent.credential,
    "broker.request_session",
    req(account.id),
  )) as { request_id: string; status: string };
  expect(old.status).toBe("pending_approval");
  await b.invalidate("account", account.id);
  await b.verifyAccount(account.id);
  await b.putGrant(config);
  await expect(b.approve(old.request_id, true)).rejects.toThrow(
    "approval_expired_or_consumed",
  );
  expect(
    (
      (await b.tool(agent.credential, "broker.get_request", {
        request_id: old.request_id,
      })) as { status: string }
    ).status,
  ).toBe("revoked");
  const next = (await b.tool(
    agent.credential,
    "broker.request_session",
    req(account.id),
  )) as { request_id: string; status: string };
  expect(next.status).toBe("pending_approval");
  await b.approve(next.request_id, true);
  expect((await ready(b, agent.credential, next.request_id)).status).toBe(
    "ready",
  );
});

it("does not revive an in-flight authentication after revoke and regrant", async () => {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const adapter = new FakeAdapter();
  const { b, account, agent, config } = await setup(false, adapter);
  current = b;
  adapter.loginWait = () => {
    entered();
    return gate;
  };
  const old = (await b.tool(
    agent.credential,
    "broker.request_session",
    req(account.id),
  )) as { request_id: string };
  await started;
  await b.invalidate("account", account.id);
  adapter.loginWait = undefined;
  await b.verifyAccount(account.id);
  await b.putGrant(config);
  release();
  await Promise.allSettled([...b.jobs.values()].map((j) => j.promise));
  expect(
    (
      (await b.tool(agent.credential, "broker.get_request", {
        request_id: old.request_id,
      })) as { status: string }
    ).status,
  ).toBe("revoked");
  expect(b.sessions.size).toBe(0);
});

it("does not let a pending grant edit restore access after account revocation", async () => {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  class BlockingAdapter extends FakeAdapter {
    block = false;
    async connect(c: unknown, signal: AbortSignal) {
      const remote = await super.connect(c, signal);
      return {
        ...remote,
        close: async () => {
          if (this.block) {
            entered();
            await gate;
          }
          return remote.close();
        },
      };
    }
  }
  const adapter = new BlockingAdapter();
  const { b, account, agent, config, grant } = await setup(false, adapter);
  current = b;
  const request = (await b.tool(
    agent.credential,
    "broker.request_session",
    req(account.id),
  )) as { request_id: string };
  expect((await ready(b, agent.credential, request.request_id)).status).toBe(
    "ready",
  );
  adapter.block = true;
  const editing = b.putGrant({ ...config, rate: 5 }, grant.id);
  const rejected = expect(editing).rejects.toThrow();
  await started;
  await b.invalidate("account", account.id);
  adapter.block = false;
  await b.verifyAccount(account.id);
  release();
  await rejected;
  await expect(
    b.tool(agent.credential, "broker.request_session", req(account.id)),
  ).rejects.toThrow("permission_denied");
});
