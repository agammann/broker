import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import { equal, hashPassword, verifyPassword } from "../core/crypto.js";
import { verifyCode, type Totp } from "../core/totp.js";
import type { Invoice } from "../shared/schemas.js";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export type FixtureUser = { username: string; password: string; totp: Totp };
export async function createPortal(
  users: FixtureUser[],
  options: {
    mode?: "normal" | "human" | "layout" | "identity" | "lockout";
  } = {},
) {
  const app = Fastify({ logger: false, bodyLimit: 8192 });
  await app.register(cookie);
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) =>
      done(null, Object.fromEntries(new URLSearchParams(body as string))),
  );
  const hashes = new Map(
    await Promise.all(
      users.map(
        async (u) => [u.username, await hashPassword(u.password)] as const,
      ),
    ),
  );
  const sessions = new Map<
    string,
    { username: string; stage: string; csrf: string; expires: number }
  >();
  const used = new Map<string, number>();
  const failures = new Map<string, number>();
  const shell = (state: string, body: string) =>
    `<!doctype html><html><meta charset="utf-8"><title>Broker test portal</title><main data-state="${state}">${body}</main></html>`;
  app.addHook("onRequest", async (_q, r) => {
    r.header("Cache-Control", "no-store");
    r.header(
      "Content-Security-Policy",
      "default-src 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    for (const [k, s] of sessions)
      if (s.expires < Date.now()) sessions.delete(k);
  });
  app.get("/login", async (_q, r) =>
    r
      .type("text/html")
      .send(
        shell(
          options.mode === "layout" ? "changed" : "password",
          '<h1>Fixture business portal</h1><form method="post" action="/login"><label>Username<input name="username" autocomplete="off"></label><label>Password<input name="password" type="password"></label><button>Continue</button></form>',
        ),
      ),
  );
  app.post("/login", async (q, r) => {
    const b = q.body as Record<string, string>,
      u = users.find((u) => u.username === b.username);
    const key = randomUUID();
    let stage = "totp";
    if (options.mode === "lockout" || (failures.get(b.username) ?? 0) >= 5)
      stage = "locked-out";
    else if (
      !u ||
      !(await verifyPassword(b.password ?? "", hashes.get(u.username)!))
    ) {
      stage = "incorrect";
      failures.set(b.username, (failures.get(b.username) ?? 0) + 1);
    } else if (options.mode === "human") stage = "human-action";
    sessions.set(key, {
      username: b.username,
      stage,
      csrf: randomUUID(),
      expires: Date.now() + 3600000,
    });
    r.setCookie("fixture", key, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
    });
    return r.redirect("/challenge");
  });
  app.get("/challenge", async (q, r) => {
    const s = sessions.get(q.cookies.fixture ?? "");
    if (!s) return r.redirect("/login");
    return r
      .type("text/html")
      .send(
        shell(
          s.stage,
          s.stage === "totp"
            ? '<form method="post" action="/challenge"><label>Authenticator code<input name="code"></label><button>Verify</button></form>'
            : "<p>Authentication requires attention.</p>",
        ),
      );
  });
  app.post("/challenge", async (q, r) => {
    const s = sessions.get(q.cookies.fixture ?? "");
    if (!s || s.stage !== "totp") return r.code(403).send("denied");
    const u = users.find((u) => u.username === s.username)!;
    const step = Math.floor(Date.now() / 1000 / u.totp.period);
    const valid = await verifyCode(
      u.totp,
      (q.body as Record<string, string>).code ?? "",
    );
    if (!valid.valid || (used.get(u.username) ?? -1) >= step) {
      s.stage = "incorrect";
      return r.redirect("/invoices");
    }
    used.set(u.username, step);
    s.stage = "invoices";
    failures.delete(u.username);
    return r.redirect("/invoices");
  });
  app.get("/invoices", async (q, r) => {
    const s = sessions.get(q.cookies.fixture ?? "");
    if (!s) return r.redirect("/login");
    if (s.stage !== "invoices")
      return r.type("text/html").send(shell(s.stage, "<p>Denied</p>"));
    const params = q.query as Record<string, string>,
      page = Math.max(1, Math.min(20, Number(params.page) || 1)),
      size = Math.max(1, Math.min(100, Number(params.page_size) || 25));
    const invoices: Invoice[] = [
      {
        invoice_id: "FIXTURE-001",
        date: "2026-01-15",
        amount: "125.40",
        currency: "USD",
        status: "paid",
      },
      {
        invoice_id: "FIXTURE-002",
        date: "2026-02-15",
        amount: "86.10",
        currency: "USD",
        status: "open",
      },
    ];
    const selected = invoices.filter(
      (i) =>
        (!params.from || i.date >= params.from) &&
        (!params.to || i.date <= params.to),
    );
    const rows = selected.slice((page - 1) * size, page * size);
    return r
      .type("text/html")
      .send(
        shell(
          "invoices",
          `<h1>Invoices (synthetic fixture data)</h1><div data-account="${escape(options.mode === "identity" ? "different-user" : s.username)}"></div><table><tbody>${rows.map((i) => "<tr>" + [i.invoice_id, i.date, i.amount, i.currency, i.status].map((v) => `<td>${escape(v)}</td>`).join("") + "</tr>").join("")}</tbody></table>${selected.length > page * size ? '<span data-next="true"></span>' : ""}<form method="post" action="/logout"><input type="hidden" name="csrf" value="${s.csrf}"><button>Log out</button></form>`,
        ),
      );
  });
  app.post("/logout", async (q, r) => {
    const key = q.cookies.fixture ?? "",
      s = sessions.get(key);
    if (!s || !equal((q.body as Record<string, string>).csrf ?? "", s.csrf))
      return r.code(403).send("denied");
    sessions.delete(key);
    r.clearCookie("fixture", { path: "/" });
    return r.redirect("/login");
  });
  app.get("/health", () => ({ status: "ok", fixture: true }));
  return app;
}
