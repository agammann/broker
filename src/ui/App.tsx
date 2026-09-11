import { useCallback, useEffect, useState } from "react";
import { api, type Snapshot, when } from "./api.js";
import { Auth } from "./Auth.js";
import { Accounts, type Run } from "./Accounts.js";
import { Agents } from "./Agents.js";
import { Maintenance } from "./Maintenance.js";
import { Empty, Panel } from "./primitives.js";
const pages = [
  "Overview",
  "Accounts",
  "Agents & grants",
  "Approvals",
  "Sessions",
  "Activity",
  "Vault & maintenance",
] as const;
function Activity({ state }: { state: Snapshot }) {
  return (
    <Panel title="Recent activity">
      {!state.activity.length ? (
        <Empty title="Activity will appear here as you configure Broker." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {state.activity.map((a) => (
                <tr key={a.id}>
                  <td>{when(a.time)}</td>
                  <td>{a.event.replaceAll("_", " ")}</td>
                  <td>
                    {a.code?.replaceAll("_", " ") ?? "—"}
                    <small>
                      {a.actor === "owner"
                        ? "Owner"
                        : (state.agents.find((agent) => agent.id === a.actor)
                            ?.label ?? "Agent")}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
export function App() {
  const [auth, setAuth] = useState<{
      initialized: boolean;
      authenticated: boolean;
    }>(),
    [state, setState] = useState<Snapshot>(),
    [page, setPage] = useState<(typeof pages)[number]>("Overview"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const refreshAuth = useCallback(() => {
    void api<{ initialized: boolean; authenticated: boolean }>("status")
      .then(setAuth)
      .catch((e) => setError(e.message));
  }, []);
  const refresh = useCallback(async () => {
    try {
      setState(await api<Snapshot>("state"));
    } catch (e) {
      setError((e as Error).message);
      refreshAuth();
    }
  }, [refreshAuth]);
  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);
  useEffect(() => {
    if (!auth?.authenticated) return;
    void refresh();
    const t = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [auth?.authenticated, refresh]);
  const run: Run = async (fn, success) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(success ?? "Changes saved.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!auth)
    return (
      <main className="auth" role="status">
        {error || "Loading Broker…"}
      </main>
    );
  if (!auth.authenticated)
    return <Auth initialized={auth.initialized} onDone={refreshAuth} />;
  if (!state)
    return (
      <main className="auth" role="status">
        {error || "Loading account access…"}
      </main>
    );
  const accountLabel = (id: string) =>
      state.accounts.find((a) => a.id === id)?.label ?? "Deleted account",
    agentLabel = (id: string) =>
      state.agents.find((a) => a.id === id)?.label ?? "Revoked agent";
  const active = state.grants.filter(
    (g) =>
      !g.revoked &&
      g.config.starts <= Date.now() &&
      g.config.expires > Date.now() &&
      state.agents.some(
        (a) =>
          a.id === g.config.agent_id && !a.revoked && a.expires > Date.now(),
      ) &&
      state.accounts.some(
        (a) => a.id === g.config.account_id && a.state === "connected",
      ),
  );
  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to main content
      </a>
      <aside>
        <a className="brand" href="/">
          ◈ <strong>Broker</strong>
        </a>
        <nav aria-label="Main navigation">
          {pages.map((p, i) => (
            <button
              key={p}
              className={page === p ? "selected" : ""}
              aria-current={page === p ? "page" : undefined}
              onClick={() => {
                setPage(p);
                setNotice("");
              }}
            >
              <span aria-hidden="true">
                {["⌂", "▤", "♧", "✓", "›_", "▧", "⚙"][i]}
              </span>
              {p}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          Self-hosted · Single owner
          <button
            className="secondary"
            onClick={() =>
              void run(async () => {
                await api("logout", {});
                setState(undefined);
                refreshAuth();
              })
            }
          >
            Sign out
          </button>
        </div>
      </aside>
      <main id="main">
        <header>
          <div>
            <h1>{page}</h1>
            <p>
              {page === "Overview"
                ? "Give your agents the access they need, with control you keep."
                : "Manage the access you authorize."}
            </p>
          </div>
          <div className="header-actions">
            <span>
              {state.vault.unlocked ? "◉ Vault unlocked" : "♙ Vault locked"}
            </span>
            <button onClick={() => setPage("Vault & maintenance")}>
              {state.vault.unlocked ? "Manage vault" : "Unlock vault"}
            </button>
          </div>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}
            <button
              className="secondary"
              onClick={() => {
                setError("");
                void refresh();
              }}
            >
              Retry
            </button>
          </div>
        )}
        {notice && (
          <div className="success" role="status">
            {notice}
          </div>
        )}
        {busy && (
          <div role="status" className="working">
            Working… Account authentication can take up to a minute.
          </div>
        )}
        {!state.vault.unlocked && (
          <div className="vault-banner">
            <span aria-hidden="true">⚠</span>
            <div>
              <strong>Your vault is locked</strong>
              <p>Unlock to connect accounts and run authorized tasks.</p>
            </div>
          </div>
        )}
        {page === "Overview" && (
          <>
            <div className="stats">
              <div>
                <strong>
                  {state.accounts.filter((a) => a.state === "connected").length}
                </strong>
                <span>Connected accounts</span>
              </div>
              <div>
                <strong>{active.length}</strong>
                <span>Active grants</span>
              </div>
              <div>
                <strong>{state.sessions.length}</strong>
                <span>Open sessions</span>
              </div>
            </div>
            <Panel
              title="Account access"
              action={
                <button onClick={() => setPage("Accounts")}>
                  Connect account
                </button>
              }
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Agent</th>
                      <th>Permission</th>
                      <th>Expires</th>
                    </tr>
                  </thead>
                  {active.length > 0 && (
                    <tbody>
                      {active.map((g) => (
                        <tr key={g.id}>
                          <td>{accountLabel(g.config.account_id)}</td>
                          <td>{agentLabel(g.config.agent_id)}</td>
                          <td>Read invoices</td>
                          <td>{when(g.config.expires)}</td>
                        </tr>
                      ))}
                    </tbody>
                  )}
                </table>
              </div>
              {!active.length && (
                <Empty
                  title={
                    state.accounts.length
                      ? "No active account access"
                      : "No accounts connected"
                  }
                  action={
                    <button
                      onClick={() =>
                        setPage(
                          state.accounts.length
                            ? "Agents & grants"
                            : "Accounts",
                        )
                      }
                    >
                      {state.accounts.length
                        ? "Create access grant"
                        : "Connect account"}
                    </button>
                  }
                >
                  Connect an account, then choose who can use it.
                </Empty>
              )}
            </Panel>
            <Activity state={state} />
          </>
        )}
        {page === "Accounts" && (
          <Accounts state={state} run={run} busy={busy} />
        )}
        {page === "Agents & grants" && (
          <Agents state={state} run={run} busy={busy} />
        )}
        {page === "Approvals" && (
          <Panel title="Session approvals">
            {!state.approvals.length ? (
              <Empty title="No requests waiting for approval">
                Requests needing your decision will appear here.
              </Empty>
            ) : (
              state.approvals.map((r) => (
                <article className="pad request" key={r.request_id}>
                  <h3>
                    {agentLabel(r.agent_id)} → {accountLabel(r.account_id)}
                  </h3>
                  <p>
                    Read invoices · policy version {r.policy_version} · decide
                    by {when(r.deadline)}
                  </p>
                  <p className="muted">
                    Agent-provided reason (untrusted text):
                  </p>
                  <blockquote>{r.reason}</blockquote>
                  <button
                    disabled={busy || r.deadline < Date.now()}
                    onClick={() =>
                      void run(
                        () =>
                          api(`approvals/${r.request_id}`, { approve: true }),
                        "Exact request approved once.",
                      )
                    }
                  >
                    Approve once
                  </button>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          api(`approvals/${r.request_id}`, { approve: false }),
                        "Request denied.",
                      )
                    }
                  >
                    Deny
                  </button>
                </article>
              ))
            )}
          </Panel>
        )}
        {page === "Sessions" && (
          <Panel title="Broker-controlled sessions">
            {!state.sessions.length ? (
              <Empty title="No open sessions">
                Sessions open only for an authorized agent request.
              </Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Agent / Account</th>
                      <th>Operation</th>
                      <th>Expires</th>
                      <th>Control</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.sessions.map((s) => (
                      <tr key={s.session_id}>
                        <td>
                          {agentLabel(s.agent_id)}
                          <small>{accountLabel(s.account_id)}</small>
                        </td>
                        <td>Read invoices</td>
                        <td>{when(s.expires)}</td>
                        <td>
                          <button
                            className="danger"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () =>
                                  api("close-session", { id: s.session_id }),
                                "Local session closed. Check activity for remote logout confirmation.",
                              )
                            }
                          >
                            Close session
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}
        {page === "Activity" && (
          <>
            <Activity state={state} />
            <Panel title="Local operational metrics">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Category</th>
                      <th>Count</th>
                      <th>Mean latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.metrics.map((m, i) => (
                      <tr key={i}>
                        <td>{m.event.replaceAll("_", " ")}</td>
                        <td>{m.code ?? "—"}</td>
                        <td>{m.count}</td>
                        <td>{m.mean_ms === null ? "—" : m.mean_ms + " ms"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}
        {page === "Vault & maintenance" && (
          <Maintenance
            state={state}
            run={run}
            busy={busy}
            refreshAuth={refreshAuth}
          />
        )}
        <footer>Real portal compatibility requires verification.</footer>
      </main>
    </div>
  );
}
