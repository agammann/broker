import { randomBytes } from "node:crypto";
import { z } from "zod";
import { DB } from "./db.js";
import {
  open,
  seal,
  wrap,
  unwrap,
  wrapSchema,
  envelopeSchema,
  type Wrapped,
} from "./crypto.js";
import { BrokerError, requireThat } from "./errors.js";
import { totpSchema } from "./totp.js";
import { grantSchema } from "../shared/schemas.js";
export const credentialsSchema = z
  .object({
    username: z.string().min(1).max(200),
    password: z.string().min(1).max(1024),
    totp: totpSchema,
  })
  .strict();
export type Credentials = z.infer<typeof credentialsSchema>;
export const backupSchema = z
  .object({
    format: z.literal("broker-backup-v1"),
    wrapped: wrapSchema,
    payload: envelopeSchema,
  })
  .strict();
export class Vault {
  private key?: Buffer;
  private restoring = false;
  deadline = 0;
  generation = 0;
  constructor(
    private db: DB,
    private onLock: () => Promise<void>,
  ) {}
  get unlocked() {
    return !!this.key && Date.now() < this.deadline;
  }
  async initialize(pass: string, ownerHash?: string) {
    requireThat(!this.db.meta("wrapped"), "already_initialized");
    const key = randomBytes(32);
    try {
      const wrapped = await wrap(key, pass);
      this.db.tx(() => {
        this.db.set("wrapped", wrapped);
        if (ownerHash) {
          this.db.set("owner", ownerHash);
          this.db.set("settings", { lock_seconds: 900, retention_days: 90 });
        }
      });
    } finally {
      key.fill(0);
    }
  }
  async unlock(pass: string) {
    requireThat(!this.restoring, "maintenance");
    const w = this.db.meta<Wrapped>("wrapped");
    requireThat(w, "setup_required");
    const generation = this.generation;
    let key: Buffer;
    try {
      key = await unwrap(w, pass);
    } catch {
      throw new BrokerError("incorrect_passphrase", 401);
    }
    if (generation !== this.generation || this.restoring) {
      key.fill(0);
      throw new BrokerError("operation_cancelled");
    }
    this.key?.fill(0);
    this.key = key;
    this.deadline =
      Date.now() +
      (this.db.meta<{ lock_seconds: number }>("settings")?.lock_seconds ??
        900) *
        1000;
    this.db.audit("vault_unlocked");
  }
  async lock() {
    this.generation++;
    this.key?.fill(0);
    this.key = undefined;
    this.deadline = 0;
    await this.onLock();
    this.db.audit("vault_locked");
  }
  private getKey() {
    requireThat(this.unlocked, "vault_locked", 423);
    return this.key!;
  }
  encrypt(account: string, value: Credentials) {
    const plaintext = Buffer.from(
      JSON.stringify(credentialsSchema.parse(value)),
    );
    try {
      return JSON.stringify(
        seal(this.getKey(), plaintext, `broker:${account}:credentials:v1`),
      );
    } finally {
      plaintext.fill(0);
    }
  }
  decrypt(account: string, record: string) {
    const b = open(
      this.getKey(),
      JSON.parse(record),
      `broker:${account}:credentials:v1`,
    );
    try {
      return credentialsSchema.parse(JSON.parse(b.toString()));
    } finally {
      b.fill(0);
    }
  }
  async changePassphrase(old: string, next: string) {
    requireThat(!this.restoring, "maintenance");
    const expected = this.db.meta<Wrapped>("wrapped")!;
    let k: Buffer;
    try {
      k = await unwrap(expected, old);
    } catch {
      throw new BrokerError("incorrect_passphrase", 401);
    }
    try {
      const w = await wrap(k, next);
      requireThat(
        !this.restoring &&
          JSON.stringify(this.db.meta("wrapped")) === JSON.stringify(expected),
        "state_changed",
      );
      this.db.set("wrapped", w);
    } finally {
      k.fill(0);
    }
    this.db.audit("vault_passphrase_changed");
  }
  backup() {
    const value = {
      accounts: this.db.all("SELECT * FROM accounts"),
      agents: this.db.all("SELECT * FROM agents"),
      grants: this.db.all("SELECT * FROM grants"),
      settings: this.db.meta("settings"),
    };
    const b = Buffer.from(JSON.stringify(value));
    try {
      return {
        format: "broker-backup-v1" as const,
        wrapped: this.db.meta<Wrapped>("wrapped")!,
        payload: seal(this.getKey(), b, "broker:backup:v1"),
      };
    } finally {
      b.fill(0);
    }
  }
  async restore(input: unknown, pass: string) {
    requireThat(!this.restoring, "maintenance");
    this.restoring = true;
    try {
      await this.restoreData(input, pass);
    } finally {
      this.restoring = false;
    }
  }
  private async restoreData(input: unknown, pass: string) {
    const b = backupSchema.parse(input);
    let key: Buffer;
    try {
      key = await unwrap(b.wrapped, pass);
    } catch {
      throw new BrokerError("invalid_backup_or_passphrase");
    }
    try {
      const plain = open(key, b.payload, "broker:backup:v1");
      let data: ReturnType<typeof restoreData.parse>;
      try {
        data = restoreData.parse(JSON.parse(plain.toString()));
      } finally {
        plain.fill(0);
      }
      for (const a of data.accounts) {
        const p = open(
          key,
          JSON.parse(a.secret),
          `broker:${a.id}:credentials:v1`,
        );
        try {
          credentialsSchema.parse(JSON.parse(p.toString()));
        } finally {
          p.fill(0);
        }
      }
      for (const g of data.grants) {
        const config = grantSchema.parse(JSON.parse(g.config));
        requireThat(
          config.agent_id === g.agent_id &&
            config.account_id === g.account_id &&
            data.accounts.some((a) => a.id === g.account_id) &&
            data.agents.some((a) => a.id === g.agent_id),
          "invalid_backup_or_passphrase",
        );
      }
      await this.lock();
      this.db.tx(() => {
        this.db.raw.exec(
          "DELETE FROM requests; DELETE FROM grants; DELETE FROM agents; DELETE FROM accounts;",
        );
        for (const a of data.accounts)
          this.db.run(
            "INSERT INTO accounts VALUES(?,?,?,?,?,?)",
            a.id,
            a.label,
            a.adapter,
            "unverified",
            a.version + 1,
            a.secret,
          );
        for (const a of data.agents)
          this.db.run(
            "INSERT INTO agents VALUES(?,?,?,?,1)",
            a.id,
            a.label,
            a.verifier,
            a.expires,
          );
        for (const g of data.grants)
          this.db.run(
            "INSERT INTO grants VALUES(?,?,?,?,1,?)",
            g.id,
            g.agent_id,
            g.account_id,
            g.version + 1,
            g.config,
          );
        this.db.set("wrapped", b.wrapped);
        this.db.set("settings", data.settings);
      });
      this.db.audit("backup_restored");
    } catch (e) {
      if (e instanceof BrokerError) throw e;
      throw new BrokerError("invalid_backup_or_passphrase");
    } finally {
      key.fill(0);
    }
  }
}
const restoreData = z
  .object({
    accounts: z
      .array(
        z.object({
          id: z.uuid(),
          label: z.string().max(80),
          adapter: z.literal("test-portal"),
          state: z.string(),
          version: z.number().int(),
          secret: z.string().max(10000),
        }),
      )
      .max(100),
    agents: z
      .array(
        z.object({
          id: z.uuid(),
          label: z.string().max(80),
          verifier: z.string().regex(/^[a-f0-9]{64}$/),
          expires: z.number(),
          revoked: z.number(),
        }),
      )
      .max(100),
    grants: z
      .array(
        z.object({
          id: z.uuid(),
          agent_id: z.uuid(),
          account_id: z.uuid(),
          version: z.number().int(),
          revoked: z.number(),
          config: z.string().max(5000),
        }),
      )
      .max(500),
    settings: z
      .object({
        lock_seconds: z.number().int().min(60).max(86400),
        retention_days: z.number().int().min(1).max(365),
      })
      .strict(),
  })
  .strict();
