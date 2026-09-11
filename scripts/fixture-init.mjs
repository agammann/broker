import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { generateSecret } from "otplib";
mkdirSync(".secrets", { recursive: true, mode: 0o700 });
writeFileSync(
  ".secrets/fixture-users.json",
  JSON.stringify(
    [
      {
        username: "fixture-owner",
        password: randomBytes(24).toString("base64url"),
        totp: {
          secret: generateSecret(),
          algorithm: "sha1",
          digits: 6,
          period: 30,
        },
      },
    ],
    null,
    2,
  ),
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Created private disposable fixture credentials. Open .secrets/fixture-users.json privately and enroll these in Broker. These credentials work only with the bundled test portal.",
);
