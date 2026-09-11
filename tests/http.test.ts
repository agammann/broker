import { it, expect } from "vitest";
import { token } from "../src/core/crypto.js";
import { ownerServer, internalServer } from "../src/server/http.js";
import { setup, ownerPassword } from "./helpers.js";
it("separates owner, internal and agent authentication; protects CSRF/Host/Origin and cookies", async () => {
  const { b, agent } = await setup(),
    key = token();
  const owner = await ownerServer(b, {
      origin: "http://127.0.0.1:4310",
      setupToken: token(),
    }),
    internal = await internalServer(b, key);
  try {
    expect(
      (
        await owner.inject({
          url: "/api/state",
          headers: {
            host: "127.0.0.1:4310",
            authorization: "Bearer " + agent.credential,
          },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await owner.inject({
          url: "/api/status",
          headers: { host: "evil.test" },
        })
      ).statusCode,
    ).toBe(403);
    const headers = {
      host: "127.0.0.1:4310",
      origin: "http://127.0.0.1:4310",
      "x-broker-client": "owner",
    };
    const login = await owner.inject({
      method: "POST",
      url: "/api/login",
      headers,
      payload: { password: ownerPassword },
    });
    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toContain("HttpOnly");
    expect(login.headers["set-cookie"]).toContain("SameSite=Strict");
    const cookie = String(login.headers["set-cookie"]).split(";")[0],
      csrf = login.json().csrf;
    expect(
      (
        await owner.inject({
          method: "POST",
          url: "/api/vault/lock",
          headers: { ...headers, cookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await owner.inject({
          method: "POST",
          url: "/api/vault/lock",
          headers: {
            ...headers,
            cookie,
            "x-csrf-token": csrf,
            origin: "https://evil.test",
          },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await owner.inject({
          method: "POST",
          url: "/api/vault/lock",
          headers: { ...headers, cookie, "x-csrf-token": csrf },
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await internal.inject({
          method: "POST",
          url: "/internal/tool",
          headers: { authorization: "Bearer " + agent.credential },
          payload: { tool: "broker.list_accounts", args: {} },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await internal.inject({
          method: "POST",
          url: "/internal/tool",
          headers: {
            "x-broker-internal": key,
            authorization: "Bearer " + agent.agent.id,
          },
          payload: { tool: "broker.list_accounts", args: {} },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await internal.inject({
          method: "POST",
          url: "/internal/tool",
          headers: {
            "x-broker-internal": key,
            authorization: "Bearer " + agent.credential,
          },
          payload: {
            tool: "broker.list_accounts",
            args: {},
            agent_id: agent.agent.id,
          },
        })
      ).statusCode,
    ).toBe(400);
  } finally {
    await owner.close();
    await internal.close();
    await b.shutdown();
  }
});
