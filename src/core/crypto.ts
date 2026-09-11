import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scrypt as rawScrypt,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { z } from "zod";
export const envelopeSchema = z
  .object({
    iv: z.string().length(16),
    tag: z.string().length(24),
    data: z.string().max(40_000_000),
  })
  .strict();
export type Envelope = z.infer<typeof envelopeSchema>;
export const wrapSchema = z
  .object({
    v: z.literal(1),
    kdf: z.literal("scrypt-N131072-r8-p1"),
    salt: z.string().length(24),
    key: envelopeSchema,
  })
  .strict();
export type Wrapped = z.infer<typeof wrapSchema>;
export const token = () => randomBytes(32).toString("base64url");
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function kdf(pass: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    rawScrypt(
      pass,
      salt,
      32,
      { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 },
      (e, key) => (e ? reject(e) : resolve(key)),
    ),
  );
}
export function seal(key: Buffer, plaintext: Buffer, aad: string): Envelope {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}
export function open(key: Buffer, env: Envelope, aad: string): Buffer {
  envelopeSchema.parse(env);
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(env.iv, "base64"),
  );
  cipher.setAAD(Buffer.from(aad));
  cipher.setAuthTag(Buffer.from(env.tag, "base64"));
  return Buffer.concat([
    cipher.update(Buffer.from(env.data, "base64")),
    cipher.final(),
  ]);
}
export async function wrap(key: Buffer, pass: string): Promise<Wrapped> {
  const salt = randomBytes(16),
    k = await kdf(pass, salt);
  try {
    return {
      v: 1,
      kdf: "scrypt-N131072-r8-p1",
      salt: salt.toString("base64"),
      key: seal(k, key, "broker:dek:v1"),
    };
  } finally {
    k.fill(0);
  }
}
export async function unwrap(w: Wrapped, pass: string) {
  wrapSchema.parse(w);
  const k = await kdf(pass, Buffer.from(w.salt, "base64"));
  try {
    return open(k, w.key, "broker:dek:v1");
  } finally {
    k.fill(0);
  }
}
export async function hashPassword(pass: string) {
  const salt = randomBytes(16),
    key = await kdf(pass, salt);
  try {
    return salt.toString("base64") + ":" + key.toString("base64");
  } finally {
    key.fill(0);
  }
}
export async function verifyPassword(pass: string, stored: string) {
  const [s, h] = stored.split(":");
  const k = await kdf(pass, Buffer.from(s, "base64"));
  try {
    return equal(k.toString("base64"), h);
  } finally {
    k.fill(0);
  }
}
