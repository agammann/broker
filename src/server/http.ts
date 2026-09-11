import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { Broker } from "../core/broker.js";
import { BrokerError, requireThat } from "../core/errors.js";
import { digest, equal, token } from "../core/crypto.js";
import {
  passwordSchema,
  toolSchemas,
  type ToolName,
  id,
} from "../shared/schemas.js";
export function errors(app: FastifyInstance) {
  app.setErrorHandler((e, _q, r) => {
    const correlation_id = randomUUID();
    const status =
      e instanceof BrokerError
        ? e.http
        : e instanceof z.ZodError
          ? 400
          : (e as { statusCode?: number }).statusCode === 429
            ? 429
            : 500;
    return r.code(status).send({
      status: "error",
      code:
        e instanceof BrokerError
          ? e.code
          : e instanceof z.ZodError
            ? "invalid_request"
            : status === 429
              ? "rate_limited"
              : "internal_error",
      correlation_id,
    });
  });
}
export async function ownerServer(
  b: Broker,
  opts: { origin: string; setupToken: string; staticRoot?: string },
) {
  const app = Fastify({
    logger: false,
    bodyLimit: 8 * 1024 * 1024,
    requestTimeout: 70000,
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  errors(app);
  const origin = new URL(opts.origin);
  requireThat(
    origin.protocol === "https:" ||
      (origin.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(origin.hostname)),
    "https_required",
  );
  const sessions = new Map<string, { csrf: string; expires: number }>();
  let authenticating = false;
  const owner = (q: FastifyRequest) => {
    const key = digest(q.cookies.broker_owner ?? "");
    const s = sessions.get(key);
    requireThat(
      s && s.expires > Date.now(),
      "owner_authentication_required",
      401,
    );
    return s;
  };
  app.addHook("onRequest", async (q, r) => {
    r.header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("X-Frame-Options", "DENY")
      .header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
    requireThat(q.headers.host === origin.host, "invalid_host");
    if (q.headers.origin)
      requireThat(q.headers.origin === origin.origin, "invalid_origin");
    for (const [k, s] of sessions)
      if (s.expires <= Date.now()) sessions.delete(k);
    if (q.method !== "GET" && q.method !== "HEAD") {
      requireThat(
        q.headers.origin === origin.origin &&
          q.headers["content-type"]?.startsWith("application/json") &&
          q.headers["x-broker-client"] === "owner",
        "invalid_origin_or_content_type",
      );
      if (!["/api/login", "/api/setup"].includes(q.url))
        requireThat(
          equal(q.headers["x-csrf-token"]?.toString() ?? "", owner(q).csrf),
          "csrf_failed",
        );
    }
    if (
      q.url.startsWith("/api/") &&
      !["/api/status", "/api/login", "/api/setup"].includes(q.url)
    )
      owner(q);
  });
  app.get("/health", () => ({ status: "ok" }));
  app.get("/api/status", async (q) => {
    let session;
    try {
      session = owner(q);
    } catch {
      /* anonymous bootstrap state only */
    }
    return {
      initialized: !!b.db.meta("owner"),
      authenticated: !!session,
      csrf: session?.csrf,
    };
  });
  app.post(
    "/api/setup",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (q) => {
      const p = z
        .object({
          setup_token: z.string().min(40).max(128),
          password: passwordSchema,
          passphrase: passwordSchema,
        })
        .strict()
        .parse(q.body);
      requireThat(
        equal(digest(p.setup_token), digest(opts.setupToken)),
        "invalid_setup_token",
        401,
      );
      await b.initialize(p.password, p.passphrase);
      return { status: "initialized" };
    },
  );
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (q, r) => {
      const p = z.object({ password: passwordSchema }).strict().parse(q.body);
      requireThat(!authenticating, "busy", 429);
      authenticating = true;
      try {
        await b.login(p.password);
      } finally {
        authenticating = false;
      }
      const raw = token(),
        s = { csrf: token(), expires: Date.now() + 3600000 };
      sessions.clear();
      sessions.set(digest(raw), s);
      r.setCookie("broker_owner", raw, {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        secure: origin.protocol === "https:",
        maxAge: 3600,
      });
      return { status: "authenticated", csrf: s.csrf };
    },
  );
  app.post("/api/logout", async (q, r) => {
    sessions.delete(digest(q.cookies.broker_owner ?? ""));
    r.clearCookie("broker_owner", { path: "/" });
    return { status: "signed_out" };
  });
  app.get("/api/state", () => b.snapshot());
  app.post(
    "/api/vault/unlock",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (q) => {
      const { passphrase } = z
        .object({ passphrase: passwordSchema })
        .strict()
        .parse(q.body);
      requireThat(!authenticating, "busy", 429);
      authenticating = true;
      try {
        await b.vault.unlock(passphrase);
      } finally {
        authenticating = false;
      }
      return { status: "unlocked", locks_at: b.vault.deadline };
    },
  );
  app.post("/api/vault/lock", async () => {
    await b.vault.lock();
    return { status: "locked" };
  });
  app.post(
    "/api/vault/passphrase",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (q) => {
      const p = z
        .object({ current: passwordSchema, next: passwordSchema })
        .strict()
        .parse(q.body);
      requireThat(!authenticating, "busy", 429);
      authenticating = true;
      try {
        await b.vault.changePassphrase(p.current, p.next);
      } finally {
        authenticating = false;
      }
      return { status: "changed" };
    },
  );
  app.post("/api/vault/backup", () => {
    b.db.audit("backup_exported");
    return b.vault.backup();
  });
  app.post(
    "/api/vault/restore",
    { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } },
    async (q) => {
      const p = z
        .object({
          backup: z.unknown(),
          passphrase: passwordSchema,
          confirmation: z.literal("RESTORE"),
        })
        .strict()
        .parse(q.body);
      await b.restore(p.backup, p.passphrase);
      sessions.clear();
      return { status: "restored_sign_in_required" };
    },
  );
  app.post("/api/settings", (q) => b.settings(q.body));
  app.post("/api/accounts", (q) => b.enroll(q.body));
  app.post<{ Params: { id: string } }>("/api/accounts/:id/credentials", (q) =>
    b.enroll(q.body, id.parse(q.params.id)),
  );
  app.post<{ Params: { id: string } }>("/api/accounts/:id/verify", (q) =>
    b.verifyAccount(id.parse(q.params.id)),
  );
  app.post("/api/agents", (q) => b.registerAgent(q.body));
  app.post<{ Params: { id: string } }>("/api/agents/:id/rotate", (q) =>
    b.rotateAgent(id.parse(q.params.id)),
  );
  app.post("/api/grants", (q) => b.putGrant(q.body));
  app.post<{ Params: { id: string } }>("/api/grants/:id", (q) =>
    b.putGrant(q.body, id.parse(q.params.id)),
  );
  app.post<{ Params: { id: string } }>("/api/approvals/:id", (q) => {
    const p = z.object({ approve: z.boolean() }).strict().parse(q.body);
    return b.approve(id.parse(q.params.id), p.approve);
  });
  app.post("/api/revoke", (q) => {
    const p = z
      .object({
        kind: z.enum(["account", "agent", "grant"]),
        id,
        confirmation: z.literal("REVOKE"),
      })
      .strict()
      .parse(q.body);
    return b.invalidate(p.kind, p.id);
  });
  app.post("/api/delete-account", async (q) => {
    const p = z
      .object({ id, confirmation: z.literal("DELETE") })
      .strict()
      .parse(q.body);
    await b.deleteAccount(p.id);
    return { status: "deleted" };
  });
  app.post("/api/close-session", async (q) => {
    const p = z.object({ id }).strict().parse(q.body),
      s = b.sessions.get(p.id);
    requireThat(s, "not_found", 404);
    return b.close(s, "owner_closed");
  });
  const root = opts.staticRoot ?? resolve("web-dist");
  if (existsSync(root)) {
    await app.register(staticFiles, { root });
    app.setNotFoundHandler((q, r) =>
      q.url.startsWith("/api/")
        ? r.code(404).send({ code: "not_found" })
        : r.sendFile("index.html"),
    );
  }
  return app;
}
export async function internalServer(b: Broker, internalKey: string) {
  const app = Fastify({ logger: false, bodyLimit: 16384 });
  await app.register(rateLimit, { max: 240, timeWindow: "1 minute" });
  errors(app);
  app.addHook("onRequest", async (q) => {
    requireThat(
      equal(
        digest(q.headers["x-broker-internal"]?.toString() ?? ""),
        digest(internalKey),
      ),
      "invalid_internal_credential",
      401,
    );
  });
  app.post("/internal/tool", async (q) => {
    const p = z
      .object({
        tool: z.enum(Object.keys(toolSchemas) as [ToolName, ...ToolName[]]),
        args: z.unknown(),
      })
      .strict()
      .parse(q.body);
    const raw = q.headers.authorization ?? "";
    requireThat(raw.startsWith("Bearer "), "invalid_agent", 401);
    const result = await b.tool(raw.slice(7), p.tool, p.args);
    return { status: "ok", correlation_id: randomUUID(), result };
  });
  return app;
}
