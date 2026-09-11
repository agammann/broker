import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  DB,
  configOf,
  type Account,
  type Agent,
  type Grant,
  type RequestRow,
} from "./db.js";
import { Vault, type Credentials } from "./vault.js";
import {
  digest,
  equal,
  token,
  hashPassword,
  verifyPassword,
} from "./crypto.js";
import { requireThat, safeCode } from "./errors.js";
import { parseTotp } from "./totp.js";
import {
  enrollment,
  grantSchema,
  requestSchema,
  invoiceArgs,
  toolSchemas,
  type ToolName,
  passwordSchema,
  settingsSchema,
} from "../shared/schemas.js";
import type { Adapter, LoginSession } from "../adapters/test-portal.js";
type Session = {
  id: string;
  agent_id: string;
  account_id: string;
  grant_id: string;
  policy_version: number;
  account_version: number;
  expires: number;
  status: string;
  operation: "read_invoices";
  controller: AbortController;
  remote: LoginSession;
  busy: boolean;
};
export class Broker {
  vault: Vault;
  sessions = new Map<string, Session>();
  jobs = new Map<
    string,
    { controller: AbortController; account: string; promise: Promise<void> }
  >();
  private limits = new Map<string, number[]>();
  private maintenance = false;
  constructor(
    public db: DB,
    public adapters: Map<string, Adapter>,
  ) {
    this.vault = new Vault(db, () => this.cancelAll());
    this.db.run(
      "UPDATE requests SET status='failed',code='service_restarted' WHERE status IN ('pending_approval','authenticating','ready')",
    );
  }
  async initialize(password: string, passphrase: string) {
    passwordSchema.parse(password);
    passwordSchema.parse(passphrase);
    requireThat(password !== passphrase, "use_distinct_passphrases");
    requireThat(!this.maintenance, "busy");
    this.maintenance = true;
    try {
      requireThat(!this.db.meta("owner"), "already_initialized");
      const hash = await hashPassword(password);
      await this.vault.initialize(passphrase, hash);
      this.db.audit("owner_initialized");
    } finally {
      this.maintenance = false;
    }
  }
  async login(password: string) {
    const hash = this.db.meta<string>("owner");
    requireThat(hash, "setup_required");
    requireThat(
      await verifyPassword(password, hash),
      "invalid_owner_credentials",
      401,
    );
  }
  authenticate(credential: string): Agent {
    requireThat(
      credential.length >= 40 && credential.length <= 128,
      "invalid_agent",
      401,
    );
    const a = this.db.get<Agent>(
      "SELECT * FROM agents WHERE verifier=?",
      digest(credential),
    );
    requireThat(
      a && !a.revoked && a.expires > Date.now(),
      "invalid_agent",
      401,
    );
    return a;
  }
  private account(id: string) {
    const a = this.db.get<Account>("SELECT * FROM accounts WHERE id=?", id);
    requireThat(a, "not_found", 404);
    return a;
  }
  private grantFor(agent: string, account: string) {
    const gs = this.db.all<Grant>(
      "SELECT * FROM grants WHERE agent_id=? AND account_id=? AND revoked=0",
      agent,
      account,
    );
    const g = gs.find((g) => {
      const c = configOf(g);
      return c.starts <= Date.now() && c.expires > Date.now();
    });
    requireThat(g, "permission_denied");
    return g;
  }
  private check(
    agentId: string,
    accountId: string,
    grantId: string,
    version?: number,
    accountVersion?: number,
  ) {
    requireThat(this.vault.unlocked, "vault_locked", 423);
    requireThat(!this.maintenance, "maintenance");
    const a = this.db.get<Agent>("SELECT * FROM agents WHERE id=?", agentId);
    requireThat(a && !a.revoked && a.expires > Date.now(), "access_revoked");
    const account = this.account(accountId);
    requireThat(account.state === "connected", "account_not_connected");
    if (accountVersion !== undefined)
      requireThat(account.version === accountVersion, "credentials_changed");
    const g = this.db.get<Grant>("SELECT * FROM grants WHERE id=?", grantId);
    requireThat(
      g && !g.revoked && g.agent_id === agentId && g.account_id === accountId,
      "access_revoked",
    );
    const c = configOf(g);
    requireThat(
      c.adapter === account.adapter &&
        c.operation === "read_invoices" &&
        c.starts <= Date.now() &&
        c.expires > Date.now(),
      "permission_expired",
    );
    if (version !== undefined)
      requireThat(g.version === version, "policy_changed");
    return { agent: a, account, grant: g, config: c };
  }
  private rate(key: string, max: number) {
    const now = Date.now(),
      rows = (this.limits.get(key) ?? []).filter((t) => t > now - 60000);
    requireThat(rows.length < max, "rate_limited", 429);
    rows.push(now);
    this.limits.set(key, rows);
  }
  private safeAccount(a: Account) {
    return {
      id: a.id,
      label: a.label,
      adapter: a.adapter,
      state: a.state,
      version: a.version,
    };
  }
  private safeAgent(a: Agent) {
    return {
      id: a.id,
      label: a.label,
      expires: a.expires,
      revoked: !!a.revoked,
    };
  }
  private safeSession(s: Session) {
    return {
      session_id: s.id,
      agent_id: s.agent_id,
      account_id: s.account_id,
      grant_id: s.grant_id,
      operation: s.operation,
      expires: s.expires,
      status: s.status,
    };
  }
  private safeRequest(r: RequestRow) {
    return {
      request_id: r.id,
      account_id: r.account_id,
      status: r.status,
      deadline: r.deadline,
      session_id: r.session_id,
      code: r.code,
    };
  }
  snapshot() {
    return {
      initialized: !!this.db.meta("owner"),
      vault: { unlocked: this.vault.unlocked, locks_at: this.vault.deadline },
      settings: this.db.meta("settings"),
      accounts: this.db
        .all<Account>("SELECT * FROM accounts")
        .map((a) => this.safeAccount(a)),
      agents: this.db
        .all<Agent>("SELECT * FROM agents")
        .map((a) => this.safeAgent(a)),
      grants: this.db
        .all<Grant>("SELECT * FROM grants")
        .map((g) => ({ ...g, config: configOf(g) })),
      approvals: this.db
        .all<RequestRow>(
          "SELECT * FROM requests WHERE status='pending_approval'",
        )
        .map((r) => ({
          ...this.safeRequest(r),
          agent_id: r.agent_id,
          reason: r.reason,
          policy_version: r.policy_version,
        })),
      sessions: [...this.sessions.values()].map((s) => this.safeSession(s)),
      activity: this.db.all("SELECT * FROM audit ORDER BY id DESC LIMIT 100"),
      metrics: this.db.all(
        "SELECT event,code,count(*) AS count,round(avg(duration_ms)) AS mean_ms FROM audit GROUP BY event,code",
      ),
      adapters: [...this.adapters.values()].map((a) => ({
        id: a.id,
        version: a.version,
        verification: "fixture_only",
        unattended: a.id === "test-portal",
        label: "Bundled test portal · synthetic data",
      })),
    };
  }
  async enroll(raw: unknown, id?: string) {
    requireThat(this.vault.unlocked, "vault_locked", 423);
    requireThat(!this.maintenance, "maintenance");
    const data = enrollment.parse(raw);
    requireThat(this.adapters.has(data.adapter), "adapter_unavailable");
    const creds: Credentials = {
      username: data.username,
      password: data.password,
      totp: parseTotp(data.totp),
    };
    const accountId = id ?? randomUUID();
    if (id) {
      this.account(id);
      await this.invalidate("account", id, "credentials_changed");
    } else
      requireThat(
        this.db.all("SELECT id FROM accounts").length < 100,
        "resource_limit",
      );
    const old = id ? this.account(id) : undefined;
    this.db.run(
      "INSERT INTO accounts VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,adapter=excluded.adapter,state=excluded.state,version=excluded.version,secret=excluded.secret",
      accountId,
      data.label,
      data.adapter,
      "unverified",
      (old?.version ?? 0) + 1,
      this.vault.encrypt(accountId, creds),
    );
    this.db.audit("account_enrolled", "owner", accountId);
    return this.safeAccount(this.account(accountId));
  }
  async verifyAccount(id: string) {
    const a = this.account(id);
    requireThat(this.vault.unlocked, "vault_locked", 423);
    requireThat(!this.jobs.has("verify:" + id), "busy");
    requireThat(this.jobs.size < 3, "busy");
    const adapter = this.adapters.get(a.adapter);
    requireThat(adapter, "adapter_unavailable");
    const controller = new AbortController(),
      generation = this.vault.generation;
    const timer = setTimeout(() => controller.abort(), 60000);
    let result: unknown;
    const promise = (async () => {
      let remote: LoginSession | undefined;
      try {
        remote = await adapter.connect(
          this.vault.decrypt(a.id, a.secret),
          controller.signal,
        );
        requireThat(
          this.vault.unlocked &&
            generation === this.vault.generation &&
            this.account(id).version === a.version &&
            !controller.signal.aborted,
          "operation_cancelled",
        );
        this.db.run("UPDATE accounts SET state='connected' WHERE id=?", id);
        this.db.audit("account_verified", "owner", id);
        result = this.safeAccount(this.account(id));
      } catch (e) {
        if (this.account(id).version === a.version)
          this.db.run(
            "UPDATE accounts SET state='needs_attention' WHERE id=?",
            id,
          );
        this.db.audit("authentication_failed", "owner", id, safeCode(e));
        throw e;
      } finally {
        clearTimeout(timer);
        await remote?.close();
        this.jobs.delete("verify:" + id);
      }
    })();
    this.jobs.set("verify:" + id, { controller, account: id, promise });
    await promise;
    return result;
  }
  registerAgent(raw: unknown) {
    const v = z
      .object({
        label: z.string().trim().min(1).max(80),
        expires: z.number().int().positive(),
      })
      .strict()
      .parse(raw);
    requireThat(
      v.expires > Date.now() && v.expires <= Date.now() + 366 * 86400000,
      "invalid_expiration",
    );
    requireThat(
      this.db.all("SELECT id FROM agents").length < 100,
      "resource_limit",
    );
    const credential = token(),
      id = randomUUID();
    this.db.run(
      "INSERT INTO agents VALUES(?,?,?,?,0)",
      id,
      v.label,
      digest(credential),
      v.expires,
    );
    this.db.audit("agent_registered", "owner", id);
    return {
      agent: this.safeAgent(
        this.db.get<Agent>("SELECT * FROM agents WHERE id=?", id)!,
      ),
      credential,
    };
  }
  async rotateAgent(id: string) {
    const a = this.db.get<Agent>("SELECT * FROM agents WHERE id=?", id);
    requireThat(a, "not_found", 404);
    requireThat(a.expires > Date.now(), "agent_expired");
    await this.invalidate("agent", id, "agent_rotated");
    const credential = token();
    this.db.run(
      "UPDATE agents SET verifier=?,revoked=0 WHERE id=?",
      digest(credential),
      id,
    );
    this.db.audit("agent_rotated", "owner", id);
    return { credential };
  }
  async putGrant(raw: unknown, id?: string) {
    const c = grantSchema.parse(raw);
    requireThat(
      c.expires > Date.now() && c.expires <= Date.now() + 366 * 86400000,
      "invalid_expiration",
    );
    const account = this.account(c.account_id);
    requireThat(
      account.state === "connected" && account.adapter === c.adapter,
      "account_not_connected",
    );
    const agent = this.db.get<Agent>(
      "SELECT * FROM agents WHERE id=?",
      c.agent_id,
    );
    requireThat(
      agent && !agent.revoked && agent.expires >= c.expires,
      "invalid_agent_expiration",
    );
    const other = this.db.get<Grant>(
      "SELECT * FROM grants WHERE agent_id=? AND account_id=? AND revoked=0 AND id!=?",
      c.agent_id,
      c.account_id,
      id ?? "",
    );
    requireThat(!other, "grant_already_exists");
    let version = 1;
    if (id) {
      const old = this.db.get<Grant>("SELECT * FROM grants WHERE id=?", id);
      requireThat(old, "not_found", 404);
      version = old.version + 1;
      await this.invalidate("grant", id, "policy_changed");
    } else
      requireThat(
        this.db.all("SELECT id FROM grants").length < 500,
        "resource_limit",
      );
    const grantId = id ?? randomUUID();
    this.db.run(
      "INSERT INTO grants VALUES(?,?,?,?,0,?) ON CONFLICT(id) DO UPDATE SET agent_id=excluded.agent_id,account_id=excluded.account_id,version=excluded.version,revoked=0,config=excluded.config",
      grantId,
      c.agent_id,
      c.account_id,
      version,
      JSON.stringify(c),
    );
    this.db.audit("grant_saved", "owner", grantId);
    return { id: grantId, version };
  }
  async approve(id: string, decision: boolean) {
    const r = this.db.get<RequestRow>("SELECT * FROM requests WHERE id=?", id);
    requireThat(r, "not_found", 404);
    requireThat(
      r.status === "pending_approval" && r.deadline > Date.now(),
      "approval_expired_or_consumed",
    );
    this.check(
      r.agent_id,
      r.account_id,
      r.grant_id,
      r.policy_version,
      r.account_version,
    );
    if (!decision) {
      this.db.run(
        "UPDATE requests SET status='denied',code='owner_denied' WHERE id=?",
        id,
      );
      this.db.audit("approval_denied", "owner", id);
      return { status: "denied" };
    }
    requireThat(
      this.jobs.size < 3 && this.sessions.size + this.jobs.size < 12,
      "busy",
    );
    const updated = this.db.run(
      "UPDATE requests SET status='authenticating' WHERE id=? AND status='pending_approval' AND deadline>?",
      id,
      Date.now(),
    );
    requireThat(updated.changes === 1, "approval_expired_or_consumed");
    this.db.audit("approval_consumed", "owner", id);
    this.start(r.id);
    return this.safeRequest(
      this.db.get<RequestRow>("SELECT * FROM requests WHERE id=?", id)!,
    );
  }
  private start(id: string) {
    const r = this.db.get<RequestRow>("SELECT * FROM requests WHERE id=?", id)!;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.max(1, Math.min(60000, r.deadline - Date.now())),
    );
    const start = Date.now();
    const promise = (async () => {
      let remote: LoginSession | undefined;
      try {
        const before = this.check(
          r.agent_id,
          r.account_id,
          r.grant_id,
          r.policy_version,
          r.account_version,
        );
        requireThat(r.deadline > Date.now(), "request_expired");
        const adapter = this.adapters.get(before.account.adapter);
        requireThat(adapter, "adapter_unavailable");
        this.db.audit("task_attempt", r.agent_id, id);
        remote = await adapter.connect(
          this.vault.decrypt(before.account.id, before.account.secret),
          controller.signal,
        );
        const current = this.check(
          r.agent_id,
          r.account_id,
          r.grant_id,
          r.policy_version,
          r.account_version,
        );
        const latest = this.db.get<RequestRow>(
          "SELECT * FROM requests WHERE id=?",
          id,
        )!;
        requireThat(
          !controller.signal.aborted &&
            latest.status === "authenticating" &&
            r.deadline > Date.now(),
          "operation_cancelled",
        );
        requireThat(this.sessions.size < 12, "busy", 429);
        const sessionId = randomUUID();
        const expires = Math.min(
          Date.now() + current.config.max_session_seconds * 1000,
          current.config.expires,
          current.agent.expires,
          this.vault.deadline,
        );
        this.sessions.set(sessionId, {
          id: sessionId,
          agent_id: r.agent_id,
          account_id: r.account_id,
          grant_id: r.grant_id,
          policy_version: r.policy_version,
          account_version: r.account_version,
          expires,
          status: "active",
          operation: "read_invoices",
          controller,
          remote,
          busy: false,
        });
        remote = undefined;
        this.db.run(
          "UPDATE requests SET status='ready',session_id=? WHERE id=?",
          sessionId,
          id,
        );
        this.db.audit(
          "authentication_completed",
          r.agent_id,
          id,
          null,
          Date.now() - start,
        );
      } catch (e) {
        const code = safeCode(e);
        this.db.run(
          "UPDATE requests SET status='failed',code=? WHERE id=? AND status='authenticating'",
          code,
          id,
        );
        this.db.audit(
          code === "human_action_required"
            ? "unexpected_human_interruption"
            : "authentication_failed",
          r.agent_id,
          id,
          code,
          Date.now() - start,
        );
        if (
          [
            "incorrect_credentials",
            "human_action_required",
            "account_lockout",
            "changed_website_layout",
            "identity_verification_failed",
          ].includes(code)
        )
          this.db.run(
            "UPDATE accounts SET state='needs_attention' WHERE id=? AND version=?",
            r.account_id,
            r.account_version,
          );
      } finally {
        clearTimeout(timer);
        await remote?.close();
        this.jobs.delete(id);
      }
    })();
    this.jobs.set(id, { controller, account: r.account_id, promise });
  }
  private session(agent: string, id: string) {
    const s = this.sessions.get(id);
    requireThat(s && s.agent_id === agent, "not_found", 404);
    requireThat(
      s.status === "active" && s.expires > Date.now(),
      "session_expired",
    );
    this.check(
      s.agent_id,
      s.account_id,
      s.grant_id,
      s.policy_version,
      s.account_version,
    );
    return s;
  }
  async tool(
    credential: string,
    name: ToolName,
    raw: unknown,
  ): Promise<unknown> {
    const agent = this.authenticate(credential);
    requireThat(Object.hasOwn(toolSchemas, name), "unknown_operation");
    const args = toolSchemas[name].parse(raw);
    switch (name) {
      case "broker.list_accounts":
        return {
          accounts: this.db
            .all<Account>("SELECT * FROM accounts WHERE state='connected'")
            .filter((a) => {
              try {
                this.grantFor(agent.id, a.id);
                return true;
              } catch {
                return false;
              }
            })
            .map((a) => ({
              ...this.safeAccount(a),
              operation: "read_invoices",
            })),
        };
      case "broker.request_session": {
        const p = requestSchema.parse(args);
        const hash = digest(JSON.stringify(p));
        const existing = this.db.get<RequestRow>(
          "SELECT * FROM requests WHERE agent_id=? AND idem=?",
          agent.id,
          p.idempotency_key,
        );
        if (existing) {
          requireThat(equal(existing.hash, hash), "idempotency_conflict", 409);
          return this.safeRequest(existing);
        }
        const g = this.grantFor(agent.id, p.account_id),
          { account, config } = this.check(agent.id, p.account_id, g.id);
        this.rate("request:" + g.id, config.rate);
        requireThat(
          this.jobs.size < 3 && this.sessions.size + this.jobs.size < 12,
          "busy",
          429,
        );
        const inflight =
          this.db
            .all<RequestRow>(
              "SELECT * FROM requests WHERE grant_id=? AND status IN ('pending_approval','authenticating')",
              g.id,
            )
            .filter((r) => r.deadline > Date.now()).length +
          [...this.sessions.values()].filter((s) => s.grant_id === g.id).length;
        requireThat(inflight < config.concurrency, "concurrency_limited", 429);
        requireThat(
          this.db.all(
            "SELECT id FROM requests WHERE status IN ('pending_approval','authenticating')",
          ).length < 50,
          "queue_full",
          429,
        );
        const id = randomUUID(),
          deadline = Math.min(
            Date.now() + (config.approval_required ? 300000 : 60000),
            config.expires,
            agent.expires,
            this.vault.deadline,
          );
        this.db.run(
          "INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          id,
          agent.id,
          p.account_id,
          g.id,
          g.version,
          account.version,
          p.idempotency_key,
          hash,
          p.reason,
          config.approval_required ? "pending_approval" : "authenticating",
          deadline,
          null,
          null,
        );
        this.db.audit(
          config.approval_required
            ? "configured_approval_requested"
            : "session_requested",
          agent.id,
          id,
        );
        if (!config.approval_required) this.start(id);
        return this.safeRequest(
          this.db.get<RequestRow>("SELECT * FROM requests WHERE id=?", id)!,
        );
      }
      case "broker.get_request": {
        const { request_id } = args as { request_id: string };
        const r = this.db.get<RequestRow>(
          "SELECT * FROM requests WHERE id=? AND agent_id=?",
          request_id,
          agent.id,
        );
        requireThat(r, "not_found", 404);
        return this.safeRequest(r);
      }
      case "broker.get_session":
        return this.safeSession(
          this.session(agent.id, (args as { session_id: string }).session_id),
        );
      case "broker.close_session": {
        const s = this.sessions.get(
          (args as { session_id: string }).session_id,
        );
        requireThat(s && s.agent_id === agent.id, "not_found", 404);
        return this.close(s, "agent_closed");
      }
      case "broker.read_invoices": {
        const p = invoiceArgs.parse(args),
          s = this.session(agent.id, p.session_id);
        const { config } = this.check(
          s.agent_id,
          s.account_id,
          s.grant_id,
          s.policy_version,
          s.account_version,
        );
        requireThat(
          p.from >= config.from && p.to <= config.to,
          "parameters_denied",
        );
        requireThat(!s.busy, "session_busy", 429);
        this.rate("read:" + s.grant_id, config.rate);
        s.busy = true;
        const start = Date.now();
        this.db.audit("operation_attempt", agent.id, s.id);
        const timer = setTimeout(() => s.controller.abort(), 30000);
        try {
          this.session(agent.id, s.id);
          const data = await s.remote.read(p);
          this.session(agent.id, s.id);
          requireThat(!s.controller.signal.aborted, "operation_cancelled");
          this.db.audit(
            "operation_completed",
            agent.id,
            s.id,
            null,
            Date.now() - start,
          );
          return data;
        } catch (e) {
          this.db.audit(
            "operation_failed",
            agent.id,
            s.id,
            safeCode(e),
            Date.now() - start,
          );
          await this.close(s, "operation_failed");
          throw e;
        } finally {
          clearTimeout(timer);
          s.busy = false;
        }
      }
    }
  }
  async close(s: Session, reason: string) {
    if (s.status !== "active")
      return { status: "closed", remote_logout: "not_confirmed" };
    s.status = "closed";
    this.sessions.delete(s.id);
    this.db.run(
      "UPDATE requests SET status='closed',code=? WHERE session_id=?",
      reason,
      s.id,
    );
    if (s.busy) s.controller.abort();
    const confirmed = await s.remote.close().catch(() => false);
    s.controller.abort();
    this.db.audit(
      "session_closed",
      s.agent_id,
      s.id,
      confirmed ? "remote_logout_confirmed" : "local_only",
    );
    return {
      status: "closed",
      remote_logout: confirmed ? "confirmed" : "not_confirmed",
    };
  }
  async invalidate(
    kind: "account" | "agent" | "grant",
    id: string,
    reason = "owner_revoked",
  ) {
    // Synchronous deny happens before awaiting browser cleanup.
    if (kind === "account")
      this.db.run(
        "UPDATE accounts SET state='disabled',version=version+1 WHERE id=?",
        id,
      );
    if (kind === "agent")
      this.db.run("UPDATE agents SET revoked=1 WHERE id=?", id);
    if (kind === "grant")
      this.db.run(
        "UPDATE grants SET revoked=1,version=version+1 WHERE id=?",
        id,
      );
    const column = kind + "_id";
    const requests = this.db.all<RequestRow>(
      `SELECT * FROM requests WHERE ${column}=?`,
      id,
    );
    for (const r of requests) {
      this.db.run(
        "UPDATE requests SET status='revoked',code=? WHERE id=? AND status IN ('pending_approval','authenticating','ready')",
        reason,
        r.id,
      );
      this.jobs.get(r.id)?.controller.abort();
    }
    if (kind === "account") this.jobs.get("verify:" + id)?.controller.abort();
    const targets = [...this.sessions.values()].filter(
      (s) => s[column as "account_id" | "agent_id" | "grant_id"] === id,
    );
    const results = await Promise.all(
      targets.map((s) => this.close(s, reason)),
    );
    this.db.audit(kind + "_revoked", "owner", id);
    return { local_access: "revoked", sessions: results };
  }
  async deleteAccount(id: string) {
    requireThat(!this.jobs.has("verify:" + id), "busy");
    await this.invalidate("account", id);
    this.db.tx(() => {
      this.db.run("DELETE FROM requests WHERE account_id=?", id);
      this.db.run("DELETE FROM grants WHERE account_id=?", id);
      this.db.run("DELETE FROM accounts WHERE id=?", id);
    });
    this.db.audit("account_deleted", "owner", id);
  }
  async cancelAll() {
    this.db.run(
      "UPDATE requests SET status='revoked',code='vault_locked' WHERE status IN ('pending_approval','authenticating','ready')",
    );
    for (const j of this.jobs.values()) j.controller.abort();
    await Promise.all(
      [...this.sessions.values()].map((s) => this.close(s, "vault_locked")),
    );
    await Promise.allSettled([...this.jobs.values()].map((j) => j.promise));
  }
  async restore(backup: unknown, pass: string) {
    requireThat(!this.maintenance, "busy");
    this.maintenance = true;
    try {
      await this.vault.restore(backup, pass);
    } finally {
      this.maintenance = false;
    }
  }
  settings(raw: unknown) {
    const s = settingsSchema.parse(raw);
    this.db.set("settings", s);
    if (this.vault.unlocked)
      this.vault.deadline = Math.min(
        this.vault.deadline,
        Date.now() + s.lock_seconds * 1000,
      );
    this.db.audit("settings_changed");
    return s;
  }
  async cleanup() {
    if (this.vault.deadline && Date.now() >= this.vault.deadline)
      await this.vault.lock();
    for (const s of [...this.sessions.values()]) {
      try {
        this.session(s.agent_id, s.id);
      } catch {
        await this.close(s, "expired_or_revoked");
      }
    }
    this.db.run(
      "UPDATE requests SET status='expired',code='request_expired' WHERE deadline<=? AND status='pending_approval'",
      Date.now(),
    );
    const days =
      this.db.meta<{ retention_days: number }>("settings")?.retention_days ??
      90;
    this.db.run("DELETE FROM audit WHERE time<?", Date.now() - days * 86400000);
    this.db.run(
      "DELETE FROM requests WHERE deadline<? AND status NOT IN ('authenticating','ready')",
      Date.now() - days * 86400000,
    );
    for (const [k, v] of this.limits)
      if (v.every((t) => t < Date.now() - 60000)) this.limits.delete(k);
  }
  async shutdown() {
    await this.vault.lock();
    this.db.close();
  }
}
