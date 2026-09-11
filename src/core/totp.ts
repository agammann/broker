import { generate, verify } from "otplib";
import { z } from "zod";
import { BrokerError } from "./errors.js";
export const totpSchema = z
  .object({
    secret: z
      .string()
      .regex(/^[A-Z2-7]{26,256}$/)
      .refine((s) => {
        const remainder = (s.length * 5) % 8;
        if (![0, 2, 4, 5, 7].includes(s.length % 8)) return false;
        return (
          ("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(s.at(-1)!) &
            ((1 << remainder) - 1)) ===
          0
        );
      }, "Noncanonical base32"),
    algorithm: z.enum(["sha1", "sha256", "sha512"]),
    digits: z.union([z.literal(6), z.literal(8)]),
    period: z.number().int().min(15).max(120),
  })
  .strict();
export type Totp = z.infer<typeof totpSchema>;
export function parseTotp(input: string): Totp {
  try {
    if (input.startsWith("otpauth://")) {
      const u = new URL(input);
      if (u.hostname !== "totp" || u.username || u.password || u.hash)
        throw Error();
      const entries = [...u.searchParams.keys()];
      if (new Set(entries).size !== entries.length) throw Error();
      return totpSchema.parse({
        secret: (u.searchParams.get("secret") ?? "")
          .toUpperCase()
          .replace(/=+$/, ""),
        algorithm: (u.searchParams.get("algorithm") ?? "SHA1").toLowerCase(),
        digits: Number(u.searchParams.get("digits") ?? 6),
        period: Number(u.searchParams.get("period") ?? 30),
      });
    }
    return totpSchema.parse({
      secret: input.toUpperCase().replace(/\s/g, "").replace(/=+$/, ""),
      algorithm: "sha1",
      digits: 6,
      period: 30,
    });
  } catch {
    throw new BrokerError("invalid_totp");
  }
}
export const codeAt = (t: Totp, epoch = Math.floor(Date.now() / 1000)) =>
  generate({ ...t, epoch });
export const verifyCode = (
  t: Totp,
  token: string,
  epoch = Math.floor(Date.now() / 1000),
) => verify({ ...t, token, epoch, epochTolerance: 0 });
