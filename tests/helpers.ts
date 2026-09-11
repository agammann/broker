import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Broker } from "../src/core/broker.js";
import { DB } from "../src/core/db.js";
import type { Adapter, LoginSession } from "../src/adapters/test-portal.js";
export const fixture = {
  label: "Synthetic account",
  adapter: "test-portal" as const,
  username: "fixture-user",
  password: "fixture-password-only",
  totp: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
};
export const ownerPassword = "test-only-owner-password",
  passphrase = "test-only-vault-passphrase";
export class FakeAdapter implements Adapter {
  id = "test-portal";
  version = "fixture";
  closed = 0;
  loginWait?: () => Promise<void>;
  readWait?: () => Promise<void>;
  async connect(_c: unknown, signal: AbortSignal): Promise<LoginSession> {
    await this.loginWait?.();
    signal.throwIfAborted();
    return {
      read: async () => {
        await this.readWait?.();
        return {
          invoices: [
            {
              invoice_id: "UNIT-1",
              date: "2026-01-15",
              amount: "10.00",
              currency: "USD",
              status: "paid",
            },
          ],
          has_more: false,
          data_trust: "untrusted",
        };
      },
      close: async () => {
        this.closed++;
        return true;
      },
    };
  }
}
export async function setup(
  approval = false,
  adapter: Adapter = new FakeAdapter(),
  db = new DB(":memory:"),
) {
  const b = new Broker(db, new Map([["test-portal", adapter]]));
  await b.initialize(ownerPassword, passphrase);
  await b.vault.unlock(passphrase);
  const account = await b.enroll(fixture);
  await b.verifyAccount(account.id);
  const agent = b.registerAgent({
      label: "Test agent",
      expires: Date.now() + 86400000,
    }),
    other = b.registerAgent({
      label: "Other agent",
      expires: Date.now() + 86400000,
    });
  const config = {
    agent_id: agent.agent.id,
    account_id: account.id,
    adapter: "test-portal",
    operation: "read_invoices",
    starts: Date.now() - 1000,
    expires: Date.now() + 3600000,
    max_session_seconds: 60,
    rate: 20,
    concurrency: 2,
    approval_required: approval,
    from: "2026-01-01",
    to: "2026-12-31",
  };
  const grant = await b.putGrant(config);
  return { b, account, agent, other, grant, config, adapter };
}
export const req = (account_id: string) => ({
  account_id,
  requested_operation: "read_invoices",
  reason: "Synthetic verification",
  idempotency_key: randomUUID(),
});
export async function ready(b: Broker, credential: string, request_id: string) {
  for (let i = 0; i < 650; i++) {
    const r = (await b.tool(credential, "broker.get_request", {
      request_id,
    })) as { status: string; session_id: string; code?: string };
    if (!["authenticating", "pending_approval"].includes(r.status)) return r;
    await delay(100);
  }
  throw Error("Request did not settle");
}
export const invoiceQuery = (session_id: string) => ({
  session_id,
  from: "2026-01-01",
  to: "2026-12-31",
  page: 1,
  page_size: 25,
});
