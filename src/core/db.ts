import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { GrantInput } from "../shared/schemas.js";
export type Account = {
  id: string;
  label: string;
  adapter: string;
  state: string;
  version: number;
  secret: string;
};
export type Agent = {
  id: string;
  label: string;
  verifier: string;
  expires: number;
  revoked: number;
};
export type Grant = {
  id: string;
  agent_id: string;
  account_id: string;
  version: number;
  revoked: number;
  config: string;
};
export type RequestRow = {
  id: string;
  agent_id: string;
  account_id: string;
  grant_id: string;
  policy_version: number;
  account_version: number;
  idem: string;
  hash: string;
  reason: string;
  status: string;
  deadline: number;
  session_id: string | null;
  code: string | null;
};
export const configOf = (g: Grant) => JSON.parse(g.config) as GrantInput;
export class DB {
  raw: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.raw = new DatabaseSync(path);
    this.raw.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;",
    );
    const v = (
      this.raw.prepare("PRAGMA user_version").get() as { user_version: number }
    ).user_version;
    if (v > 1) throw new Error("database_newer_than_binary");
    if (v === 0)
      this.raw.exec(
        "BEGIN;" +
          readFileSync(resolve("migrations/001_initial.sql"), "utf8") +
          "COMMIT;",
      );
  }
  get<T>(sql: string, ...p: (string | number | null)[]) {
    return this.raw.prepare(sql).get(...p) as T | undefined;
  }
  all<T>(sql: string, ...p: (string | number | null)[]) {
    return this.raw.prepare(sql).all(...p) as T[];
  }
  run(sql: string, ...p: (string | number | null)[]) {
    return this.raw.prepare(sql).run(...p);
  }
  meta<T>(key: string): T | undefined {
    const r = this.get<{ value: string }>(
      "SELECT value FROM meta WHERE key=?",
      key,
    );
    return r ? (JSON.parse(r.value) as T) : undefined;
  }
  set(key: string, value: unknown) {
    this.run(
      "INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      key,
      JSON.stringify(value),
    );
  }
  tx<T>(fn: () => T): T {
    this.raw.exec("BEGIN IMMEDIATE");
    try {
      const r = fn();
      this.raw.exec("COMMIT");
      return r;
    } catch (e) {
      this.raw.exec("ROLLBACK");
      throw e;
    }
  }
  audit(
    event: string,
    actor = "owner",
    target: string | null = null,
    code: string | null = null,
    duration: number | null = null,
  ) {
    this.run(
      "INSERT INTO audit(time,event,actor,target,code,duration_ms) VALUES(?,?,?,?,?,?)",
      Date.now(),
      event,
      actor,
      target,
      code,
      duration,
    );
  }
  close() {
    this.raw.close();
  }
}
