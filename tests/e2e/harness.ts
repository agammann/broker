import { DB } from "../../src/core/db.js";
import { Broker } from "../../src/core/broker.js";
import { ownerServer } from "../../src/server/http.js";
import { TestPortalAdapter } from "../../src/adapters/test-portal.js";
import { createPortal } from "../../src/fixtures/portal.js";
import { parseTotp } from "../../src/core/totp.js";
import { fixture } from "../helpers.js";
const portal = await createPortal([
  {
    username: fixture.username,
    password: fixture.password,
    totp: parseTotp(fixture.totp),
  },
]);
await portal.listen({ host: "127.0.0.1", port: 14313 });
const b = new Broker(
  new DB(":memory:"),
  new Map([["test-portal", new TestPortalAdapter("http://127.0.0.1:14313")]]),
);
const owner = await ownerServer(b, {
  origin: "http://127.0.0.1:14310",
  setupToken: "fixture-setup-token-not-a-real-secret-00000000000",
});
await owner.listen({ host: "127.0.0.1", port: 14310 });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void (async () => {
      await owner.close();
      await b.shutdown();
      await portal.close();
    })();
  });
