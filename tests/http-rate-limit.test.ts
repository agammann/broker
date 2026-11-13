import { expect, it } from "vitest";
import { gateway } from "../src/server/gateway.js";

it("enforces the per-client gateway limit under concurrent requests", async () => {
  const app = await gateway({
    internalUrl: "http://127.0.0.1:1",
    key: "synthetic-only",
    host: "broker.test",
  });
  try {
    const response = await Promise.all(
      Array.from({ length: 130 }, () =>
        app.inject({
          url: "/health",
          headers: { host: "broker.test" },
          remoteAddress: "192.0.2.1",
        }),
      ),
    );
    expect(response.filter((r) => r.statusCode === 200)).toHaveLength(120);
    const limited = response.filter((r) => r.statusCode === 429);
    expect(limited).toHaveLength(10);
    expect(limited[0].json()).toMatchObject({ code: "rate_limited" });
    expect(limited[0].headers["retry-after"]).toBeDefined();
    const other = await app.inject({
      url: "/health",
      headers: { host: "broker.test" },
      remoteAddress: "192.0.2.2",
    });
    expect(other.statusCode).toBe(200);
  } finally {
    await app.close();
  }
});
