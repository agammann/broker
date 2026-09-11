import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const client = new Client({ name: "broker-example", version: "1.0.0" });
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    (v): v is [string, string] => v[1] !== undefined,
  ),
);
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [resolve("dist/mcp/bridge.js")],
    env,
    stderr: "inherit",
  }),
);
async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError)
    throw new Error(JSON.stringify(result.structuredContent ?? result.content));
  return (result.structuredContent as { result: Record<string, unknown> })
    .result;
}
try {
  const accounts = await call("broker.list_accounts", {});
  process.stdout.write(JSON.stringify(accounts) + "\n");
  const account_id = process.env.BROKER_ACCOUNT_ID;
  if (account_id) {
    let request = await call("broker.request_session", {
      account_id,
      requested_operation: "read_invoices",
      reason: "Retrieve invoice records using the model-free MCP example",
      idempotency_key: randomUUID(),
    });
    const deadline = Date.now() + 300000;
    while (
      ["authenticating", "pending_approval"].includes(String(request.status)) &&
      Date.now() < deadline
    ) {
      await delay(1000);
      request = await call("broker.get_request", {
        request_id: request.request_id,
      });
    }
    if (request.status !== "ready")
      throw new Error("Request stopped: " + JSON.stringify(request));
    try {
      const invoices = await call("broker.read_invoices", {
        session_id: request.session_id,
        from: process.env.BROKER_FROM ?? "2026-01-01",
        to: process.env.BROKER_TO ?? "2026-12-31",
        page: 1,
        page_size: 25,
      });
      process.stdout.write(JSON.stringify(invoices, null, 2) + "\n");
    } finally {
      await call("broker.close_session", { session_id: request.session_id });
    }
  }
} finally {
  await client.close();
}
