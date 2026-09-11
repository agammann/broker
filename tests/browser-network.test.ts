import { it, expect } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { chromium } from "playwright";
import { createEgress } from "../src/adapters/network.js";
import { restrictFixtureContext } from "../src/adapters/browser-policy.js";
it("blocks redirects, subresources, popups, WebSockets, service workers and unapproved same-origin operations in real Chromium", async () => {
  let leaked = 0,
    mutations = 0;
  const blocked = http.createServer((_q, r) => {
    leaked++;
    r.end("blocked");
  });
  blocked.on("upgrade", (_q, s) => {
    leaked++;
    s.destroy();
  });
  await new Promise<void>((r) => blocked.listen(0, "127.0.0.1", r));
  const blockedOrigin = `http://127.0.0.1:${(blocked.address() as AddressInfo).port}`;
  const allowed = http.createServer((q, r) => {
    if (q.url === "/login") {
      r.writeHead(302, { Location: blockedOrigin + "/capture" });
      r.end();
    } else if (q.url === "/invoices") {
      r.setHeader("Content-Type", "text/html");
      r.end(
        "<!doctype html><title>Network fixture</title><p>Network fixture only</p>",
      );
    } else {
      mutations++;
      r.end("unexpected");
    }
  });
  await new Promise<void>((r) => allowed.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(allowed.address() as AddressInfo).port}`,
    destination = { origin, fixture: true };
  const proxy = await createEgress(destination),
    browser = await chromium.launch({
      headless: true,
      chromiumSandbox: true,
      proxy: { server: proxy.url, bypass: "<-loopback>" },
    }),
    context = await browser.newContext({ serviceWorkers: "block" });
  await restrictFixtureContext(context, destination);
  try {
    const page = await context.newPage();
    await page.goto(origin + "/invoices");
    const outcomes = await page.evaluate(
      async ({ blockedOrigin }) => {
        const image = document.createElement("img");
        image.src = blockedOrigin + "/image";
        document.body.append(image);
        const iframe = document.createElement("iframe");
        iframe.src = blockedOrigin + "/iframe";
        document.body.append(iframe);
        window.open(blockedOrigin + "/popup");
        const ws = new WebSocket(blockedOrigin.replace("http:", "ws:"));
        ws.addEventListener("error", () => {});
        ws.addEventListener("close", () => {});
        const fetchBlocked = await fetch(blockedOrigin + "/fetch").then(
          () => false,
          () => true,
        );
        const mutationBlocked = await fetch("/delete-account", {
          method: "POST",
        }).then(
          () => false,
          () => true,
        );
        let worker = false;
        try {
          await navigator.serviceWorker.register("/worker.js");
          worker = true;
        } catch {
          /* expected block */
        }
        return { fetchBlocked, mutationBlocked, worker };
      },
      { blockedOrigin },
    );
    expect(outcomes.fetchBlocked).toBe(true);
    expect(outcomes.mutationBlocked).toBe(true);
    expect(await context.serviceWorkers()).toHaveLength(0);
    const redirectResult = await page.goto(origin + "/login").catch(() => null);
    expect(redirectResult === null || redirectResult.status() === 403).toBe(
      true,
    );
    expect(leaked).toBe(0);
    expect(mutations).toBe(0);
    await expect.poll(() => context.pages().length, { timeout: 3000 }).toBe(1);
  } finally {
    await context.close();
    await browser.close();
    await proxy.close();
    await new Promise<void>((r) => allowed.close(() => r()));
    await new Promise<void>((r) => blocked.close(() => r()));
  }
});
