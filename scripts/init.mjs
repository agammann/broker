import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
mkdirSync(".secrets", { recursive: true, mode: 0o700 });
mkdirSync("data", { recursive: true, mode: 0o700 });
for (const name of ["setup", "internal"])
  if (!existsSync(".secrets/" + name))
    writeFileSync(".secrets/" + name, randomBytes(32).toString("base64url"), {
      mode: 0o600,
      flag: "wx",
    });
console.log(
  "Private initialization files created. Read .secrets/setup in your private editor and enter it in Broker. On Windows, restrict .secrets and data to your account using the documented ACL command. No owner or vault password has been created.",
);
