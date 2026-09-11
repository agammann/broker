import { it, expect } from "vitest";
import http from "node:http";
import net from "node:net";
import {
  allowedUrl,
  publicAddress,
  createEgress,
  resolveDestination,
} from "../src/adapters/network.js";
it("rejects metadata, loopback, private, link-local and mapped addresses", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "100.64.0.1",
    "224.0.0.1",
  ])
    expect(publicAddress(ip), ip).toBe(false);
  expect(publicAddress("93.184.216.34")).toBe(true);
});
it("permits exact origin only and fixture exception cannot be externalized", async () => {
  const d = { origin: "https://billing.example.com" };
  for (const url of [
    "http://billing.example.com",
    "https://billing.example.com.evil.test",
    "https://user:pass@billing.example.com",
    "https://billing.example.com:444",
    "file:///etc/passwd",
    "data:text/html,x",
    "http://127.0.0.1:4313",
  ])
    expect(allowedUrl(url, d)).toBe(false);
  expect(allowedUrl(d.origin + "/invoices", d)).toBe(true);
  expect(
    allowedUrl("http://127.0.0.1:4313", { origin: "http://127.0.0.1:4313" }),
  ).toBe(false);
  await expect(
    resolveDestination({ origin: "https://127.0.0.1" }),
  ).rejects.toThrow("destination_blocked");
});
it("proxy rejects arbitrary HTTP destinations and CONNECT tunnels", async () => {
  const p = await createEgress({
    origin: "http://127.0.0.1:4313",
    fixture: true,
  });
  try {
    const status = await new Promise<number>((resolve, reject) => {
      http
        .get(
          p.url,
          { path: "http://169.254.169.254/latest/meta-data" },
          (r) => {
            r.resume();
            resolve(r.statusCode!);
          },
        )
        .on("error", reject);
    });
    expect(status).toBe(403);
    const response = await new Promise<string>((resolve, reject) => {
      const s = net.connect(Number(new URL(p.url).port), "127.0.0.1", () =>
        s.write(
          "CONNECT 127.0.0.1:4310 HTTP/1.1\r\nHost: 127.0.0.1:4310\r\n\r\n",
        ),
      );
      s.on("data", (d) => {
        resolve(d.toString());
        s.destroy();
      });
      s.on("error", reject);
    });
    expect(response).toContain("403");
  } finally {
    await p.close();
  }
});
