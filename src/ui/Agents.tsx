import { useState } from "react";
import { api, type Snapshot, when } from "./api.js";
import { Empty, Field, Form, Panel, Select, text } from "./primitives.js";
import type { Run } from "./Accounts.js";
const localDateTime = (value: Date) =>
  new Date(value.getTime() - value.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
export function Agents({
  state,
  run,
  busy,
}: {
  state: Snapshot;
  run: Run;
  busy: boolean;
}) {
  const [credential, setCredential] = useState("");
  const future = localDateTime(new Date(Date.now() + 7 * 86400000));
  return (
    <>
      <Panel title="Register an agent">
        <div className="pad">
          <p>
            Each agent gets a separate credential. Grant account access after
            registration.
          </p>
          <Form
            busy={busy}
            onSubmit={(d, f) =>
              run(async () => {
                const r = await api<{ credential: string }>("agents", {
                  label: text(d, "label"),
                  expires: Date.parse(text(d, "expires")),
                });
                setCredential(r.credential);
                f.reset();
              }, "Agent registered. Save its credential privately.")
            }
          >
            <div className="form-grid">
              <Field name="label" label="Agent name" />
              <Field
                name="expires"
                label="Agent expires"
                type="datetime-local"
                value={future}
              />
            </div>
            <button>Register agent</button>
          </Form>
          {credential && (
            <div className="notice">
              <p>
                Shown once. Save to a private file readable only by this agent.
                It will not be shown again after dismissal.
              </p>
              <input
                aria-label="New agent credential"
                type="password"
                readOnly
                value={credential}
              />
              <button
                className="secondary"
                onClick={() => {
                  const blob = new Blob([credential], { type: "text/plain" }),
                    url = URL.createObjectURL(blob),
                    a = document.createElement("a");
                  a.href = url;
                  a.download = "broker-agent-credential.txt";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download credential
              </button>
              <button className="secondary" onClick={() => setCredential("")}>
                Dismiss credential
              </button>
            </div>
          )}
        </div>
      </Panel>
      <Panel title="Agents">
        {!state.agents.length ? (
          <Empty title="No agents registered" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Expires</th>
                  <th>State</th>
                  <th>Controls</th>
                </tr>
              </thead>
              <tbody>
                {state.agents.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.label}
                      <small className="mono">{a.id}</small>
                    </td>
                    <td>{when(a.expires)}</td>
                    <td>
                      {a.revoked
                        ? "Revoked"
                        : a.expires < Date.now()
                          ? "Expired"
                          : "Active"}
                    </td>
                    <td>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(
                              `Rotate ${a.label}'s credential and stop its current sessions?`,
                            )
                          )
                            void run(async () => {
                              const r = await api<{ credential: string }>(
                                `agents/${a.id}/rotate`,
                                {},
                              );
                              setCredential(r.credential);
                            });
                        }}
                      >
                        Rotate credential
                      </button>
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => {
                          if (confirm(`Revoke ${a.label} and stop its tasks?`))
                            void run(() =>
                              api("revoke", {
                                kind: "agent",
                                id: a.id,
                                confirmation: "REVOKE",
                              }),
                            );
                        }}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel title="Create access grant">
        <div className="pad">
          <Form
            busy={busy || !state.vault.unlocked}
            onSubmit={(d, f) =>
              run(async () => {
                await api("grants", {
                  agent_id: text(d, "agent_id"),
                  account_id: text(d, "account_id"),
                  adapter: "test-portal",
                  operation: "read_invoices",
                  starts: Date.parse(text(d, "starts")),
                  expires: Date.parse(text(d, "expires")),
                  max_session_seconds: Number(text(d, "lifetime")) * 60,
                  rate: Number(text(d, "rate")),
                  concurrency: Number(text(d, "concurrency")),
                  approval_required: text(d, "approval") === "yes",
                  from: text(d, "from"),
                  to: text(d, "to"),
                });
                f.reset();
              }, "Access grant saved.")
            }
          >
            <div className="form-grid">
              <Select name="agent_id" label="Agent">
                <option value="">Choose an agent</option>
                {state.agents
                  .filter((a) => !a.revoked && a.expires > Date.now())
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.label}
                    </option>
                  ))}
              </Select>
              <Select name="account_id" label="Account">
                <option value="">Choose a connected account</option>
                {state.accounts
                  .filter((a) => a.state === "connected")
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.label}
                    </option>
                  ))}
              </Select>
              <Field
                name="starts"
                label="Access starts"
                type="datetime-local"
                value={localDateTime(new Date())}
              />
              <Field
                name="expires"
                label="Access expires"
                type="datetime-local"
                value={future}
              />
              <Field
                name="from"
                label="Earliest invoice date"
                type="date"
                value="2026-01-01"
              />
              <Field
                name="to"
                label="Latest invoice date"
                type="date"
                value="2026-12-31"
              />
              <Field
                name="lifetime"
                label="Maximum session minutes (1–60)"
                type="number"
                value={15}
              />
              <Field
                name="rate"
                label="Requests per minute (1–120)"
                type="number"
                value={10}
              />
              <Field
                name="concurrency"
                label="Concurrent sessions (1–3)"
                type="number"
                value={1}
              />
              <Select name="approval" label="Session approval">
                <option value="yes">Ask me each time</option>
                <option value="no">Preapprove within this grant</option>
              </Select>
            </div>
            <p className="muted">
              Permission: read invoice records only. A grant ends no later than
              the agent credential.
            </p>
            <button>Create grant</button>
          </Form>
        </div>
      </Panel>
      <Panel title="Access grants">
        {!state.grants.length ? (
          <Empty title="No permissions granted">
            Agents have no account access until you add a grant.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Agent / Account</th>
                  <th>Permission</th>
                  <th>Expires / Approval</th>
                  <th>Control</th>
                </tr>
              </thead>
              <tbody>
                {state.grants.map((g) => (
                  <tr key={g.id}>
                    <td>
                      {
                        state.agents.find((a) => a.id === g.config.agent_id)
                          ?.label
                      }
                      <small>
                        {
                          state.accounts.find(
                            (a) => a.id === g.config.account_id,
                          )?.label
                        }
                      </small>
                    </td>
                    <td>
                      Read invoices
                      <small>
                        {g.config.from} → {g.config.to}
                      </small>
                    </td>
                    <td>
                      {when(g.config.expires)}
                      <small>
                        {g.revoked
                          ? "Revoked"
                          : g.config.approval_required
                            ? "Owner approval required"
                            : "Preapproved"}
                      </small>
                    </td>
                    <td>
                      <button
                        className="danger"
                        disabled={busy || !!g.revoked}
                        onClick={() => {
                          if (
                            confirm(
                              "Revoke this grant and stop affected tasks?",
                            )
                          )
                            void run(() =>
                              api("revoke", {
                                kind: "grant",
                                id: g.id,
                                confirmation: "REVOKE",
                              }),
                            );
                        }}
                      >
                        Revoke grant
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
