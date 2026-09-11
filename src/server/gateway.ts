import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { toolSchemas, type ToolName } from "../shared/schemas.js";
import { requireThat } from "../core/errors.js";
import { errors } from "./http.js";
export async function gateway(opts: {
  internalUrl: string;
  key: string;
  host: string;
}) {
  const app = Fastify({
    logger: false,
    bodyLimit: 16384,
    requestTimeout: 65000,
  });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  errors(app);
  app.addHook("onRequest", async (q) => {
    requireThat(q.headers.host === opts.host, "invalid_host");
    requireThat(!q.headers.origin, "browser_agent_access_denied");
  });
  app.get("/health", () => ({ status: "ok" }));
  app.post("/v1/tool", async (q, r) => {
    const p = z
      .object({
        tool: z.enum(Object.keys(toolSchemas) as [ToolName, ...ToolName[]]),
        args: z.unknown(),
      })
      .strict()
      .parse(q.body);
    toolSchemas[p.tool].parse(p.args);
    requireThat(
      /^Bearer [A-Za-z0-9_-]{43}$/.test(q.headers.authorization ?? ""),
      "invalid_agent",
      401,
    );
    const result = await fetch(opts.internalUrl + "/internal/tool", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-broker-internal": opts.key,
        authorization: q.headers.authorization!,
      },
      body: JSON.stringify(p),
      signal: AbortSignal.timeout(65000),
      redirect: "error",
    });
    r.code(result.status);
    return result.json();
  });
  return app;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.BROKER_GATEWAY_PORT ?? 4311);
  const key = readFileSync(
    process.env.BROKER_INTERNAL_KEY_FILE ?? ".secrets/internal",
    "utf8",
  ).trim();
  requireThat(key.length >= 43, "invalid_internal_key");
  const app = await gateway({
    internalUrl: process.env.BROKER_INTERNAL_URL ?? "http://127.0.0.1:4312",
    key,
    host: process.env.BROKER_GATEWAY_HOST ?? `127.0.0.1:${port}`,
  });
  await app.listen({ host: process.env.BROKER_BIND ?? "127.0.0.1", port });
  process.stderr.write(`Broker agent gateway listening on ${port}\n`);
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      void app.close();
    });
}
