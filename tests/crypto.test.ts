import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { seal, open } from "../src/core/crypto.js";
import { codeAt, parseTotp } from "../src/core/totp.js";
import { DB } from "../src/core/db.js";
import { Vault } from "../src/core/vault.js";
import { fixture, passphrase } from "./helpers.js";
const base32 = (s: string) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0,
    value = 0,
    out = "";
  for (const b of Buffer.from(s)) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += chars[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += chars[(value << (5 - bits)) & 31];
  return out;
};
it("keeps restore locked while owner unlock or passphrase changes overlap cleanup", async () => {
  const db = new DB(":memory:");
  let release!: () => void;
  let entered!: () => void;
  const reached = new Promise<void>((r) => {
    entered = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const vault = new Vault(db, async () => {
    entered();
    await gate;
  });
  await vault.initialize(passphrase);
  db.set("settings", { lock_seconds: 900, retention_days: 90 });
  await vault.unlock(passphrase);
  const backup = vault.backup();
  const restoring = vault.restore(backup, passphrase);
  try {
    await reached;
    await expect(vault.unlock(passphrase)).rejects.toThrow("maintenance");
    await expect(
      vault.changePassphrase(passphrase, "another-test-passphrase"),
    ).rejects.toThrow("maintenance");
  } finally {
    release();
    await restoring;
    db.close();
  }
  expect(vault.unlocked).toBe(false);
});
describe("RFC 6238 and enrollment", () => {
  const times = [
    59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000,
  ];
  const vectors = {
    sha1: [
      "94287082",
      "07081804",
      "14050471",
      "89005924",
      "69279037",
      "65353130",
    ],
    sha256: [
      "46119246",
      "68084774",
      "67062674",
      "91819424",
      "90698825",
      "77737706",
    ],
    sha512: [
      "90693936",
      "25091201",
      "99943326",
      "93441116",
      "38618901",
      "47863826",
    ],
  };
  for (const algorithm of ["sha1", "sha256", "sha512"] as const)
    it(`passes all six ${algorithm} reference vectors`, async () => {
      const length = { sha1: 20, sha256: 32, sha512: 64 }[algorithm],
        secret = base32("1234567890".repeat(7).slice(0, length));
      for (let i = 0; i < times.length; i++)
        expect(
          await codeAt({ secret, algorithm, digits: 8, period: 30 }, times[i]),
        ).toBe(vectors[algorithm][i]);
    });
  it("rejects malformed, HOTP, duplicate and unsupported parameters", () => {
    for (const s of [
      "broken",
      "otpauth://hotp/a?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
      "otpauth://totp/a?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&digits=9",
      "otpauth://totp/a?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&period=0",
      "otpauth://totp/a?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    ])
      expect(() => parseTotp(s)).toThrow("invalid_totp");
  });
  it("accepts SHA-512 and 8-digit URI with custom period", () =>
    expect(
      parseTotp(
        "otpauth://totp/a?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&algorithm=SHA512&digits=8&period=60",
      ),
    ).toMatchObject({ algorithm: "sha512", digits: 8, period: 60 }));
});
describe("vault cryptography", () => {
  it("binds encryption to account and type and detects bit changes", () => {
    const key = randomBytes(32),
      box = seal(key, Buffer.from("sensitive-test-only"), "account:A:password");
    expect(open(key, box, "account:A:password").toString()).toBe(
      "sensitive-test-only",
    );
    expect(() => open(key, box, "account:B:password")).toThrow();
    expect(() =>
      open(
        key,
        { ...box, data: Buffer.from("tampered").toString("base64") },
        "account:A:password",
      ),
    ).toThrow();
    expect(seal(key, Buffer.from("x"), "a").iv).not.toBe(
      seal(key, Buffer.from("x"), "a").iv,
    );
  });
  it("starts locked, rejects wrong passphrases, rewraps and restores with no plaintext", async () => {
    const db = new DB(":memory:"),
      v = new Vault(db, async () => {});
    await v.initialize(passphrase);
    expect(v.unlocked).toBe(false);
    await expect(v.unlock("wrong-passphrase")).rejects.toThrow(
      "incorrect_passphrase",
    );
    await v.unlock(passphrase);
    const encrypted = v.encrypt("account", {
      username: fixture.username,
      password: fixture.password,
      totp: parseTotp(fixture.totp),
    });
    expect(encrypted).not.toContain(fixture.password);
    expect(v.decrypt("account", encrypted).username).toBe(fixture.username);
    await v.changePassphrase(passphrase, "new-test-vault-passphrase");
    await v.lock();
    await expect(v.unlock(passphrase)).rejects.toThrow();
    await v.unlock("new-test-vault-passphrase");
    db.close();
  });
});
