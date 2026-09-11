import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { setTimeout as delay } from "node:timers/promises";
import { codeAt } from "../core/totp.js";
import type { Credentials } from "../core/vault.js";
import { BrokerError, requireThat } from "../core/errors.js";
import { invoiceSchema, invoiceArgs, type Invoice } from "../shared/schemas.js";
import {
  assertDestination,
  createEgress,
  type Destination,
} from "./network.js";
import { restrictFixtureContext } from "./browser-policy.js";
export type LoginSession = {
  read: (args: ReturnType<typeof invoiceArgs.parse>) => Promise<{
    invoices: Invoice[];
    has_more: boolean;
    data_trust: "untrusted";
  }>;
  close: () => Promise<boolean>;
};
export interface Adapter {
  id: string;
  version: string;
  connect(c: Credentials, signal: AbortSignal): Promise<LoginSession>;
}
export class TestPortalAdapter implements Adapter {
  id = "test-portal";
  version = "1.0.0";
  destination: Destination;
  private lastCounter = new Map<string, number>();
  constructor(origin: string) {
    requireThat(
      /^http:\/\/(127\.0\.0\.1|test-portal):\d+$/.test(origin),
      "invalid_fixture_origin",
    );
    this.destination = { origin, fixture: true };
  }
  async connect(c: Credentials, signal: AbortSignal): Promise<LoginSession> {
    const egress = await createEgress(this.destination);
    let browser: Browser | undefined,
      context: BrowserContext | undefined,
      page: Page | undefined;
    let closing = false;
    const cleanup = async () => {
      await context?.close().catch(() => {});
      await browser?.close().catch(() => {});
      await egress.close();
    };
    const abort = () => {
      void cleanup();
    };
    signal.addEventListener("abort", abort, { once: true });
    const state = async (name: string, path: string) => {
      signal.throwIfAborted();
      assertDestination(page!.url(), this.destination);
      requireThat(
        new URL(page!.url()).pathname === path,
        "unexpected_navigation",
      );
      if (await page!.locator('[data-state="human-action"]').count())
        throw new BrokerError("human_action_required");
      if (await page!.locator('[data-state="locked-out"]').count())
        throw new BrokerError("account_lockout");
      if (await page!.locator('[data-state="incorrect"]').count())
        throw new BrokerError("incorrect_credentials");
      requireThat(
        (await page!.locator(`[data-state="${name}"]`).count()) === 1,
        "changed_website_layout",
      );
    };
    try {
      signal.throwIfAborted();
      browser = await chromium.launch({
        headless: true,
        chromiumSandbox: true,
        proxy: { server: egress.url, bypass: "<-loopback>" },
        args: [
          "--disable-quic",
          "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
          "--disable-background-networking",
        ],
      });
      context = await browser.newContext({
        serviceWorkers: "block",
        acceptDownloads: false,
      });
      await restrictFixtureContext(context, this.destination);
      page = await context.newPage();
      page.setDefaultTimeout(10000);
      await page.goto(this.destination.origin + "/login");
      await state("password", "/login");
      requireThat(
        (await page.locator("form").getAttribute("action")) === "/login" &&
          (await page.locator("form").getAttribute("method"))?.toLowerCase() ===
            "post",
        "changed_website_layout",
      );
      await page.getByLabel("Username", { exact: true }).fill(c.username);
      await page.getByLabel("Password", { exact: true }).fill(c.password);
      await Promise.all([
        page.waitForURL("**/challenge"),
        page.getByRole("button", { name: "Continue", exact: true }).click(),
      ]);
      await state("totp", "/challenge");
      requireThat(
        (await page.locator("form").getAttribute("action")) === "/challenge" &&
          (await page.locator("form").getAttribute("method"))?.toLowerCase() ===
            "post",
        "changed_website_layout",
      );
      const nowSeconds = Math.floor(Date.now() / 1000);
      const step = Math.floor(nowSeconds / c.totp.period);
      const counterKey = `${c.username}:${c.totp.period}`;
      const earliest =
        c.totp.period - (nowSeconds % c.totp.period) < 4 ? step + 1 : step;
      const reserved = Math.max(
        earliest,
        (this.lastCounter.get(counterKey) ?? -1) + 1,
      );
      requireThat(reserved <= step + 1, "concurrency_limited", 429);
      this.lastCounter.set(counterKey, reserved);
      const waitMs = reserved * c.totp.period * 1000 + 100 - Date.now();
      if (waitMs > 0) await delay(waitMs, undefined, { signal });
      await state("totp", "/challenge");
      const submittedCode = await codeAt(c.totp);
      await page.getByLabel("Authenticator code").fill(submittedCode);
      await Promise.all([
        page.waitForURL("**/invoices"),
        page.getByRole("button", { name: "Verify", exact: true }).click(),
      ]);
      await state("invoices", "/invoices");
      requireThat(
        (await page.locator("[data-account]").getAttribute("data-account")) ===
          c.username,
        "identity_verification_failed",
      );
      return {
        read: async (args) => {
          signal.throwIfAborted();
          const q = invoiceArgs.parse(args);
          await page!.goto(
            `${this.destination.origin}/invoices?from=${q.from}&to=${q.to}&page=${q.page}&page_size=${q.page_size}`,
          );
          await state("invoices", "/invoices");
          requireThat(
            (await page!
              .locator("[data-account]")
              .getAttribute("data-account")) === c.username,
            "identity_verification_failed",
          );
          requireThat(
            (await page!.locator("tbody tr").count()) <= q.page_size,
            "adapter_invalid_result",
          );
          const values = await page!.locator("tbody tr").evaluateAll((rows) =>
            rows.map((row) => {
              const cells = Array.from(row.querySelectorAll("td")).map(
                (c) => c.textContent ?? "",
              );
              return {
                invoice_id: cells[0],
                date: cells[1],
                amount: cells[2],
                currency: cells[3],
                status: cells[4],
              };
            }),
          );
          const invoices = invoiceSchema.array().max(q.page_size).parse(values);
          const serialized = JSON.stringify(invoices);
          requireThat(
            ![c.password, c.totp.secret, submittedCode].some((secret) =>
              serialized.includes(secret),
            ),
            "adapter_invalid_result",
          );
          requireThat(
            invoices.every((i) => i.date >= q.from && i.date <= q.to),
            "adapter_invalid_result",
          );
          return {
            invoices,
            has_more: (await page!.locator('[data-next="true"]').count()) > 0,
            data_trust: "untrusted",
          };
        },
        close: async () => {
          if (closing) return false;
          closing = true;
          let confirmed = false;
          try {
            if (!signal.aborted) {
              await page!.goto(this.destination.origin + "/invoices");
              await state("invoices", "/invoices");
              await page!
                .getByRole("button", { name: "Log out", exact: true })
                .click();
              confirmed =
                new URL(page!.url()).pathname === "/login" &&
                (await page!.locator('[data-state="password"]').count()) === 1;
            }
          } catch {
            /* local closure remains enforceable */
          } finally {
            signal.removeEventListener("abort", abort);
            await cleanup();
          }
          return confirmed;
        },
      };
    } catch (e) {
      signal.removeEventListener("abort", abort);
      await cleanup();
      if (e instanceof BrokerError) throw e;
      if (signal.aborted) throw new BrokerError("operation_cancelled");
      // Inspect controlled states without exposing browser errors or page contents.
      throw new BrokerError(
        e instanceof Error && e.name === "TimeoutError"
          ? "timeout"
          : "adapter_failure",
      );
    }
  }
}
