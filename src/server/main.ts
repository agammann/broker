import { readFileSync } from "node:fs";
import { DB } from "../core/db.js";
import { Broker } from "../core/broker.js";
import { TestPortalAdapter } from "../adapters/test-portal.js";
import { ownerServer, internalServer } from "./http.js";
import { requireThat } from "../core/errors.js";
const key = readFileSync(
    process.env.BROKER_INTERNAL_KEY_FILE ?? ".secrets/internal",
    "utf8",
  ).trim(),
  setupToken = readFileSync(
    process.env.BROKER_SETUP_TOKEN_FILE ?? ".secrets/setup",
    "utf8",
  ).trim();
requireThat(
  key.length >= 43 && setupToken.length >= 43,
  "run_private_initialization",
);
const adapters = new Map();
if (process.env.BROKER_ENABLE_FIXTURE === "1")
  adapters.set(
    "test-portal",
    new TestPortalAdapter(
      process.env.BROKER_FIXTURE_ORIGIN ?? "http://127.0.0.1:4313",
    ),
  );
const b = new Broker(
    new DB(process.env.BROKER_DB ?? "data/broker.db"),
    adapters,
  ),
  port = Number(process.env.BROKER_OWNER_PORT ?? 4310);
const owner = await ownerServer(b, {
  origin: process.env.BROKER_OWNER_ORIGIN ?? `http://127.0.0.1:${port}`,
  setupToken,
});
const internal = await internalServer(b, key);
await owner.listen({ host: process.env.BROKER_BIND ?? "127.0.0.1", port });
await internal.listen({
  host: process.env.BROKER_INTERNAL_BIND ?? "127.0.0.1",
  port: Number(process.env.BROKER_INTERNAL_PORT ?? 4312),
});
let cleaning = false;
const timer = setInterval(() => {
  if (!cleaning) {
    cleaning = true;
    void b
      .cleanup()
      .catch(() => b.db.audit("cleanup_failed"))
      .finally(() => {
        cleaning = false;
      });
  }
}, 1000);
timer.unref();
let stopped = false;
async function stop() {
  if (stopped) return;
  stopped = true;
  clearInterval(timer);
  await owner.close();
  await internal.close();
  while (cleaning) await new Promise((r) => setTimeout(r, 10));
  await b.shutdown();
}
for (const s of ["SIGINT", "SIGTERM"] as const)
  process.on(s, () => {
    void stop();
  });
process.stderr.write(
  `Broker owner dashboard: ${process.env.BROKER_OWNER_ORIGIN ?? `http://127.0.0.1:${port}`}\nVault starts locked.\n`,
);
