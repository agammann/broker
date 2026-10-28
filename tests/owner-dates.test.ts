import { afterEach, expect, it, vi } from "vitest";
import type { Broker } from "../src/core/broker.js";
import { setup } from "./helpers.js";
import { ownerAccessDates } from "./owner-dates.js";

let broker: Broker | undefined;
afterEach(async () => {
  try {
    await broker?.shutdown();
  } finally {
    broker = undefined;
    vi.restoreAllMocks();
  }
});

it.each([
  "2027-01-02T00:00:00.000Z", // After both original fixed expirations.
  "2036-12-31T23:59:59.999Z", // Year and minute rollover.
  "2040-02-29T23:59:59.999Z", // Leap-day rollover.
  "2030-03-10T09:59:59.999Z", // America/Los_Angeles spring DST transition.
  "2030-11-03T08:59:59.999Z", // America/Los_Angeles autumn DST transition.
])("owner authorization fixtures remain valid at %s", async (instant) => {
  const now = Date.parse(instant);
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  const { b, config } = await setup();
  broker = b;
  const dates = ownerAccessDates();
  for (const value of Object.values(dates)) {
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  }
  const starts = new Date(dates.accessStarts).getTime();
  const expires = new Date(dates.accessExpires).getTime();
  const agentExpires = new Date(dates.agentExpires).getTime();
  expect(starts).toBeLessThan(now);
  expect(expires).toBeGreaterThan(now + 86400000);
  expect(agentExpires).toBeGreaterThan(expires);
  expect(agentExpires).toBeLessThanOrEqual(now + 366 * 86400000);
  const agent = b.registerAgent({
    label: "Owner fixture",
    expires: agentExpires,
  });
  const grantConfig = { ...config, agent_id: agent.agent.id, starts, expires };
  const grant = await b.putGrant(grantConfig);
  expect(grant).toHaveProperty("id");
  // Invoice business-date bounds are intentionally independent of authorization.
  expect(grantConfig.from).toBe("2026-01-01");
  expect(grantConfig.to).toBe("2026-12-31");

  clock.mockReturnValue(expires - 1);
  await expect(b.putGrant(grantConfig, grant.id)).resolves.toHaveProperty("id");
  for (const boundary of [expires, expires + 1]) {
    clock.mockReturnValue(boundary);
    await expect(b.putGrant(grantConfig, grant.id)).rejects.toThrow(
      "invalid_expiration",
    );
  }
  clock.mockReturnValue(agentExpires - 1);
  expect(() =>
    b.registerAgent({ label: "Boundary fixture", expires: agentExpires }),
  ).not.toThrow();
  for (const boundary of [agentExpires, agentExpires + 1]) {
    clock.mockReturnValue(boundary);
    expect(() =>
      b.registerAgent({ label: "Expired fixture", expires: agentExpires }),
    ).toThrow("invalid_expiration");
  }
});
