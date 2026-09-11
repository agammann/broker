import { readFileSync } from "node:fs";
import { z } from "zod";
import { createPortal } from "./portal.js";
import { totpSchema } from "../core/totp.js";
const path = process.env.BROKER_FIXTURE_USERS_FILE;
if (!path)
  throw new Error("Fixture users file required; never use real credentials");
const users = z
  .array(
    z.object({ username: z.string(), password: z.string(), totp: totpSchema }),
  )
  .parse(JSON.parse(readFileSync(path, "utf8")));
const app = await createPortal(users);
await app.listen({
  host: process.env.BROKER_BIND ?? "127.0.0.1",
  port: Number(process.env.BROKER_FIXTURE_PORT ?? 4313),
});
for (const s of ["SIGINT", "SIGTERM"] as const)
  process.on(s, () => {
    void app.close();
  });
