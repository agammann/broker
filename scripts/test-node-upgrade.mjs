import assert from "node:assert/strict";
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DB } from "../dist/core/db.js";
import { Vault } from "../dist/core/vault.js";

// Only use a newly created synthetic fixture directory supplied by CI.
const [phase, directory] = process.argv.slice(2);
if (!directory || !["seed", "verify"].includes(phase)) throw Error("Expected seed|verify and a fresh fixture directory");
const passphrase = "test-only-node-upgrade-passphrase";
const id = "00000000-0000-4000-8000-000000000001";
const credentials = {
  username: "synthetic-node-upgrade-user",
  password: "synthetic-node-upgrade-password",
  totp: { secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", algorithm: "sha1", digits: 6, period: 30 },
};

if (phase === "seed") {
  assert.equal(process.versions.node.split(".")[0], "24");
  mkdirSync(directory, { mode: 0o700 });
  writeFileSync(join(directory, "synthetic-fixture-marker"), "broker-node-upgrade-fixture-v1", { flag: "wx", mode: 0o600 });
  const db = new DB(join(directory, "old.sqlite"));
  const vault = new Vault(db, async () => {});
  await vault.initialize(passphrase);
  db.set("settings", { lock_seconds: 900, retention_days: 90 });
  await vault.unlock(passphrase);
  db.run("INSERT INTO accounts VALUES(?,?,?,?,?,?)", id, "Synthetic", "test-portal", "verified", 1, vault.encrypt(id, credentials));
  writeFileSync(join(directory, "backup.json"), JSON.stringify(vault.backup()), { flag: "wx", mode: 0o600 });
  await vault.lock();
  db.close();
} else {
  assert.equal(process.versions.node.split(".")[0], "26");
  assert.equal(readFileSync(join(directory, "synthetic-fixture-marker"), "utf8"), "broker-node-upgrade-fixture-v1");
  const db = new DB(join(directory, "old.sqlite"));
  const vault = new Vault(db, async () => {});
  await vault.unlock(passphrase);
  const account = db.get("SELECT * FROM accounts WHERE id=?", id);
  assert.deepEqual(vault.decrypt(id, account.secret), credentials);
  await vault.lock();
  db.close();

  const restoredPath = join(directory, "restored.sqlite");
  closeSync(openSync(restoredPath, "wx", 0o600));
  const restored = new DB(restoredPath);
  const target = new Vault(restored, async () => {});
  await target.restore(JSON.parse(readFileSync(join(directory, "backup.json"), "utf8")), passphrase);
  assert.equal(target.unlocked, false);
  const row = restored.get("SELECT * FROM accounts WHERE id=?", id);
  assert.equal(row.state, "unverified");
  await target.unlock(passphrase);
  assert.deepEqual(target.decrypt(id, row.secret), credentials);
  await target.lock();
  restored.close();
}
console.log(`Synthetic Node 24 to 26 ${phase} passed`);
